import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common";
import { and, desc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { Redis } from "ioredis";
import { auditLogs, identityVerifications, payouts, users, type Db } from "@alkeva/db";
import {
  eatDayStartUtc,
  type BankDto,
  type ConfirmPayoutDto,
  type Env,
  type PayoutIntentDto,
  type PayoutIntentResponse,
  type PayoutRequestSpec,
  type PayoutResponse,
  type PayoutStatus,
} from "@alkeva/shared";
import { EmailCodesService } from "../auth/email-codes.service.js";
import { DB, ENV, REDIS } from "../core/core.module.js";
import { every, runExclusive } from "../core/schedule.js";
import { ChapaApiError, ChapaService } from "../chapa/chapa.service.js";
import { LedgerService, type Tx } from "../ledger/ledger.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";

type PayoutRow = typeof payouts.$inferSelect;

/** Who is moving the money — a staff member, the auto-approve system, or a webhook. */
interface Actor {
  id: string | null;
  label: string;
}

const SYSTEM_AUTO: Actor = { id: null, label: "system:auto_approve" };
const CHAPA_WEBHOOK: Actor = { id: null, label: "chapa-webhook" };
const SWEEPER: Actor = { id: null, label: "system:payout_sweeper" };

/** Statuses that count toward the daily limits — everything not refused. */
const COUNTED: PayoutStatus[] = ["requested", "approved", "processing", "settled"];
/** Refusals the user can act on; replays surface them again as 422s. */
const USER_REFUSALS = new Set(["insufficient_balance", "payout_daily_limit", "payout_daily_count"]);

const SWEEP_EVERY_MS = 10 * 60_000;
/** A transfer Chapa still does not know after this long goes to a human. */
const STUCK_ALERT_MIN = 60;

/** Thrown inside the tx when a concurrent request holds the idempotency key. */
class ReplaySentinel extends Error {}

/**
 * Withdrawals — request → ledger HOLD → approval → Chapa transfer → settle.
 * The user's cents park in system:payout_hold between request and
 * approve/reject, so the balance drop is real and a refusal refunds to the cent.
 *
 * Phase 10 (real money):
 * - Every request is confirmed with a 6-digit code emailed to the verified
 *   address (`createIntent` → `confirm`).
 * - Per-user daily amount and count limits, checked under the account lock.
 * - Instant approval only below PAYOUT_AUTO_APPROVE_MAX_CENTS, only to a
 *   destination this user has already been paid to, only in their verified
 *   legal name, and only while the day's total stays under the review line.
 *   Everything else waits for finance; nobody approves their own payout.
 * - A refund happens only when Chapa itself definitively refused, or a verify
 *   says failed. Ambiguity (5xx, gateway pages, timeouts, unverified webhooks)
 *   keeps the payout `processing` until a verify resolves it — refunding on a
 *   guess could pay the customer twice.
 */
@Injectable()
export class PayoutsService implements OnModuleInit, OnApplicationShutdown {
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly chapa: ChapaService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
    private readonly codes: EmailCodesService,
  ) {}

  onModuleInit(): void {
    this.sweepTimer = every(SWEEP_EVERY_MS, "payout sweep", () =>
      runExclusive(this.redis, "lock:payout-sweep", 540, () => this.sweep()),
    );
  }

  onApplicationShutdown(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  async banks(): Promise<BankDto[]> {
    const banks = await this.chapa.banks();
    return banks.map((b) => ({
      id: b.id,
      name: b.name,
      isMobileMoney: b.is_mobilemoney === 1 || b.is_mobilemoney === true,
      accountLength: typeof b.acct_length === "number" ? b.acct_length : null,
    }));
  }

  // ── user paths ──────────────────────────────────────────────────

  /** Step 1: check every gate early, then email a code bound to this exact request. */
  async createIntent(userId: string, dto: PayoutIntentDto): Promise<PayoutIntentResponse> {
    await this.ledger.assertCanMoveMoney(userId);
    if (dto.amountCents < this.env.PAYOUT_MIN_CENTS) {
      throw new UnprocessableEntityException("amount_too_small");
    }
    const balances = await this.ledger.balancesForUser(userId);
    if (BigInt(balances.etbCents) < dto.amountCents) {
      throw new UnprocessableEntityException("insufficient_balance");
    }
    // Advisory here; the authoritative check runs under the account lock.
    const limitCode = await this.dailyLimitCode(this.db, userId, dto.amountCents);
    if (limitCode) throw new UnprocessableEntityException(limitCode);

    const issued = await this.codes.issue(userId, "withdrawal", {
      amountCents: dto.amountCents.toString(),
      bankCode: String(dto.bankCode),
      accountNumber: dto.accountNumber,
      accountName: dto.accountName,
    });
    return { intentId: issued.id, expiresAt: issued.expiresAt, sentTo: issued.sentTo };
  }

  /** Step 2: the code turns the intent into a held payout. Idempotent per key. */
  async confirm(userId: string, dto: ConfirmPayoutDto): Promise<PayoutResponse> {
    const key = `${userId}:${dto.idempotencyKey}`;
    const replayed = await this.findByKey(key, userId);
    if (replayed) return replayed;

    let payload: Record<string, string>;
    try {
      payload = await this.codes.consume(userId, "withdrawal", dto.code, dto.intentId);
    } catch (err) {
      // A double submit: the first request consumed the code and may already
      // have created the payout — answer with it rather than a code error.
      const again = await this.findByKey(key, userId);
      if (again) return again;
      throw err;
    }
    const spec: PayoutRequestSpec = {
      amountCents: BigInt(payload.amountCents ?? "0"),
      bankCode: Number(payload.bankCode),
      accountNumber: payload.accountNumber ?? "",
      accountName: payload.accountName ?? "",
    };
    return this.request(userId, spec, key);
  }

  private async request(
    userId: string,
    spec: PayoutRequestSpec,
    key: string,
  ): Promise<PayoutResponse> {
    await this.ledger.assertCanMoveMoney(userId);
    if (spec.amountCents < this.env.PAYOUT_MIN_CENTS) {
      throw new UnprocessableEntityException("amount_too_small");
    }

    const userEtbId = await this.ledger.ensureUserAccount(userId, "ETB");
    const holdId = await this.ledger.systemAccountId("system:payout_hold");

    let row: PayoutRow;
    try {
      row = await this.db.transaction(async (tx): Promise<PayoutRow> => {
        // Insert-first claim — the same mutex pattern orders use.
        const claimed = await tx
          .insert(payouts)
          .values({
            userId,
            amountCents: spec.amountCents,
            bankCode: spec.bankCode,
            accountNumber: spec.accountNumber,
            accountName: spec.accountName,
            idempotencyKey: key,
          })
          .onConflictDoNothing()
          .returning();
        const payout = claimed[0];
        if (!payout) throw new ReplaySentinel();

        // The user's ETB lock also serializes this user's concurrent payouts,
        // so the daily totals read below cannot race.
        const balances = await this.ledger.lockAndReadBalances(tx, [userEtbId, holdId]);
        const refusal =
          (balances.get(userEtbId) ?? 0n) < spec.amountCents
            ? "insufficient_balance"
            : await this.dailyLimitCode(tx, userId, spec.amountCents, payout.id);
        if (refusal) {
          // Business refusals COMMIT — the refused request stays on record.
          const rejected = await tx
            .update(payouts)
            .set({ status: "rejected", failureReason: refusal })
            .where(eq(payouts.id, payout.id))
            .returning();
          return rejected[0] ?? payout;
        }

        await this.ledger.postTransaction(tx, {
          kind: "withdrawal",
          payoutId: payout.id,
          initiatedBy: userId,
          note: "payout_hold",
          entries: [
            { accountId: userEtbId, asset: "ETB", amount: -spec.amountCents },
            { accountId: holdId, asset: "ETB", amount: spec.amountCents },
          ],
        });
        await tx.insert(auditLogs).values({
          actorId: userId,
          actorLabel: `user:${userId}`,
          action: "payout_requested",
          targetType: "payout",
          targetId: payout.id,
          after: {
            amountCents: spec.amountCents.toString(),
            bankCode: spec.bankCode,
            accountNumber: spec.accountNumber,
            confirmedBy: "email_code",
          },
        });
        return payout;
      });
    } catch (err) {
      if (err instanceof ReplaySentinel) {
        const winner = await this.findByKey(key, userId);
        if (winner) return winner;
        throw new ConflictException("conflict");
      }
      throw err;
    }

    if (row.status === "rejected") {
      throw new UnprocessableEntityException({
        message: row.failureReason ?? "rejected",
        payoutId: row.id,
      });
    }

    const routeReason = await this.manualReason(row);
    if (routeReason === null) {
      try {
        return await this.executeTransfer(row, SYSTEM_AUTO, "payout_auto_approved");
      } catch (err) {
        // Anything inside the instant path that throws before the claim leaves
        // the payout `requested` for finance — never stranded, never sent.
        console.error(`payout auto-approve failed for ${row.id}:`, err);
        await this.routeToFinance(row, "auto_path_failed");
        return this.serialize(await this.mustGet(row.id));
      }
    }
    await this.routeToFinance(row, routeReason);
    return this.serialize(row);
  }

  async listOwn(userId: string): Promise<{ payouts: PayoutResponse[] }> {
    const rows = await this.db
      .select()
      .from(payouts)
      .where(eq(payouts.userId, userId))
      .orderBy(desc(payouts.createdAt))
      .limit(50);
    return { payouts: rows.map((r) => this.serialize(r)) };
  }

  // ── staff paths (called from the admin module, finance role) ────

  async listByStatus(status?: PayoutStatus): Promise<{ payouts: (PayoutResponse & { userEmail: string })[] }> {
    const where = status ? eq(payouts.status, status) : undefined;
    const rows = await this.db
      .select({ payout: payouts, email: users.email })
      .from(payouts)
      .innerJoin(users, eq(payouts.userId, users.id))
      .where(where)
      .orderBy(desc(payouts.createdAt))
      .limit(100);
    return {
      payouts: rows.map((r) => ({ ...this.serialize(r.payout), userEmail: r.email })),
    };
  }

  /**
   * Finance approve: requested → processing (Chapa transfer) → settled.
   * In test mode the transfer outcome is forced to success (verified sandbox
   * behaviour); the verify call afterwards still gates the money movement.
   */
  async approve(payoutId: string, actorId: string): Promise<PayoutResponse> {
    // Checked BEFORE any state moves: an unconfigured Chapa must leave the
    // payout `requested`, not strand it in `processing`.
    this.chapa.assertConfigured();
    const payout = await this.mustGet(payoutId);
    if (payout.userId === actorId) {
      // Non-negotiable #4: never your own payout.
      throw new ForbiddenException("cannot_approve_own");
    }
    return this.executeTransfer(payout, { id: actorId, label: `staff:${actorId}` }, "payout_approved");
  }

  async reject(payoutId: string, actorId: string, note?: string): Promise<PayoutResponse> {
    const actor: Actor = { id: actorId, label: `staff:${actorId}` };
    const rejected = await this.refundIfStatus(
      payoutId,
      ["requested"],
      note ?? "rejected_by_finance",
      actor,
      "payout_rejected_refund",
    );
    if (!rejected) throw new ConflictException("payout_not_pending");
    await this.audit(actor, "payout_rejected", payoutId, { note: note ?? null });
    void this.notifications.emit(rejected.userId, "payout_rejected", {
      amountCents: rejected.amountCents.toString(),
    });
    return this.serialize(rejected);
  }

  /**
   * payout.* webhook events, keyed by our transfer reference. A webhook is a
   * prompt to check, never state: success AND failure are both re-verified
   * against Chapa before any money moves.
   */
  async handleTransferEvent(reference: string, event: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(payouts)
      .where(eq(payouts.chapaTransferRef, reference))
      .limit(1);
    const payout = rows[0];
    if (!payout) return;
    if (payout.status !== "approved" && payout.status !== "processing") return;
    if (!event.startsWith("payout.")) return;

    const resolved = await this.resolveByVerify(payout, CHAPA_WEBHOOK, "chapa_webhook");
    if (!resolved && event !== "payout.success") {
      // A failure event Chapa's own verify does not confirm: record it and
      // leave the money held. The sweeper keeps checking.
      await this.audit(CHAPA_WEBHOOK, "payout_webhook_unconfirmed", payout.id, { event });
    }
  }

  // ── internals ───────────────────────────────────────────────────

  /**
   * The approval + transfer sequence, shared by finance approve and the
   * instant path. The conditional first UPDATE is the mutex (double-click, or
   * the instant path racing a human).
   */
  private async executeTransfer(
    payout: PayoutRow,
    actor: Actor,
    approveAction: "payout_approved" | "payout_auto_approved",
  ): Promise<PayoutResponse> {
    // The world may have changed since the request: a freeze, a lost
    // verification. Nothing is sent to someone who may not move money now.
    await this.ledger.assertCanMoveMoney(payout.userId);

    // 3 + 32 = 35 chars — Chapa rejects references over 36 ("ALKPO" + uuid
    // was 37 and failed live; caught 13 Aug 2026).
    const reference = `ALK${payout.id.replace(/-/g, "")}`;
    const claimed = await this.db
      .update(payouts)
      .set({
        status: "processing",
        approvedBy: actor.id,
        chapaTransferRef: reference,
      })
      .where(and(eq(payouts.id, payout.id), eq(payouts.status, "requested")))
      .returning();
    const processing = claimed[0];
    if (!processing) throw new ConflictException("payout_not_pending");

    await this.audit(actor, approveAction, payout.id, {
      amountCents: payout.amountCents.toString(),
      reference,
    });

    try {
      await this.chapa.transfer({
        reference,
        amountCents: payout.amountCents,
        bankCode: payout.bankCode,
        accountNumber: payout.accountNumber,
        accountName: payout.accountName,
        forceStatus: "success",
      });
    } catch (err) {
      if (err instanceof ChapaApiError && err.definitive) {
        // Chapa answered, in JSON, that it did not take the transfer (bad
        // account, insufficient merchant balance, …) — safe to refund.
        await this.refundAndReject(processing, actor, `chapa: ${err.message}`);
        return this.serialize(await this.mustGet(payout.id));
      }
      // Ambiguous (5xx, gateway page, timeout, network): the transfer MAY
      // have queued. Stay `processing`; verify — now, via webhook, or the
      // sweeper — resolves it. Never refund on ambiguity.
      await this.audit(actor, "payout_transfer_ambiguous", payout.id, {
        error: err instanceof Error ? err.message : String(err),
        httpStatus: err instanceof ChapaApiError ? err.httpStatus : null,
      });
      return this.serialize(processing);
    }

    // Verify immediately; forced-success test transfers settle right here.
    const resolved = await this.resolveByVerify(processing, actor, "chapa_transfer");
    if (resolved) return this.serialize(resolved);
    void this.notifications.emit(payout.userId, "payout_approved", {
      amountCents: payout.amountCents.toString(),
    });
    return this.serialize(processing);
  }

  /**
   * Ask Chapa what happened to a transfer and act ONLY on a clear answer.
   * Returns the resolved row, or null when it is still pending/unknown.
   * Verify errors are ambiguous by definition: they resolve nothing.
   */
  private async resolveByVerify(
    payout: PayoutRow,
    actor: Actor,
    via: string,
  ): Promise<PayoutRow | null> {
    const reference = payout.chapaTransferRef;
    if (!reference) return null;
    let status = "";
    try {
      const verified = await this.chapa.verifyTransfer(reference);
      status = verified?.status?.toLowerCase() ?? "";
    } catch {
      return null;
    }
    if (status === "success" || status === "successful") {
      await this.settleLedger(payout, actor, via);
      return this.mustGet(payout.id);
    }
    if (status === "failed" || status === "cancelled") {
      await this.refundAndReject(payout, actor, `chapa transfer ${status}`);
      return this.mustGet(payout.id);
    }
    // Sandbox reality (verified live 13 Aug 2026): test-mode
    // /transfers/verify returns `data: [null]` — no per-transfer status
    // exists, so a forced-success test transfer would sit `processing`
    // forever. The envelope success IS the sandbox confirmation. Live keys
    // never take this branch.
    if (this.chapa.testMode && status === "") {
      await this.settleLedger(payout, actor, `${via}_sandbox`);
      return this.mustGet(payout.id);
    }
    return null;
  }

  /**
   * Move the held cents out of the platform and mark settled. Idempotent:
   * the conditional UPDATE (processing/approved → settled) is the mutex.
   */
  private async settleLedger(payout: PayoutRow, actor: Actor, via: string): Promise<void> {
    const holdId = await this.ledger.systemAccountId("system:payout_hold");
    const externalId = await this.ledger.systemAccountId("system:external");

    let settled = false;
    await this.db.transaction(async (tx) => {
      const claimed = await tx
        .update(payouts)
        .set({ status: "settled", settledAt: sql`now()` })
        .where(
          and(eq(payouts.id, payout.id), inArray(payouts.status, ["approved", "processing"])),
        )
        .returning();
      if (!claimed[0]) return;

      await this.ledger.lockAndReadBalances(tx, [holdId, externalId]);
      await this.ledger.postTransaction(tx, {
        kind: "withdrawal",
        payoutId: payout.id,
        initiatedBy: actor.id ?? undefined,
        note: via,
        entries: [
          { accountId: holdId, asset: "ETB", amount: -payout.amountCents },
          { accountId: externalId, asset: "ETB", amount: payout.amountCents },
        ],
      });
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        actorLabel: actor.label,
        action: "payout_settled",
        targetType: "payout",
        targetId: payout.id,
        after: { via, amountCents: payout.amountCents.toString() },
      });
      settled = true;
    });

    if (settled) {
      void this.notifications.emit(payout.userId, "payout_settled", {
        amountCents: payout.amountCents.toString(),
        accountNumber: payout.accountNumber,
      });
    }
  }

  /** The transfer definitively did not happen — put the money back, record why. */
  private async refundAndReject(payout: PayoutRow, actor: Actor, reason: string): Promise<void> {
    const rejected = await this.refundIfStatus(
      payout.id,
      ["approved", "processing"],
      reason,
      actor,
      "payout_failed_refund",
    );
    if (!rejected) return;
    await this.audit(actor, "payout_transfer_failed", payout.id, { reason });
    void this.notifications.emit(rejected.userId, "payout_rejected", {
      amountCents: rejected.amountCents.toString(),
    });
  }

  /**
   * Status change and refund in ONE transaction: a crash between the two can
   * no longer leave a `rejected` payout whose cents are still held.
   */
  private async refundIfStatus(
    payoutId: string,
    from: PayoutStatus[],
    reason: string,
    actor: Actor,
    note: string,
  ): Promise<PayoutRow | null> {
    const peek = await this.mustGet(payoutId);
    const holdId = await this.ledger.systemAccountId("system:payout_hold");
    const userEtbId = await this.ledger.ensureUserAccount(peek.userId, "ETB");

    return this.db.transaction(async (tx) => {
      const claimed = await tx
        .update(payouts)
        .set({ status: "rejected", failureReason: reason })
        .where(and(eq(payouts.id, payoutId), inArray(payouts.status, from)))
        .returning();
      const rejected = claimed[0];
      if (!rejected) return null;

      await this.ledger.lockAndReadBalances(tx, [holdId, userEtbId]);
      await this.ledger.postTransaction(tx, {
        kind: "withdrawal",
        payoutId,
        initiatedBy: actor.id ?? undefined,
        note,
        entries: [
          { accountId: holdId, asset: "ETB", amount: -rejected.amountCents },
          { accountId: userEtbId, asset: "ETB", amount: rejected.amountCents },
        ],
      });
      return rejected;
    });
  }

  /**
   * Why this payout must wait for a human, or null when the instant path may
   * take it. Every condition is a reason to involve a person, never a refusal.
   */
  private async manualReason(row: PayoutRow): Promise<string | null> {
    const threshold = this.env.PAYOUT_AUTO_APPROVE_MAX_CENTS;
    if (threshold <= 0n || row.amountCents >= threshold) return "over_threshold";
    if (!this.chapa.configured) return "chapa_unconfigured";

    const prior = await this.db
      .select({ id: payouts.id })
      .from(payouts)
      .where(
        and(
          eq(payouts.userId, row.userId),
          eq(payouts.bankCode, row.bankCode),
          eq(payouts.accountNumber, row.accountNumber),
          eq(payouts.status, "settled"),
          ne(payouts.id, row.id),
        ),
      )
      .limit(1);
    if (prior.length === 0) return "new_destination";

    const idv = await this.db
      .select({ legalName: identityVerifications.legalName })
      .from(identityVerifications)
      .where(eq(identityVerifications.userId, row.userId))
      .limit(1);
    if (!idv[0] || !nameMatches(idv[0].legalName, row.accountName)) return "name_mismatch";

    const today = await this.dayTotals(this.db, row.userId);
    if (today.sum >= this.env.COMPLIANCE_REVIEW_THRESHOLD_CENTS) return "daily_aggregate";
    return null;
  }

  private async routeToFinance(row: PayoutRow, reason: string): Promise<void> {
    await this.audit({ id: null, label: "system:payout_router" }, "payout_routed_to_finance", row.id, {
      reason,
      amountCents: row.amountCents.toString(),
    });
    void this.notifications.emit(row.userId, "payout_requested", {
      amountCents: row.amountCents.toString(),
    });
    void this.notifications.emitToStaff(["finance", "administrator"], "staff_alert", {
      kind: "payout_review",
      message: `Withdrawal of ${formatEtb(row.amountCents)} ETB is waiting for approval (reason: ${reason}).`,
      url: "/admin/payouts",
    });
  }

  /** Daily totals for this user, over every payout not refused (EAT day). */
  private async dayTotals(
    handle: Db | Tx,
    userId: string,
    excludeId?: string,
  ): Promise<{ sum: bigint; count: number }> {
    const rows = await handle
      .select({
        sum: sql<string>`coalesce(sum(${payouts.amountCents}), 0)::bigint`,
        count: sql<number>`count(*)::int`,
      })
      .from(payouts)
      .where(
        and(
          eq(payouts.userId, userId),
          inArray(payouts.status, COUNTED),
          gte(payouts.createdAt, eatDayStartUtc()),
          ...(excludeId ? [ne(payouts.id, excludeId)] : []),
        ),
      );
    return { sum: BigInt(rows[0]?.sum ?? "0"), count: rows[0]?.count ?? 0 };
  }

  private async dailyLimitCode(
    handle: Db | Tx,
    userId: string,
    amountCents: bigint,
    excludeId?: string,
  ): Promise<"payout_daily_limit" | "payout_daily_count" | null> {
    const today = await this.dayTotals(handle, userId, excludeId);
    if (today.count + 1 > this.env.PAYOUT_DAILY_MAX_COUNT) return "payout_daily_count";
    if (today.sum + amountCents > this.env.PAYOUT_DAILY_MAX_CENTS) return "payout_daily_limit";
    return null;
  }

  /**
   * Background reconciliation (every 10 min, one instance): transfers left
   * `processing` by an ambiguous answer get verified until Chapa gives a
   * clear one; anything Chapa still does not know after an hour is put in
   * front of a human. Nothing here refunds on a guess.
   */
  async sweep(): Promise<void> {
    const rows = await this.db
      .select()
      .from(payouts)
      .where(
        and(
          inArray(payouts.status, ["approved", "processing"]),
          lt(payouts.createdAt, sql`now() - interval '5 minutes'`),
        ),
      )
      .orderBy(payouts.createdAt)
      .limit(50);
    for (const payout of rows) {
      const resolved = await this.resolveByVerify(payout, SWEEPER, "sweeper_verified");
      if (resolved) continue;
      const ageMin = (Date.now() - payout.createdAt.getTime()) / 60_000;
      if (ageMin < STUCK_ALERT_MIN) continue;
      const first = await this.redis.set(`payout:stuck-alerted:${payout.id}`, "1", "EX", 86_400, "NX");
      if (first) {
        void this.notifications.emitToStaff(["finance", "administrator"], "staff_alert", {
          kind: "payout_stuck",
          message: `Withdrawal ${payout.chapaTransferRef ?? payout.id} of ${formatEtb(payout.amountCents)} ETB has been processing for ${Math.round(ageMin)} minutes and Chapa has not confirmed it. Check the Chapa dashboard before acting.`,
          url: "/admin/payouts",
        });
      }
    }
  }

  private async mustGet(payoutId: string): Promise<PayoutRow> {
    const rows = await this.db.select().from(payouts).where(eq(payouts.id, payoutId)).limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundException("payout_not_found");
    return row;
  }

  private async findByKey(key: string, userId: string): Promise<PayoutResponse | null> {
    const rows = await this.db
      .select()
      .from(payouts)
      .where(eq(payouts.idempotencyKey, key))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    if (row.userId !== userId) throw new ConflictException("conflict");
    if (row.status === "rejected" && row.failureReason && USER_REFUSALS.has(row.failureReason)) {
      throw new UnprocessableEntityException({
        message: row.failureReason,
        payoutId: row.id,
      });
    }
    return this.serialize(row);
  }

  private async audit(
    actor: Actor,
    action: string,
    payoutId: string,
    after: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(auditLogs).values({
      actorId: actor.id,
      actorLabel: actor.label,
      action,
      targetType: "payout",
      targetId: payoutId,
      after,
    });
  }

  private serialize(row: PayoutRow): PayoutResponse {
    return {
      id: row.id,
      amountCents: row.amountCents.toString(),
      status: row.status as PayoutStatus,
      bankCode: row.bankCode,
      accountNumber: row.accountNumber,
      accountName: row.accountName,
      failureReason: row.failureReason,
      createdAt: row.createdAt.toISOString(),
      settledAt: row.settledAt ? row.settledAt.toISOString() : null,
    };
  }
}

/** Letters only, lower-cased, NFKC — so "ABEBE  K." and "Abebe K" compare equal. */
function nameTokens(name: string): string[] {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/**
 * The account name must be the verified legal name or a shortening of it:
 * at least two name parts, every one of them present in the legal name
 * (banks often hold "ABEBE KEBEDE" for "Abebe Kebede Tesfaye").
 */
export function nameMatches(legalName: string, accountName: string): boolean {
  const legal = new Set(nameTokens(legalName));
  const account = nameTokens(accountName);
  return account.length >= 2 && account.every((t) => legal.has(t));
}

function formatEtb(cents: bigint): string {
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${whole}.${(cents % 100n).toString().padStart(2, "0")}`;
}
