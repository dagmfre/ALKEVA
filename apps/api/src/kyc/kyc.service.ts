import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  auditLogs,
  identityVerifications,
  kycSubmissions,
  users,
  type Db,
} from "@alkeva/db";
import type { Env, KycDocType, KycMeResponse, KycStatus } from "@alkeva/shared";
import { DB, ENV } from "../core/core.module.js";
import { NotificationsService } from "../notifications/notifications.service.js";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * The browser's declared MIME type is a claim, not a fact. Each allowed type
 * must also START with its real file signature, so a script renamed to
 * passport.png is refused before it is stored or ever served to a reviewer.
 */
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  "image/jpeg": (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) =>
    b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (b) =>
    b.length > 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  "application/pdf": (b) => b.length > 5 && b.subarray(0, 5).toString("ascii") === "%PDF-",
};

export interface UploadedDoc {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

/**
 * KYC. Since Phase 10 the identity check is Fayda (auth/fayda.service.ts).
 * The manual document upload below is kept but OFF unless KYC_METHODS
 * includes "document"; when on, documents live in the DB row (≤2 MB) and a
 * compliance approval flips kyc_tier to 1.
 */
@Injectable()
export class KycService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly notifications: NotificationsService,
  ) {}

  get documentEnabled(): boolean {
    return this.env.KYC_METHODS.includes("document");
  }

  async submit(userId: string, docType: KycDocType, file: UploadedDoc): Promise<KycMeResponse> {
    if (!this.documentEnabled) throw new NotFoundException("kyc_method_disabled");
    const roleRows = await this.db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (roleRows[0]?.role !== "user") throw new ForbiddenException("staff_account");
    const signatureOk = SIGNATURES[file.mimetype];
    if (!signatureOk || !signatureOk(file.buffer)) {
      throw new BadRequestException("unsupported_file_type");
    }
    if (file.size > MAX_FILE_BYTES || file.buffer.length > MAX_FILE_BYTES) {
      throw new BadRequestException("file_too_large");
    }

    const pending = await this.db
      .select({ id: kycSubmissions.id })
      .from(kycSubmissions)
      .where(and(eq(kycSubmissions.userId, userId), eq(kycSubmissions.status, "pending")))
      .limit(1);
    if (pending.length > 0) throw new ConflictException("kyc_pending_exists");

    const inserted = await this.db
      .insert(kycSubmissions)
      .values({
        userId,
        docType,
        fileRef: file.originalname.slice(0, 200),
        fileData: file.buffer,
        fileMime: file.mimetype,
      })
      .returning({ id: kycSubmissions.id });

    await this.db.insert(auditLogs).values({
      actorId: userId,
      actorLabel: `user:${userId}`,
      action: "kyc_submitted",
      targetType: "kyc_submission",
      targetId: inserted[0]?.id,
      after: { docType, fileName: file.originalname, bytes: file.size },
    });

    return this.me(userId);
  }

  async me(userId: string): Promise<KycMeResponse> {
    const userRows = await this.db
      .select({ kycTier: users.kycTier })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const user = userRows[0];
    if (!user) throw new NotFoundException("user_not_found");

    const rows = await this.db
      .select({
        id: kycSubmissions.id,
        docType: kycSubmissions.docType,
        status: kycSubmissions.status,
        reviewNote: kycSubmissions.reviewNote,
        createdAt: kycSubmissions.createdAt,
        reviewedAt: kycSubmissions.reviewedAt,
      })
      .from(kycSubmissions)
      .where(eq(kycSubmissions.userId, userId))
      .orderBy(desc(kycSubmissions.createdAt))
      .limit(1);
    const latest = rows[0];

    const idv = await this.db
      .select({
        legalName: identityVerifications.legalName,
        verifiedAt: identityVerifications.verifiedAt,
      })
      .from(identityVerifications)
      .where(eq(identityVerifications.userId, userId))
      .limit(1);

    return {
      kycTier: user.kycTier,
      methods: {
        fayda:
          this.env.KYC_METHODS.includes("fayda") &&
          this.env.FAYDA_CLIENT_ID.length > 0 &&
          this.env.FAYDA_PRIVATE_KEY.length > 0,
        document: this.documentEnabled,
      },
      identity: idv[0]
        ? {
            provider: "fayda",
            legalName: idv[0].legalName,
            verifiedAt: idv[0].verifiedAt.toISOString(),
          }
        : null,
      submission: latest
        ? {
            id: latest.id,
            docType: latest.docType as KycDocType,
            status: latest.status as KycStatus,
            reviewNote: latest.reviewNote,
            createdAt: latest.createdAt.toISOString(),
            reviewedAt: latest.reviewedAt ? latest.reviewedAt.toISOString() : null,
          }
        : null,
    };
  }

  // ── staff paths (admin module, compliance role) ─────────────────

  async review(
    submissionId: string,
    reviewerId: string,
    decision: "approved" | "rejected",
    note?: string,
  ): Promise<void> {
    // Conditional update = double-click mutex; only pending rows can move.
    const claimed = await this.db
      .update(kycSubmissions)
      .set({
        status: decision,
        reviewerId,
        reviewNote: note ?? null,
        reviewedAt: sql`now()`,
      })
      .where(and(eq(kycSubmissions.id, submissionId), eq(kycSubmissions.status, "pending")))
      .returning({ userId: kycSubmissions.userId });
    const row = claimed[0];
    if (!row) throw new ConflictException("kyc_not_pending");

    if (decision === "approved") {
      await this.db
        .update(users)
        .set({ kycTier: sql`greatest(${users.kycTier}, 1)` })
        .where(eq(users.id, row.userId));
    }

    await this.db.insert(auditLogs).values({
      actorId: reviewerId,
      actorLabel: `staff:${reviewerId}`,
      action: `kyc_${decision}`,
      targetType: "kyc_submission",
      targetId: submissionId,
      after: { note: note ?? null },
    });

    void this.notifications.emit(
      row.userId,
      decision === "approved" ? "kyc_approved" : "kyc_rejected",
      note ? { note } : {},
    );
  }

  async file(submissionId: string): Promise<{ data: Buffer; mime: string }> {
    const rows = await this.db
      .select({ fileData: kycSubmissions.fileData, fileMime: kycSubmissions.fileMime })
      .from(kycSubmissions)
      .where(eq(kycSubmissions.id, submissionId))
      .limit(1);
    const row = rows[0];
    if (!row?.fileData) throw new NotFoundException("kyc_file_not_found");
    return { data: row.fileData, mime: row.fileMime ?? "application/octet-stream" };
  }
}
