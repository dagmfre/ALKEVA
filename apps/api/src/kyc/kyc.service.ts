import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { auditLogs, kycSubmissions, users, type Db } from "@alkeva/db";
import type { KycDocType, KycMeResponse, KycStatus } from "@alkeva/shared";
import { DB } from "../core/core.module.js";
import { NotificationsService } from "../notifications/notifications.service.js";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export interface UploadedDoc {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

/**
 * KYC — Phase 4.3. Documents live in the DB row (≤2 MB); approval flips
 * user.kyc_tier to 1, which is the gate deposits/withdrawals/trading check.
 * Review itself is a compliance-role action (admin module calls into here).
 */
@Injectable()
export class KycService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly notifications: NotificationsService,
  ) {}

  async submit(userId: string, docType: KycDocType, file: UploadedDoc): Promise<KycMeResponse> {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
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

    return {
      kycTier: user.kycTier,
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
