import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { auditLogs, payouts, users, type Db } from "@alkeva/db";
import type {
  BankDto,
  CreatePayoutDto,
  Env,
  PayoutResponse,
  PayoutStatus,
} from "@alkeva/shared";
import { DB, ENV } from "../core/core.module.js";
import { ChapaApiError, ChapaService } from "../chapa/chapa.service.js";
import { LedgerService } from "../ledger/ledger.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";

type PayoutRow = typeof payouts.$inferSelect;

/** Who is moving the money — a staff member, the auto-approve system, or a webhook. */
interface Actor {
  id: string | null;
  label: string;
}

const SYSTEM_AUTO: Actor = { id: null, label: "system:auto_approve" };
const CHAPA_WEBHOOK: Actor = { id: null, label: "chapa-webhook" };

/** Thrown inside the tx when a concurrent request holds the idempotency key. */
class ReplaySentinel extends Error {}

/**
 * Withdrawals — Design §5: request → ledger HOLD → approval → Chapa transfer
 * → settle. The user's cents park in system:payout_hold between request and
 * approve/reject, so the balance drop is real and a reject refunds to the
 * cent.
 *
 * Below PAYOUT_AUTO_APPROVE_MAX_CENTS the approval happens at request time by
 * a system actor — the audit-logged single-step variant the cut list allows —
 * so an everyday withdrawal is as instant as a deposit. At or above the
 * threshold (and whenever Chapa is unconfigured or anything in the instant
 * path fails) the payout stays `requested` for a human finance approver:
 * large outflows keep a person in the loop (non-negotiable #4), and a staff
 * member still can never approve their own payout.
 */
