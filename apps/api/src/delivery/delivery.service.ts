import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import { auditLogs, deliveryRequests, users, type Db } from "@alkeva/db";
import type {
  AdminDeliveryItem,
  CreateDeliveryDto,
  DeliveryItem,
  DeliveryListResponse,
  DeliveryStatus,
  MetalAsset,
} from "@alkeva/shared";
import { DB } from "../core/core.module.js";
import { LedgerService } from "../ledger/ledger.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { PortfolioService } from "../portfolio/portfolio.service.js";

const OPEN_STATUSES: DeliveryStatus[] = ["requested", "reviewing", "approved", "scheduled"];

/**
 * Physical delivery requests (spec F18) — a WORKFLOW record, never a ledger
 * event. Requesting delivery does not move a milligram: the metal handover
 * ledger movement (user metal → a delivery-out account) is the physical
 * fulfilment step and is deliberately out of scope here. Balances are checked
 * advisorily at request AND at approve, but nothing is reserved — the admin
 * UI copy says so.
 */
@Injectable()
export class DeliveryService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ledger: LedgerService,
    private readonly portfolio: PortfolioService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateDeliveryDto): Promise<DeliveryItem> {
    await this.ledger.assertNotFrozen(userId);

    const snapshot = await this.portfolio.forUser(userId);
    if (!snapshot.tier.deliveryEligible) {
      throw new ForbiddenException("delivery_not_eligible");
    }

    const gramsMg = BigInt(dto.gramsMg);
    if (gramsMg <= 0n) throw new UnprocessableEntityException("amount_too_small");
    const held = BigInt(
      snapshot.holdings.find((h) => h.asset === dto.asset)?.gramsMg ?? "0",
    );
    if (gramsMg > held) throw new UnprocessableEntityException("insufficient_metal");

    // One open request per asset — a second would double-promise the metal.
    const open = await this.db
      .select({ id: deliveryRequests.id })
      .from(deliveryRequests)
      .where(
        and(
          eq(deliveryRequests.userId, userId),
          eq(deliveryRequests.asset, dto.asset),
          inArray(deliveryRequests.status, OPEN_STATUSES),
        ),
      )
      .limit(1);
    if (open.length > 0) throw new ConflictException("delivery_already_open");

    const inserted = await this.db
      .insert(deliveryRequests)
      .values({
        userId,
        asset: dto.asset,
        gramsMg,
        contactPhone: dto.contactPhone,
        address: dto.address,
        note: dto.note ?? null,
        eligibilitySnapshot: {
          tier: snapshot.tier.name,
          heldMg: held.toString(),
          holdingUsdCents: snapshot.tier.holdingUsdCents,
          at: new Date().toISOString(),
        },
      })
      .returning();
    const row = inserted[0]!;

    await this.db.insert(auditLogs).values({
      actorId: userId,
      actorLabel: "user",
      action: "delivery_requested",
      targetType: "delivery_request",
      targetId: row.id,
    });
    void this.notifications.emit(userId, "delivery_requested", {
      asset: dto.asset,
      gramsMg: dto.gramsMg,
    });

    return this.toItem(row);
  }

  async listOwn(userId: string): Promise<DeliveryListResponse> {
    const rows = await this.db
      .select()
      .from(deliveryRequests)
      .where(eq(deliveryRequests.userId, userId))
      .orderBy(desc(deliveryRequests.createdAt))
      .limit(20);
    return { requests: rows.map((r) => this.toItem(r)) };
  }

  // ── staff side ──────────────────────────────────────────────────

  async listAdmin(status?: string): Promise<{ requests: AdminDeliveryItem[] }> {
    const valid = (["requested", "reviewing", "approved", "scheduled", "rejected"] as const).find(
      (s) => s === status,
    );
    const rows = await this.db
      .select({ request: deliveryRequests, email: users.email })
      .from(deliveryRequests)
      .innerJoin(users, eq(deliveryRequests.userId, users.id))
      .where(valid ? eq(deliveryRequests.status, valid) : undefined)
      .orderBy(desc(deliveryRequests.createdAt))
      .limit(100);

    const out: AdminDeliveryItem[] = [];
    for (const r of rows) {
      // Advisory held-balance beside every row: nothing is reserved, so the
      // officer must see what the user holds NOW, not at request time.
      const balances = await this.ledger.balancesForUser(r.request.userId);
      const heldMg = r.request.asset === "XAU" ? balances.xauMg : balances.xptMg;
      out.push({ ...this.toItem(r.request), userEmail: r.email, heldMg });
    }
    return { requests: out };
  }

  async approve(id: string, reviewerId: string, note?: string): Promise<void> {
    const row = await this.mustGet(id);
    if (row.status !== "requested" && row.status !== "reviewing") {
      throw new ConflictException("delivery_not_open");
    }
    // Balance re-check at decision time — advisory, no reservation.
    const balances = await this.ledger.balancesForUser(row.userId);
    const held = BigInt(row.asset === "XAU" ? balances.xauMg : balances.xptMg);
    if (held < row.gramsMg) throw new UnprocessableEntityException("insufficient_metal");

    await this.decide(row.id, reviewerId, "approved", note ?? null, null);
    void this.notifications.emit(row.userId, "delivery_approved", {
      asset: row.asset,
      gramsMg: row.gramsMg.toString(),
    });
  }

  async schedule(id: string, reviewerId: string, scheduledFor: string): Promise<void> {
    const row = await this.mustGet(id);
    if (row.status !== "approved") throw new ConflictException("delivery_not_approved");
    await this.decide(row.id, reviewerId, "scheduled", row.reviewNote, new Date(scheduledFor));
    void this.notifications.emit(row.userId, "delivery_scheduled", {
      asset: row.asset,
      gramsMg: row.gramsMg.toString(),
      scheduledFor,
    });
  }

  async reject(id: string, reviewerId: string, note?: string): Promise<void> {
    const row = await this.mustGet(id);
    if (row.status === "rejected") throw new ConflictException("delivery_not_open");
    await this.decide(row.id, reviewerId, "rejected", note ?? null, null);
    void this.notifications.emit(row.userId, "delivery_rejected", {
      asset: row.asset,
      gramsMg: row.gramsMg.toString(),
      ...(note ? { note } : {}),
    });
  }

  private async mustGet(id: string) {
    const rows = await this.db
      .select()
      .from(deliveryRequests)
      .where(eq(deliveryRequests.id, id))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("not_found");
    return rows[0];
  }

  private async decide(
    id: string,
    reviewerId: string,
    status: DeliveryStatus,
    reviewNote: string | null,
    scheduledFor: Date | null,
  ): Promise<void> {
    await this.db
      .update(deliveryRequests)
      .set({
        status,
        reviewerId,
        reviewNote,
        reviewedAt: new Date(),
        ...(scheduledFor ? { scheduledFor } : {}),
      })
      .where(eq(deliveryRequests.id, id));
    await this.db.insert(auditLogs).values({
      actorId: reviewerId,
      actorLabel: "staff",
      action: `delivery_${status}`,
      targetType: "delivery_request",
      targetId: id,
    });
  }

  private toItem(r: typeof deliveryRequests.$inferSelect): DeliveryItem {
    return {
      id: r.id,
      asset: r.asset as MetalAsset,
      gramsMg: r.gramsMg.toString(),
      status: r.status,
      contactPhone: r.contactPhone,
      address: r.address,
      note: r.note,
      reviewNote: r.reviewNote,
      scheduledFor: r.scheduledFor?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
