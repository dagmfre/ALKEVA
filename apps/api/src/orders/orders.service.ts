import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import {
  auditLogs,
  complianceEvents,
  feeConfig,
  holdingTierConfig,
  orders,
  priceTicks,
  quotes,
  treasuryConfig,
  users,
  vaultHoldings,
  type Db,
} from "@alkeva/db";
import type {
  CreateOrderDto,
  Env,
  ListOrdersDto,
  MetalAsset,
  OrderListItem,
  OrderListResponse,
  OrderResponse,
  OrderSide,
  OrderStatus,
  ReceiptResponse,
  SystemAccountName,
} from "@alkeva/shared";
import { eatDayStartUtc } from "@alkeva/shared";
import { DB, ENV } from "../core/core.module.js";
import { LedgerService, type EntrySpec, type Tx } from "../ledger/ledger.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";

type OrderRow = typeof orders.$inferSelect;
type QuoteRow = typeof quotes.$inferSelect;

/** Thrown inside the tx when a concurrent request holds the idempotency key. */
class ReplaySentinel extends Error {}

type ExecOutcome =
  | { outcome: "settled"; order: OrderRow; quote: QuoteRow }
  | { outcome: "review"; order: OrderRow; quote: QuoteRow }
  | { outcome: "rejected"; order: OrderRow; quote: QuoteRow; code: string };

/**
 * Order execution — Design §4, implemented exactly. One DB transaction per
 * order: claim idempotency key, lock accounts in id-ASC order, lock the
 * quote, run every invariant check, post the entries, settle. Business
 * rejections COMMIT (the order persists with a machine-readable reason);
 * only infrastructure errors roll back.
 */