@Injectable()
export class PayoutsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly chapa: ChapaService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
  ) {}

  async banks(): Promise<BankDto[]> {
    const banks = await this.chapa.banks();
    return banks.map((b) => ({
      id: b.id,
      name: b.name,
      isMobileMoney: b.is_mobilemoney === 1 || b.is_mobilemoney === true,
      accountLength: typeof b.acct_length === "number" ? b.acct_length : null,
    }));
  }

  async request(userId: string, dto: CreatePayoutDto): Promise<PayoutResponse> {
    const key = `${userId}:${dto.idempotencyKey}`;

    const replayed = await this.findByKey(key, userId);
    if (replayed) return replayed;

    await this.ledger.assertNotFrozen(userId);
    await this.assertKycTier(userId);
    if (dto.amountCents < this.env.PAYOUT_MIN_CENTS) {
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
            amountCents: dto.amountCents,
            bankCode: dto.bankCode,
            accountNumber: dto.accountNumber,
            accountName: dto.accountName,
            idempotencyKey: key,
          })
          .onConflictDoNothing()
          .returning();
        const payout = claimed[0];
        if (!payout) throw new ReplaySentinel();

        const balances = await this.ledger.lockAndReadBalances(tx, [userEtbId, holdId]);
        if ((balances.get(userEtbId) ?? 0n) < dto.amountCents) {
          // Business rejection COMMITS — the refused request stays on record.
          const rejected = await tx
            .update(payouts)
            .set({ status: "rejected", failureReason: "insufficient_balance" })
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
            { accountId: userEtbId, asset: "ETB", amount: -dto.amountCents },
            { accountId: holdId, asset: "ETB", amount: dto.amountCents },
          ],
        });
        await tx.insert(auditLogs).values({
          actorId: userId,
          actorLabel: `user:${userId}`,
          action: "payout_requested",
          targetType: "payout",
          targetId: payout.id,
          after: {
            amountCents: dto.amountCents.toString(),
            bankCode: dto.bankCode,
            accountNumber: dto.accountNumber,
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

    // Instant path: strictly below the threshold, the system approves and
    // fires the transfer right now. Any failure inside leaves the payout in a
    // consistent state (requested for the finance queue, or already resolved
    // by the transfer-path rules) — the user is never stranded.
    const threshold = this.env.PAYOUT_AUTO_APPROVE_MAX_CENTS;
    if (threshold > 0n && dto.amountCents < threshold && this.chapa.configured) {
      try {
        return await this.executeTransfer(row, SYSTEM_AUTO, "payout_auto_approved");
      } catch (err) {
        console.error(`payout auto-approve failed for ${row.id}:`, err);
        return this.serialize(await this.mustGet(row.id));
      }
    }
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
   * Approve: requested → approved → (Chapa transfer) → processing → settled.
   * The conditional first UPDATE is the double-click mutex. In test mode the
   * transfer outcome is forced to success (verified sandbox behaviour) so the
   * on-stage path is deterministic; the verify call afterwards still gates
   * the actual money movement.
   */
  async approve(payoutId: string, actorId: string): Promise<PayoutResponse> {
    // Checked BEFORE any state moves: an unconfigured Chapa must leave the
    // payout `requested`, not strand it in `processing`.
    this.chapa.assertConfigured();
    const payout = await this.mustGet(payoutId);
    if (payout.userId === actorId) {
      // Non-negotiable #4: never your own payout, even in the demo. The
      // system auto-approve path is the audited exception, not this one.
      throw new ForbiddenException("cannot_approve_own");
    }
    return this.executeTransfer(payout, { id: actorId, label: `staff:${actorId}` }, "payout_approved");
  }

  /**
   * The approval + transfer sequence, shared by the finance approve and the
   * below-threshold auto-approve. The conditional first UPDATE is the mutex
   * (double-click, or auto racing a human).
   */
  private async executeTransfer(
    payout: PayoutRow,
    actor: Actor,
    approveAction: "payout_approved" | "payout_auto_approved",
  ): Promise<PayoutResponse> {
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
      if (err instanceof ChapaApiError) {
        if (/isn'?t available|not available/i.test(err.message)) {
          // Fact-check §6.4 plan B: sandbox without transfers — mark settled
          // with an explicit audit trail rather than faking a Chapa reference.
          return this.settleLedger(processing, actor, "sandbox_marked");
        }
        // A definitive Chapa refusal (bad account, insufficient merchant
        // balance, …): the transfer never queued — refund the hold.
        return this.refundAndReject(processing, actor, `chapa: ${err.message}`);
      }
      // Ambiguous failure (network/timeout): the transfer MAY have queued.
      // Never refund on ambiguity — that could pay the user twice. Stay
      // `processing`; the webhook or a later verify resolves it.
      await this.audit(actor, "payout_transfer_ambiguous", payout.id, {
        error: String(err),
      });
      return this.serialize(processing);
    }

    // Verify immediately; forced-success test transfers settle right here.
    // A genuinely pending live transfer stays `processing` and settles via
    // the payout.success webhook or a later verify. Verify errors are
    // ambiguous — same rule: stay processing, never refund.
    try {
      const verified = await this.chapa.verifyTransfer(reference);
      const status = verified?.status?.toLowerCase() ?? "";
      if (status === "success" || status === "successful") {
        return this.settleLedger(processing, actor, "chapa_transfer");
      }
      if (status === "failed" || status === "cancelled") {
        return this.refundAndReject(processing, actor, `chapa transfer ${status}`);
      }
      // Sandbox reality (verified live 13 Aug 2026): test-mode transfers are
      // forced to success, but /transfers/verify returns `data: [null]` — no
      // per-transfer status exists in test mode at all, so a forced-success
      // transfer would sit `processing` forever. An envelope-level success
      // with no data IS the sandbox confirmation; settle, clearly audited.
      // Live keys never take this branch.
      if (this.chapa.testMode && status === "") {
        return this.settleLedger(processing, actor, "sandbox_transfer_verified");
      }
    } catch {
      /* stay processing — webhook or later verify resolves it */
    }
    void this.notifications.emit(payout.userId, "payout_approved", {
      amountCents: payout.amountCents.toString(),
    });
    return this.serialize(processing);
  }

  async reject(payoutId: string, actorId: string, note?: string): Promise<PayoutResponse> {
    const claimed = await this.db
      .update(payouts)
      .set({ status: "rejected", failureReason: note ?? "rejected_by_finance" })
      .where(and(eq(payouts.id, payoutId), eq(payouts.status, "requested")))
      .returning();
    const rejected = claimed[0];
    if (!rejected) throw new ConflictException("payout_not_pending");

    const actor: Actor = { id: actorId, label: `staff:${actorId}` };
    await this.refundHold(rejected, actor, "payout_rejected_refund");
    await this.audit(actor, "payout_rejected", payoutId, { note: note ?? null });
    void this.notifications.emit(rejected.userId, "payout_rejected", {
      amountCents: rejected.amountCents.toString(),
    });
    return this.serialize(rejected);
  }

  /** payout.* webhook events land here, keyed by our transfer reference. */
  async handleTransferEvent(reference: string, event: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(payouts)
      .where(eq(payouts.chapaTransferRef, reference))
      .limit(1);
    const payout = rows[0];
    if (!payout) return;
    if (payout.status !== "approved" && payout.status !== "processing") return;

    if (event === "payout.success") {
      // Re-verify before settling — webhooks prompt checks, never state.
      const verified = await this.chapa.verifyTransfer(reference);
      const status = verified?.status?.toLowerCase() ?? "";
      if (status === "success" || status === "successful") {
        await this.settleLedger(payout, CHAPA_WEBHOOK, "chapa_webhook");
      } else if (this.chapa.testMode && status === "") {
        // Same sandbox gap as the approve path: test-mode verify carries no
        // per-transfer data, so the envelope success is the confirmation.
        await this.settleLedger(payout, CHAPA_WEBHOOK, "chapa_webhook_sandbox");
      }
    } else if (event.startsWith("payout.")) {
      await this.refundAndReject(payout, CHAPA_WEBHOOK, `chapa webhook ${event}`);
    }
  }

  // ── internals ───────────────────────────────────────────────────

  /**
   * Move the held cents out of the platform and mark settled. Idempotent:
   * the conditional UPDATE (processing/approved → settled) is the mutex, so
   * approve-verify and a duplicate webhook can both call this safely.
   */
  private async settleLedger(
    payout: PayoutRow,
    actor: Actor,
    via: string,
  ): Promise<PayoutResponse> {
    const holdId = await this.ledger.systemAccountId("system:payout_hold");
    const externalId = await this.ledger.systemAccountId("system:external");

    let settledRow: PayoutRow | null = null;
    await this.db.transaction(async (tx) => {
      const claimed = await tx
        .update(payouts)
        .set({ status: "settled", settledAt: sql`now()` })
        .where(
          and(
            eq(payouts.id, payout.id),
            inArray(payouts.status, ["approved", "processing"]),
          ),
        )
        .returning();
      const row = claimed[0];
      if (!row) return;

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
      settledRow = row;
    });

    const result = settledRow ?? (await this.mustGet(payout.id));
    if (settledRow) {
      void this.notifications.emit(payout.userId, "payout_settled", {
        amountCents: payout.amountCents.toString(),
        accountNumber: payout.accountNumber,
      });
    }
    return this.serialize(result);
  }

  /** Transfer could not happen — put the money back, record why. */
  private async refundAndReject(
    payout: PayoutRow,
    actor: Actor,
    reason: string,
  ): Promise<PayoutResponse> {
    const claimed = await this.db
      .update(payouts)
      .set({ status: "rejected", failureReason: reason })
      .where(
        and(
          eq(payouts.id, payout.id),
          inArray(payouts.status, ["approved", "processing"]),
        ),
      )
      .returning();
    const rejected = claimed[0];
    if (!rejected) return this.serialize(await this.mustGet(payout.id));

    await this.refundHold(rejected, actor, "payout_failed_refund");
    await this.audit(actor, "payout_transfer_failed", payout.id, { reason });
    void this.notifications.emit(rejected.userId, "payout_rejected", {
      amountCents: rejected.amountCents.toString(),
    });
    return this.serialize(rejected);
  }

  /** hold → user, exactly the requested cents. */
  private async refundHold(
    payout: PayoutRow,
    actor: Actor,
    note: string,
  ): Promise<void> {
    const holdId = await this.ledger.systemAccountId("system:payout_hold");
    const userEtbId = await this.ledger.ensureUserAccount(payout.userId, "ETB");
    await this.db.transaction(async (tx) => {
      await this.ledger.lockAndReadBalances(tx, [holdId, userEtbId]);
      await this.ledger.postTransaction(tx, {
        kind: "withdrawal",
        payoutId: payout.id,
        initiatedBy: actor.id ?? undefined,
        note,
        entries: [
          { accountId: holdId, asset: "ETB", amount: -payout.amountCents },
          { accountId: userEtbId, asset: "ETB", amount: payout.amountCents },
        ],
      });
    });
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
    if (row.status === "rejected" && row.failureReason === "insufficient_balance") {
      throw new UnprocessableEntityException({
        message: "insufficient_balance",
        payoutId: row.id,
      });
    }
    return this.serialize(row);
  }

  private async assertKycTier(userId: string): Promise<void> {
    const rows = await this.db
      .select({ kycTier: users.kycTier })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if ((rows[0]?.kycTier ?? 0) < 1) throw new ForbiddenException("kyc_required");
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
