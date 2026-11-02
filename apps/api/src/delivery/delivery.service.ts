import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import { auditLogs, deliveryRequests, users, vaultHoldings, type Db } from "@alkeva/db";
import type {
  AdminDeliveryItem,
  CreateDeliveryDto,
  DeliveryItem,
  DeliveryListResponse,
  DeliveryStatus,
  MetalAsset,
  SystemAccountName,
} from "@alkeva/shared";
import { DB } from "../core/core.module.js";
import { LedgerService, type Tx } from "../ledger/ledger.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { PortfolioService } from "../portfolio/portfolio.service.js";

type DeliveryRow = typeof deliveryRequests.$inferSelect;

const OPEN_STATUSES: DeliveryStatus[] = ["requested", "reviewing", "approved", "scheduled"];
/** Statuses in which the metal sits in system:delivery_hold:<asset>. */
const HELD_STATUSES: DeliveryStatus[] = ["approved", "scheduled"];

/**
 * Physical delivery (spec F18). Since Phase 10 the metal really moves:
 *
 *   approve  → user metal → system:delivery_hold:<asset>   (cannot be sold or
 *                                                          delivered twice)
 *   deliver  → hold → system:vault:<asset> + a vault outtake row — the bar
 *              left the building, so physical stock and grams owed to
 *              customers drop by the same amount and the reserve ratio holds
 *   reject   → from approved/scheduled, hold → user (the refund)
 *
 * Before this, approval only recorded intent: a customer could take the bar
 * and still sell the grams. Every decision is one transaction with a
 * conditional status update, and staff never decide their own request.
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
    await this.ledger.assertCanMoveMoney(userId);

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
    const valid = (
      ["requested", "reviewing", "approved", "scheduled", "rejected", "delivered"] as const
    ).find((s) => s === status);
    const rows = await this.db
      .select({ request: deliveryRequests, email: users.email })
      .from(deliveryRequests)
      .innerJoin(users, eq(deliveryRequests.userId, users.id))
      .where(valid ? eq(deliveryRequests.status, valid) : undefined)
      .orderBy(desc(deliveryRequests.createdAt))
      .limit(100);

    const out: AdminDeliveryItem[] = [];
    for (const r of rows) {
      const balances = await this.ledger.balancesForUser(r.request.userId);
      const heldMg = r.request.asset === "XAU" ? balances.xauMg : balances.xptMg;
      out.push({ ...this.toItem(r.request), userEmail: r.email, heldMg });
    }
    return { requests: out };
  }

  async approve(id: string, reviewerId: string, note?: string): Promise<void> {
    const peek = await this.mustGet(id);
    this.assertNotOwn(peek, reviewerId);
    // The customer must still be allowed to move value (not frozen, verified).
    await this.ledger.assertCanMoveMoney(peek.userId);

    const asset = peek.asset as MetalAsset;
    const userMetalId = await this.ledger.ensureUserAccount(peek.userId, asset);
    const holdId = await this.ledger.systemAccountId(this.holdName(asset));

    await this.db.transaction(async (tx) => {
      const row = await this.claim(tx, id, ["requested", "reviewing"], "approved", {
        reviewerId,
        reviewNote: note ?? null,
        reviewedAt: new Date(),
      });
      const balances = await this.ledger.lockAndReadBalances(tx, [userMetalId, holdId]);
      if ((balances.get(userMetalId) ?? 0n) < row.gramsMg) {
        // Throwing rolls the status change back too: nothing moves.
        throw new UnprocessableEntityException("insufficient_metal");
      }
      await this.ledger.postTransaction(tx, {
        kind: "delivery",
        initiatedBy: reviewerId,
        note: `delivery_hold:${row.id}`,
        entries: [
          { accountId: userMetalId, asset, amount: -row.gramsMg },
          { accountId: holdId, asset, amount: row.gramsMg },
        ],
      });
      await this.auditTx(tx, reviewerId, "delivery_approved", row.id, {
        gramsMg: row.gramsMg.toString(),
        held: true,
      });
    });

    void this.notifications.emit(peek.userId, "delivery_approved", {
      asset: peek.asset,
      gramsMg: peek.gramsMg.toString(),
    });
  }

  async schedule(id: string, reviewerId: string, scheduledFor: string): Promise<void> {
    const peek = await this.mustGet(id);
    this.assertNotOwn(peek, reviewerId);
    await this.db.transaction(async (tx) => {
      const row = await this.claim(tx, id, ["approved", "scheduled"], "scheduled", {
        reviewerId,
        scheduledFor: new Date(scheduledFor),
      });
      await this.auditTx(tx, reviewerId, "delivery_scheduled", row.id, { scheduledFor });
    });
    void this.notifications.emit(peek.userId, "delivery_scheduled", {
      asset: peek.asset,
      gramsMg: peek.gramsMg.toString(),
      scheduledFor,
    });
  }

  /** The handover: held metal goes back to the vault account AND out of the vault. */
  async deliver(id: string, reviewerId: string): Promise<void> {
    const peek = await this.mustGet(id);
    this.assertNotOwn(peek, reviewerId);
    const asset = peek.asset as MetalAsset;
    const holdId = await this.ledger.systemAccountId(this.holdName(asset));
    const vaultId = await this.ledger.systemAccountId(
      `system:vault:${asset}` as SystemAccountName,
    );

    await this.db.transaction(async (tx) => {
      const row = await this.claim(tx, id, HELD_STATUSES, "delivered", {
        reviewerId,
        deliveredAt: new Date(),
      });
      await this.ledger.lockAndReadBalances(tx, [holdId, vaultId]);
      await this.ledger.postTransaction(tx, {
        kind: "delivery",
        initiatedBy: reviewerId,
        note: `delivery_out:${row.id}`,
        entries: [
          { accountId: holdId, asset, amount: -row.gramsMg },
          { accountId: vaultId, asset, amount: row.gramsMg },
        ],
      });
      await tx.insert(vaultHoldings).values({
        asset,
        kind: "outtake",
        gramsMg: row.gramsMg,
        reference: `DELIVERY-${row.id}`,
        recordedBy: reviewerId,
      });
      await this.auditTx(tx, reviewerId, "delivery_delivered", row.id, {
        gramsMg: row.gramsMg.toString(),
      });
    });

    void this.notifications.emit(peek.userId, "delivery_delivered", {
      asset: peek.asset,
      gramsMg: peek.gramsMg.toString(),
    });
  }

  async reject(id: string, reviewerId: string, note?: string): Promise<void> {
    const peek = await this.mustGet(id);
    this.assertNotOwn(peek, reviewerId);
    const asset = peek.asset as MetalAsset;
    const userMetalId = await this.ledger.ensureUserAccount(peek.userId, asset);
    const holdId = await this.ledger.systemAccountId(this.holdName(asset));

    await this.db.transaction(async (tx) => {
      // Lock the row to learn whether the metal is currently held.
      const current = await tx
        .select()
        .from(deliveryRequests)
        .where(eq(deliveryRequests.id, id))
        .limit(1)
        .for("update");
      const before = current[0];
      if (!before || !OPEN_STATUSES.includes(before.status as DeliveryStatus)) {
        throw new ConflictException("delivery_not_open");
      }
      const wasHeld = HELD_STATUSES.includes(before.status as DeliveryStatus);
      const row = await this.claim(tx, id, [before.status as DeliveryStatus], "rejected", {
        reviewerId,
        reviewNote: note ?? null,
        reviewedAt: new Date(),
      });
      if (wasHeld) {
        await this.ledger.lockAndReadBalances(tx, [userMetalId, holdId]);
        await this.ledger.postTransaction(tx, {
          kind: "delivery",
          initiatedBy: reviewerId,
          note: `delivery_refund:${row.id}`,
          entries: [
            { accountId: holdId, asset, amount: -row.gramsMg },
            { accountId: userMetalId, asset, amount: row.gramsMg },
          ],
        });
      }
      await this.auditTx(tx, reviewerId, "delivery_rejected", row.id, {
        refunded: wasHeld,
        note: note ?? null,
      });
    });

    void this.notifications.emit(peek.userId, "delivery_rejected", {
      asset: peek.asset,
      gramsMg: peek.gramsMg.toString(),
      ...(note ? { note } : {}),
    });
  }

  // ── internals ───────────────────────────────────────────────────

  private holdName(asset: MetalAsset): SystemAccountName {
    return `system:delivery_hold:${asset}` as SystemAccountName;
  }

  private assertNotOwn(row: DeliveryRow, reviewerId: string): void {
    if (row.userId === reviewerId) throw new ForbiddenException("cannot_decide_own");
  }

  /** Conditional status move — the double-click / two-officer mutex. */
  private async claim(
    tx: Tx,
    id: string,
    from: DeliveryStatus[],
    to: DeliveryStatus,
    set: Partial<typeof deliveryRequests.$inferInsert>,
  ): Promise<DeliveryRow> {
    const claimed = await tx
      .update(deliveryRequests)
      .set({ ...set, status: to })
      .where(and(eq(deliveryRequests.id, id), inArray(deliveryRequests.status, from)))
      .returning();
    const row = claimed[0];
    if (!row) throw new ConflictException(`delivery_not_${from.join("_or_")}`);
    return row;
  }

  private async auditTx(
    tx: Tx,
    actorId: string,
    action: string,
    targetId: string,
    after: Record<string, unknown>,
  ): Promise<void> {
    await tx.insert(auditLogs).values({
      actorId,
      actorLabel: `staff:${actorId}`,
      action,
      targetType: "delivery_request",
      targetId,
      after,
    });
  }

  private async mustGet(id: string): Promise<DeliveryRow> {
    const rows = await this.db
      .select()
      .from(deliveryRequests)
      .where(eq(deliveryRequests.id, id))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("not_found");
    return rows[0];
  }

  private toItem(r: DeliveryRow): DeliveryItem {
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
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