@Injectable()
export class OrdersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
  ) {}

  async execute(userId: string, dto: CreateOrderDto): Promise<OrderResponse> {
    // Namespaced: the DB unique index is global, so a client key collision
    // across users must be impossible by construction.
    const key = `${userId}:${dto.idempotencyKey}`;

    // Fast-path replay — the common double-submit sees this before any locks.
    const replayed = await this.findByKey(key, userId, dto.quoteId);
    if (replayed) return replayed;

    // Peek (unlocked) — fails fast and supplies side/asset/fee flags for the
    // lock set. Quote money fields are immutable after insert (only `status`
    // changes), so the in-tx locked re-read below cannot disagree on amounts.
    const peekedRows = await this.db
      .select()
      .from(quotes)
      .where(eq(quotes.id, dto.quoteId))
      .limit(1);
    const peeked = peekedRows[0];
    if (!peeked || peeked.userId !== userId) throw new NotFoundException("quote_not_found");

    // Account rows must exist before the money tx opens (never upsert while
    // holding locks).
    const userEtbId = await this.ledger.ensureUserAccount(userId, "ETB");
    const userMetalId = await this.ledger.ensureUserAccount(userId, peeked.asset);
    const cashId = await this.ledger.systemAccountId("system:cash");
    const vaultId = await this.ledger.systemAccountId(
      `system:vault:${peeked.asset}` as SystemAccountName,
    );
    const feesId = await this.ledger.systemAccountId("system:fees");
    const taxId = await this.ledger.systemAccountId("system:tax");
    const reforestId = await this.ledger.systemAccountId("system:reforestation");

    const lockIds = [userEtbId, userMetalId, cashId, vaultId];
    if (peeked.feeCents > 0n) lockIds.push(feesId);
    if (peeked.taxCents > 0n) lockIds.push(taxId);
    if (peeked.reforestCents > 0n) lockIds.push(reforestId);

    let result: ExecOutcome;
    try {
      result = await this.db.transaction(async (tx): Promise<ExecOutcome> => {
        // 1. Claim the idempotency key by inserting the order FIRST. A rival
        // holding the key blocks this insert until it commits/aborts.
        const claimed = await tx
          .insert(orders)
          .values({
            quoteId: dto.quoteId,
            userId,
            side: peeked.side,
            asset: peeked.asset,
            status: "created",
            idempotencyKey: key,
          })
          .onConflictDoNothing()
          .returning();
        const order = claimed[0];
        if (!order) throw new ReplaySentinel();

        // 2. Lock all touched accounts, id ASC (global deadlock-free order);
        // read balances under those locks.
        const balances = await this.ledger.lockAndReadBalances(tx, lockIds);

        // 3. Lock the quote — the one authoritative read of status + expiry.
        const quoteRows = await tx
          .select()
          .from(quotes)
          .where(eq(quotes.id, dto.quoteId))
          .limit(1)
          .for("update");
        const quote = quoteRows[0];
        if (!quote || quote.userId !== userId) {
          return this.reject(tx, order, peeked, "quote_not_found");
        }
        if (quote.status === "consumed") {
          return this.reject(tx, order, quote, "quote_consumed");
        }
        if (quote.status === "expired" || quote.expiresAt.getTime() <= Date.now()) {
          await tx.update(quotes).set({ status: "expired" }).where(eq(quotes.id, quote.id));
          return this.reject(tx, order, quote, "quote_expired");
        }

        // 4. Frozen check — authoritative, inside the tx.
        if (await this.ledger.isFrozen(tx, userId)) {
          return this.reject(tx, order, quote, "account_frozen");
        }

        // 4b. KYC gate (Phase 4.3): trading requires a verified identity.
        // Existing accounts were grandfathered to tier 1 by migration 0004.
        if (await this.kycTierBelow(tx, userId, 1)) {
          return this.reject(tx, order, quote, "kyc_required");
        }

        // 5. Compliance pre-check (Q57): large orders route to review —
        // quote consumed, nothing posted, resolution arrives in Phase 5.
        if (quote.totalCents >= this.env.COMPLIANCE_REVIEW_THRESHOLD_CENTS) {
          await tx.update(quotes).set({ status: "consumed" }).where(eq(quotes.id, quote.id));
          const reviewed = await tx
            .update(orders)
            .set({ status: "review" })
            .where(eq(orders.id, order.id))
            .returning();
          await tx.insert(complianceEvents).values({
            userId,
            ruleKey: "txn_over_500k",
            action: "review",
            evidence: {
              orderId: order.id,
              quoteId: quote.id,
              side: quote.side,
              totalCents: quote.totalCents.toString(),
            },
          });
          return { outcome: "review", order: reviewed[0] ?? order, quote };
        }

        // 6. Holding-tier caps (Decision A3): NULL cap = uncapped.
        const tierCode = await this.checkTierCaps(tx, userId, quote.totalCents);
        if (tierCode) return this.reject(tx, order, quote, tierCode);

        const balance = (id: string) => balances.get(id) ?? 0n;

        if (quote.side === "buy") {
          // 7a. Funds check.
          if (balance(userEtbId) < quote.totalCents) {
            return this.reject(tx, order, quote, "insufficient_balance");
          }
          // 7b. RESERVE GATE (non-negotiable #5) — inside the tx, under the
          // vault account lock that serializes all buys for this asset.
          // available = physical vault stock + vault ledger balance
          // (the ledger balance is −grams issued to users).
          const physicalMg = await this.physicalVaultMg(tx, quote.asset as MetalAsset);
          const availableMg = physicalMg + balance(vaultId);
          if (availableMg < quote.gramsMg) {
            return this.reject(tx, order, quote, "reserve_halt");
          }
        } else {
          // 7a. Metal check.
          if (balance(userMetalId) < quote.gramsMg) {
            return this.reject(tx, order, quote, "insufficient_metal");
          }
          // 7b. Float gate: paying out `subtotal` must not push the cash
          // float below the halt threshold (C8 — published, config-driven).
          const treasury = await this.treasuryConfig(tx);
          if (balance(cashId) - quote.subtotalCents < treasury.haltThresholdCents) {
            return this.reject(tx, order, quote, "float_halt");
          }
          // 7c. Platform-wide daily sell-back ceiling — consistent because
          // every sell holds the system:cash lock.
          const usedToday = await this.dailySellbackUsed(tx);
          if (usedToday + quote.totalCents > treasury.dailySellbackCeilingCents) {
            return this.reject(tx, order, quote, "sellback_ceiling");
          }
        }

        // 8. Post the double entries — the only money movement in the flow.
        const entries: EntrySpec[] =
          quote.side === "buy"
            ? [
                { accountId: userEtbId, asset: "ETB", amount: -quote.totalCents },
                { accountId: cashId, asset: "ETB", amount: quote.subtotalCents },
                { accountId: feesId, asset: "ETB", amount: quote.feeCents },
                { accountId: taxId, asset: "ETB", amount: quote.taxCents },
                { accountId: reforestId, asset: "ETB", amount: quote.reforestCents },
                { accountId: userMetalId, asset: quote.asset, amount: quote.gramsMg },
                { accountId: vaultId, asset: quote.asset, amount: -quote.gramsMg },
              ]
            : [
                { accountId: cashId, asset: "ETB", amount: -quote.subtotalCents },
                { accountId: userEtbId, asset: "ETB", amount: quote.totalCents },
                { accountId: feesId, asset: "ETB", amount: quote.feeCents },
                { accountId: taxId, asset: "ETB", amount: quote.taxCents },
                { accountId: reforestId, asset: "ETB", amount: quote.reforestCents },
                { accountId: userMetalId, asset: quote.asset, amount: -quote.gramsMg },
                { accountId: vaultId, asset: quote.asset, amount: quote.gramsMg },
              ];
        const txnId = await this.ledger.postTransaction(tx, {
          kind: quote.side,
          orderId: order.id,
          initiatedBy: userId,
          entries,
        });

        // 9. Consume the quote, settle the order.
        await tx.update(quotes).set({ status: "consumed" }).where(eq(quotes.id, quote.id));
        const settled = await tx
          .update(orders)
          .set({
            status: "settled",
            ledgerTransactionId: txnId,
            settledAt: sql`now()`,
            // Receipt numbers are allocated at settle, not at insert — only a
            // settled order has a receipt (migration 0003).
            receiptSerial: sql`nextval('receipt_serial_seq')`,
          })
          .where(eq(orders.id, order.id))
          .returning();
        return { outcome: "settled", order: settled[0] ?? order, quote };
      });
    } catch (err) {
      if (err instanceof ReplaySentinel) {
        // A rival held our key; it has committed (or aborted) by now.
        const winner = await this.findByKey(key, userId, dto.quoteId);
        if (winner) return winner;
        throw new ConflictException("conflict");
      }
      // Deferred zero-sum trigger fires at COMMIT — reaching it means a code
      // bug upstream; money never half-moves.
      if (this.isPgError(err, "P0001")) {
        throw new InternalServerErrorException("ledger_unbalanced");
      }
      throw err;
    }

    if (result.outcome === "rejected") {
      throw new UnprocessableEntityException({
        message: result.code,
        orderId: result.order.id,
      });
    }
    if (result.outcome === "settled") this.emitReceipt(result.order, result.quote);
    return this.serialize(result.order, result.quote);
  }

  /** Fire-and-forget receipt notification for a freshly settled order. */
  private emitReceipt(order: OrderRow, quote: QuoteRow): void {
    if (order.receiptSerial === null) return;
    const settledAt = order.settledAt ?? order.createdAt;
    void this.notifications.emit(order.userId, "order_receipt", {
      side: order.side,
      asset: order.asset,
      gramsMg: quote.gramsMg.toString(),
      totalCents: quote.totalCents.toString(),
      serial: `ALK-${settledAt.getUTCFullYear()}-${order.receiptSerial.toString().padStart(6, "0")}`,
    });
  }

  /**
   * The Phase 5 exit from the review queue (compliance role, via the admin
   * module). Approval settles AT THE ORIGINAL QUOTE'S FIGURES — the user
   * confirmed that price; review is a compliance decision, not a repricing —
   * but every money gate runs again inside the settle transaction, because
   * the world moved while the order sat in review. The reserve gate holding
   * at settle time is non-negotiable #5; a gate failure turns the approval
   * into a recorded rejection, exactly like a live order.
   */
  async resolveReview(
    orderId: string,
    actorId: string,
    decision: "approve" | "reject",
    note?: string,
  ): Promise<OrderResponse> {
    const rows = await this.db
      .select({ order: orders, quote: quotes })
      .from(orders)
      .innerJoin(quotes, eq(orders.quoteId, quotes.id))
      .where(eq(orders.id, orderId))
      .limit(1);
    const found = rows[0];
    if (!found) throw new NotFoundException("order_not_found");
    const { quote: peeked } = found;

    if (decision === "reject") {
      const claimed = await this.db
        .update(orders)
        .set({ status: "rejected", failureReason: "compliance_rejected" })
        .where(and(eq(orders.id, orderId), eq(orders.status, "review")))
        .returning();
      const rejected = claimed[0];
      if (!rejected) throw new ConflictException("order_not_in_review");
      await this.resolveComplianceEvents(orderId, actorId);
      await this.auditReview(actorId, "review_rejected", orderId, note);
      return this.serialize(rejected, peeked);
    }

    // Approve: same account set and lock order as a live execution.
    const userId = found.order.userId;
    const userEtbId = await this.ledger.ensureUserAccount(userId, "ETB");
    const userMetalId = await this.ledger.ensureUserAccount(userId, peeked.asset);
    const cashId = await this.ledger.systemAccountId("system:cash");
    const vaultId = await this.ledger.systemAccountId(
      `system:vault:${peeked.asset}` as SystemAccountName,
    );
    const feesId = await this.ledger.systemAccountId("system:fees");
    const taxId = await this.ledger.systemAccountId("system:tax");
    const reforestId = await this.ledger.systemAccountId("system:reforestation");
    const lockIds = [userEtbId, userMetalId, cashId, vaultId];
    if (peeked.feeCents > 0n) lockIds.push(feesId);
    if (peeked.taxCents > 0n) lockIds.push(taxId);
    if (peeked.reforestCents > 0n) lockIds.push(reforestId);

    let result: ExecOutcome;
    try {
      result = await this.db.transaction(async (tx): Promise<ExecOutcome> => {
        // The order row lock is the approve/approve mutex.
        const orderRows = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, orderId))
          .limit(1)
          .for("update");
        const order = orderRows[0];
        if (!order || order.status !== "review") {
          throw new ConflictException("order_not_in_review");
        }

        const balances = await this.ledger.lockAndReadBalances(tx, lockIds);
        const quoteRows = await tx
          .select()
          .from(quotes)
          .where(eq(quotes.id, order.quoteId))
          .limit(1)
          .for("update");
        const quote = quoteRows[0];
        if (!quote) return this.reject(tx, order, peeked, "quote_not_found");

        // Re-run every gate the review routing skipped or that time can break.
        if (await this.ledger.isFrozen(tx, userId)) {
          return this.reject(tx, order, quote, "account_frozen");
        }
        const tierCode = await this.checkTierCaps(tx, userId, quote.totalCents);
        if (tierCode) return this.reject(tx, order, quote, tierCode);

        const balance = (id: string) => balances.get(id) ?? 0n;
        if (quote.side === "buy") {
          if (balance(userEtbId) < quote.totalCents) {
            return this.reject(tx, order, quote, "insufficient_balance");
          }
          const physicalMg = await this.physicalVaultMg(tx, quote.asset as MetalAsset);
          if (physicalMg + balance(vaultId) < quote.gramsMg) {
            return this.reject(tx, order, quote, "reserve_halt");
          }
        } else {
          if (balance(userMetalId) < quote.gramsMg) {
            return this.reject(tx, order, quote, "insufficient_metal");
          }
          const treasury = await this.treasuryConfig(tx);
          if (balance(cashId) - quote.subtotalCents < treasury.haltThresholdCents) {
            return this.reject(tx, order, quote, "float_halt");
          }
          const usedToday = await this.dailySellbackUsed(tx);
          if (usedToday + quote.totalCents > treasury.dailySellbackCeilingCents) {
            return this.reject(tx, order, quote, "sellback_ceiling");
          }
        }

        const entries: EntrySpec[] =
          quote.side === "buy"
            ? [
                { accountId: userEtbId, asset: "ETB", amount: -quote.totalCents },
                { accountId: cashId, asset: "ETB", amount: quote.subtotalCents },
                { accountId: feesId, asset: "ETB", amount: quote.feeCents },
                { accountId: taxId, asset: "ETB", amount: quote.taxCents },
                { accountId: reforestId, asset: "ETB", amount: quote.reforestCents },
                { accountId: userMetalId, asset: quote.asset, amount: quote.gramsMg },
                { accountId: vaultId, asset: quote.asset, amount: -quote.gramsMg },
              ]
            : [
                { accountId: cashId, asset: "ETB", amount: -quote.subtotalCents },
                { accountId: userEtbId, asset: "ETB", amount: quote.totalCents },
                { accountId: feesId, asset: "ETB", amount: quote.feeCents },
                { accountId: taxId, asset: "ETB", amount: quote.taxCents },
                { accountId: reforestId, asset: "ETB", amount: quote.reforestCents },
                { accountId: userMetalId, asset: quote.asset, amount: -quote.gramsMg },
                { accountId: vaultId, asset: quote.asset, amount: quote.gramsMg },
              ];
        const txnId = await this.ledger.postTransaction(tx, {
          kind: quote.side,
          orderId: order.id,
          initiatedBy: actorId,
          note: "review_approved",
          entries,
        });
        const settled = await tx
          .update(orders)
          .set({
            status: "settled",
            ledgerTransactionId: txnId,
            settledAt: sql`now()`,
            receiptSerial: sql`nextval('receipt_serial_seq')`,
          })
          .where(eq(orders.id, order.id))
          .returning();
        return { outcome: "settled", order: settled[0] ?? order, quote };
      });
    } catch (err) {
      if (this.isPgError(err, "P0001")) {
        throw new InternalServerErrorException("ledger_unbalanced");
      }
      throw err;
    }

    await this.resolveComplianceEvents(orderId, actorId);
    await this.auditReview(
      actorId,
      result.outcome === "settled" ? "review_approved" : "review_approve_refused",
      orderId,
      note,
      result.outcome === "rejected" ? result.code : undefined,
    );

    if (result.outcome === "rejected") {
      // The approval itself was refused by a money gate — surfaced to the
      // compliance officer as the same machine code a live order would show.
      throw new UnprocessableEntityException({
        message: result.code,
        orderId: result.order.id,
      });
    }
    if (result.outcome === "settled") this.emitReceipt(result.order, result.quote);
    return this.serialize(result.order, result.quote);
  }

  private async resolveComplianceEvents(orderId: string, actorId: string): Promise<void> {
    await this.db
      .update(complianceEvents)
      .set({ resolvedBy: actorId, resolvedAt: sql`now()` })
      .where(
        and(
          sql`${complianceEvents.evidence} ->> 'orderId' = ${orderId}`,
          sql`${complianceEvents.resolvedAt} is null`,
        ),
      );
  }

  private async auditReview(
    actorId: string,
    action: string,
    orderId: string,
    note?: string,
    refusalCode?: string,
  ): Promise<void> {
    await this.db.insert(auditLogs).values({
      actorId,
      actorLabel: `staff:${actorId}`,
      action,
      targetType: "order",
      targetId: orderId,
      after: { note: note ?? null, ...(refusalCode ? { refusalCode } : {}) },
    });
  }

  async getOwn(userId: string, orderId: string): Promise<OrderResponse> {
    const rows = await this.db
      .select({ order: orders, quote: quotes })
      .from(orders)
      .innerJoin(quotes, eq(orders.quoteId, quotes.id))
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundException("order_not_found");
    return this.serialize(row.order, row.quote);
  }

  // ── internals ───────────────────────────────────────────────────

  /** Replay lookup; also guards against reusing a key with a different quote. */
  private async findByKey(
    key: string,
    userId: string,
    quoteId: string,
  ): Promise<OrderResponse | null> {
    const rows = await this.db
      .select({ order: orders, quote: quotes })
      .from(orders)
      .innerJoin(quotes, eq(orders.quoteId, quotes.id))
      .where(eq(orders.idempotencyKey, key))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    if (row.order.userId !== userId || row.order.quoteId !== quoteId) {
      throw new ConflictException("conflict");
    }
    return this.serialize(row.order, row.quote);
  }

  /** Marks the order rejected and returns the committing outcome. */
  private async reject(
    tx: Tx,
    order: OrderRow,
    quote: QuoteRow,
    code: string,
  ): Promise<ExecOutcome> {
    const updated = await tx
      .update(orders)
      .set({ status: "rejected", failureReason: code })
      .where(eq(orders.id, order.id))
      .returning();
    return { outcome: "rejected", order: updated[0] ?? order, quote, code };
  }

  private async kycTierBelow(tx: Tx, userId: string, minTier: number): Promise<boolean> {
    const rows = await tx
      .select({ kycTier: users.kycTier })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return (rows[0]?.kycTier ?? 0) < minTier;
  }

  /** Returns a rejection code when a tier cap is exceeded, else null. */
  private async checkTierCaps(
    tx: Tx,
    userId: string,
    totalCents: bigint,
  ): Promise<string | null> {
    const userRows = await tx
      .select({ holdingTier: users.holdingTier })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const tierName = userRows[0]?.holdingTier;
    if (!tierName) return null; // no tier assigned yet → uncapped

    const tierRows = await tx
      .select()
      .from(holdingTierConfig)
      .where(eq(holdingTierConfig.name, tierName))
      .limit(1);
    const tier = tierRows[0];
    if (!tier) return null; // unknown tier name → uncapped

    if (tier.perTxnCapCents !== null && totalCents > tier.perTxnCapCents) {
      return "tier_txn_cap";
    }
    if (tier.dailyCapCents !== null) {
      const rows = await tx
        .select({ total: sql<string>`coalesce(sum(${quotes.totalCents}), 0)::bigint` })
        .from(orders)
        .innerJoin(quotes, eq(orders.quoteId, quotes.id))
        .where(
          and(
            eq(orders.userId, userId),
            eq(orders.status, "settled"),
            // "Today" is the Addis Ababa day, not the UTC day — caps reset at
            // midnight EAT, the midnight the customer actually experiences.
            sql`${orders.settledAt} >= ${eatDayStartUtc().toISOString()}`,
          ),
        );
      const usedToday = BigInt(rows[0]?.total ?? "0");
      if (usedToday + totalCents > tier.dailyCapCents) return "tier_daily_cap";
    }
    return null;
  }

  /** Physical vault stock (mg) for an asset: SUM(intake) − SUM(outtake). */
  private async physicalVaultMg(tx: Tx, asset: MetalAsset): Promise<bigint> {
    const rows = await tx
      .select({
        mg: sql<string>`coalesce(sum(case when ${vaultHoldings.kind} = 'intake' then ${vaultHoldings.gramsMg} else -${vaultHoldings.gramsMg} end), 0)::bigint`,
      })
      .from(vaultHoldings)
      .where(eq(vaultHoldings.asset, asset));
    return BigInt(rows[0]?.mg ?? "0");
  }

  private async treasuryConfig(tx: Tx) {
    const rows = await tx
      .select()
      .from(treasuryConfig)
      .where(eq(treasuryConfig.id, 1))
      .limit(1);
    const row = rows[0];
    if (!row) throw new InternalServerErrorException("treasury_config_missing");
    return row;
  }

  /** Platform-wide sell-back total settled today (Addis Ababa day). */
  private async dailySellbackUsed(tx: Tx): Promise<bigint> {
    const rows = await tx
      .select({ total: sql<string>`coalesce(sum(${quotes.totalCents}), 0)::bigint` })
      .from(orders)
      .innerJoin(quotes, eq(orders.quoteId, quotes.id))
      .where(
        and(
          eq(orders.side, "sell"),
          eq(orders.status, "settled"),
          sql`${orders.settledAt} >= ${eatDayStartUtc().toISOString()}`,
        ),
      );
    return BigInt(rows[0]?.total ?? "0");
  }

  /**
   * Transaction history (Phase 3.4). Keyset pagination on `created_at` rather
   * than OFFSET: new orders arrive while a user scrolls, and offsets would
   * duplicate or skip rows when they do.
   */
  async list(userId: string, dto: ListOrdersDto): Promise<OrderListResponse> {
    const where = dto.before
      ? and(eq(orders.userId, userId), lt(orders.createdAt, new Date(dto.before)))
      : eq(orders.userId, userId);

    const rows = await this.db
      .select({
        id: orders.id,
        side: orders.side,
        asset: orders.asset,
        status: orders.status,
        failureReason: orders.failureReason,
        receiptSerial: orders.receiptSerial,
        createdAt: orders.createdAt,
        settledAt: orders.settledAt,
        gramsMg: quotes.gramsMg,
        unitEtbCentsPerGram: quotes.unitEtbCentsPerGram,
        totalCents: quotes.totalCents,
      })
      .from(orders)
      .innerJoin(quotes, eq(orders.quoteId, quotes.id))
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(dto.limit + 1); // one extra row answers "is there a next page?"

    const page = rows.slice(0, dto.limit);
    const last = page[page.length - 1];

    const items: OrderListItem[] = page.map((r) => ({
      id: r.id,
      side: r.side as OrderSide,
      asset: r.asset as MetalAsset,
      status: r.status as OrderStatus,
      failureReason: r.failureReason,
      gramsMg: r.gramsMg.toString(),
      unitEtbCentsPerGram: r.unitEtbCentsPerGram.toString(),
      totalCents: r.totalCents.toString(),
      receiptSerial: r.receiptSerial === null ? null : r.receiptSerial.toString(),
      createdAt: r.createdAt.toISOString(),
      settledAt: r.settledAt ? r.settledAt.toISOString() : null,
    }));

    return {
      orders: items,
      nextCursor: rows.length > dto.limit && last ? last.createdAt.toISOString() : null,
    };
  }

  /**
   * Serial-numbered receipt (F12). Settled orders only — a rejected order has
   * no receipt because no money moved. Carries the price provenance (feed,
   * FX source, exact tick timestamp), which is what makes this a receipt
   * rather than a note: the price was not invented, it came from a named
   * source at a named moment.
   */
  async receipt(userId: string, orderId: string): Promise<ReceiptResponse> {
    const rows = await this.db
      .select({ order: orders, quote: quotes, tick: priceTicks })
      .from(orders)
      .innerJoin(quotes, eq(orders.quoteId, quotes.id))
      .innerJoin(priceTicks, eq(quotes.priceTickId, priceTicks.id))
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
      .limit(1);

    const row = rows[0];
    if (!row) throw new NotFoundException("order_not_found");
    if (row.order.status !== "settled" || row.order.receiptSerial === null) {
      throw new NotFoundException("receipt_not_available");
    }

    const cfgRows = await this.db
      .select({ commissionPctMilli: feeConfig.commissionPctMilli })
      .from(feeConfig)
      .where(eq(feeConfig.id, 1))
      .limit(1);

    const settledAt = row.order.settledAt ?? row.order.createdAt;
    const serial = row.order.receiptSerial;

    return {
      orderId: row.order.id,
      serial: `ALK-${settledAt.getUTCFullYear()}-${serial.toString().padStart(6, "0")}`,
      serialNumber: serial.toString(),
      side: row.order.side as OrderSide,
      asset: row.order.asset as MetalAsset,
      gramsMg: row.quote.gramsMg.toString(),
      unitEtbCentsPerGram: row.quote.unitEtbCentsPerGram.toString(),
      subtotalCents: row.quote.subtotalCents.toString(),
      feeCents: row.quote.feeCents.toString(),
      taxCents: row.quote.taxCents.toString(),
      reforestCents: row.quote.reforestCents.toString(),
      totalCents: row.quote.totalCents.toString(),
      commissionPctMilli: cfgRows[0]?.commissionPctMilli ?? 0,
      settledAt: settledAt.toISOString(),
      ledgerTransactionId: row.order.ledgerTransactionId,
      price: {
        source: row.tick.source,
        fxSource: row.tick.fxSource,
        usdPerOzMicro: row.tick.usdPerOzMicro.toString(),
        etbRateMicro: row.tick.etbRateMicro.toString(),
        at: row.tick.at.toISOString(),
      },
    };
  }

  private isPgError(err: unknown, code: string): boolean {
    return (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === code
    );
  }

  private serialize(order: OrderRow, quote: QuoteRow): OrderResponse {
    return {
      id: order.id,
      quoteId: order.quoteId,
      side: order.side as OrderSide,
      asset: order.asset as MetalAsset,
      status: order.status,
      failureReason: order.failureReason,
      ledgerTransactionId: order.ledgerTransactionId,
      gramsMg: quote.gramsMg.toString(),
      totalCents: quote.totalCents.toString(),
      createdAt: order.createdAt.toISOString(),
      settledAt: order.settledAt ? order.settledAt.toISOString() : null,
    };
  }
}
