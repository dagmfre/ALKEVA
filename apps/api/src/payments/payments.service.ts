import { randomUUID } from "node:crypto";
import {
  BadGatewayException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common";
import { and, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { Redis } from "ioredis";
import {
  auditLogs,
  complianceEvents,
  freezes,
  payments,
  users,
  type Db,
} from "@alkeva/db";
import {
  parseDepositChannels,
  type CreatePaymentDto,
  type DepositChannelsResponse,
  type Env,
  type PaymentResponse,
  type PaymentStatus,
} from "@alkeva/shared";
import { DB, ENV, REDIS } from "../core/core.module.js";
import { every, runExclusive } from "../core/schedule.js";
import { ChapaApiError, ChapaService, etbToCents } from "../chapa/chapa.service.js";
import { LedgerService } from "../ledger/ledger.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";

type PaymentRow = typeof payments.$inferSelect;

/**
 * Deposits — Design §5, implemented exactly:
 * initialize → hosted checkout → webhook → SERVER-SIDE VERIFY → ledger credit.
 * The redirect/return page never credits; `settleByTxRef` is the only path
 * that moves money, and it is idempotent under webhook retries (Chapa resends
 * every 10 minutes up to 10 times without a 200).
 */
/** Rows a later verified success may still credit (never credited/reversed). */
const CREDITABLE = ["initiated", "webhook_received", "verified", "failed"] as const;

@Injectable()
export class PaymentsService implements OnModuleInit, OnApplicationShutdown {
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly chapa: ChapaService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.sweepTimer = every(10 * 60_000, "payment sweep", () =>
      runExclusive(this.redis, "lock:payment-sweep", 540, () => this.sweep()),
    );
  }

  onApplicationShutdown(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /**
   * Lost-webhook recovery (every 10 min, one instance): checkouts that never
   * heard back are re-verified; a checkout nobody paid for in 3 days is closed.
   */
  async sweep(): Promise<void> {
    if (!this.chapa.configured) return;
    const open = await this.db
      .select({ id: payments.id, txRef: payments.chapaTxRef, createdAt: payments.createdAt })
      .from(payments)
      .where(
        and(
          inArray(payments.status, ["initiated", "webhook_received", "verified"]),
          lt(payments.createdAt, sql`now() - interval '10 minutes'`),
        ),
      )
      .limit(100);
    for (const p of open) {
      try {
        await this.settleByTxRef(p.txRef);
      } catch (err) {
        console.error(`payment sweep: verify failed for ${p.txRef}:`, err);
        continue;
      }
      if (Date.now() - p.createdAt.getTime() > 3 * 86_400_000) {
        await this.db
          .update(payments)
          .set({ status: "failed" })
          .where(
            and(eq(payments.id, p.id), inArray(payments.status, ["initiated", "webhook_received"])),
          );
      }
    }
  }

  channels(): DepositChannelsResponse {
    const channels = parseDepositChannels(this.env.DEPOSIT_CHANNELS_JSON);
    return {
      channels: channels.map((c) => ({
        key: c.key,
        minInCents: c.minInCents ?? null,
        maxInCents: c.maxInCents ?? null,
        maxOutCents: c.maxOutCents ?? null,
      })),
      minDepositCents: this.env.DEPOSIT_MIN_CENTS.toString(),
    };
  }

  async create(
    userId: string,
    dto: CreatePaymentDto,
    channel: "web" | "telegram" = "web",
  ): Promise<PaymentResponse> {
    this.chapa.assertConfigured();
    await this.ledger.assertCanMoveMoney(userId);
    if (dto.amountCents < this.env.DEPOSIT_MIN_CENTS) {
      throw new UnprocessableEntityException("amount_too_small");
    }

    const userRows = await this.db
      .select({ email: users.email, fullName: users.fullName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const user = userRows[0];
    if (!user) throw new NotFoundException("user_not_found");

    const txRef = `ALKEVA-DEP-${randomUUID()}`;
    const inserted = await this.db
      .insert(payments)
      .values({ userId, chapaTxRef: txRef, amountCents: dto.amountCents })
      .returning();
    const payment = inserted[0];
    if (!payment) throw new BadGatewayException("payment_create_failed");

    try {
      const { checkoutUrl } = await this.chapa.initializeTransaction({
        txRef,
        amountCents: dto.amountCents,
        email: user.email,
        fullName: user.fullName,
        // The id (not tx_ref) rides the return URL: the poll + reconcile
        // endpoints are id-keyed and ownership-scoped.
        // Telegram: a static page on the main site that fetches nothing and
        // only offers the t.me link back into the Mini App — the credit still
        // comes solely from the verified webhook / reconcile path.
        returnUrl:
          channel === "telegram"
            ? `${this.env.WEB_ORIGIN}/telegram/return?id=${payment.id}`
            : `${this.env.WEB_ORIGIN}/deposit/return?id=${payment.id}`,
      });
      return { ...this.serialize(payment), checkoutUrl };
    } catch (err) {
      // The checkout never existed — record the failure so the row can't be
      // mistaken for an abandoned-but-payable deposit.
      await this.db
        .update(payments)
        .set({ status: "failed" })
        .where(and(eq(payments.id, payment.id), ne(payments.status, "credited")));
      if (err instanceof ChapaApiError) {
        throw new BadGatewayException({ message: "chapa_error", detail: err.message });
      }
      throw err;
    }
  }

  async getOwn(userId: string, id: string): Promise<PaymentResponse> {
    const rows = await this.db
      .select()
      .from(payments)
      .where(and(eq(payments.id, id), eq(payments.userId, userId)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundException("payment_not_found");
    return this.serialize(row);
  }

  /**
   * User-triggered settle: the return-page (and any lost-webhook recovery)
   * path. Safe because it runs the same server-side verify as the webhook —
   * the caller triggers a check, never a credit.
   */
  async reconcileOwn(userId: string, id: string): Promise<PaymentResponse> {
    const payment = await this.getOwn(userId, id);
    await this.settleByTxRef(payment.txRef);
    return this.getOwn(userId, id);
  }

  /** Webhook entry: record the event, then run the shared settle. */
  async handleChargeEvent(
    txRef: string,
    event: string,
    rawEvent: unknown,
  ): Promise<void> {
    const rows = await this.db
      .select({ id: payments.id, status: payments.status })
      .from(payments)
      .where(eq(payments.chapaTxRef, txRef))
      .limit(1);
    const payment = rows[0];
    // Unknown tx_ref: not ours (or forged past the signature) — nothing to do.
    if (!payment) return;

    await this.db
      .update(payments)
      .set({
        rawWebhook: rawEvent,
        // Only forward from `initiated` — never regress credited/failed.
        ...(payment.status === "initiated" ? { status: "webhook_received" as const } : {}),
      })
      .where(eq(payments.id, payment.id));

    if (event === "charge.refunded" || event === "charge.reversed") {
      await this.handleReversal(txRef, event);
    } else if (event.startsWith("charge.")) {
      // Success AND failure alike only prompt a server-side verify — an
      // unverified "failed" must never close a checkout the customer may still
      // pay (or has paid), and an unverified success never credits.
      await this.settleByTxRef(txRef);
    }
  }

  /**
   * The provider took a credited deposit back (charge.refunded/reversed).
   * Acts only when Chapa's own verify confirms it: the account is frozen for
   * compliance, whatever of the amount is still in the account is debited back
   * out, and any shortfall is recorded for a human. A balance is never pushed
   * below zero.
   */
  private async handleReversal(txRef: string, event: string): Promise<void> {
    const rows = await this.db.select().from(payments).where(eq(payments.chapaTxRef, txRef)).limit(1);
    const payment = rows[0];
    if (!payment) return;

    let status = "";
    try {
      status = String((await this.chapa.verifyTransaction(txRef))?.status ?? "").toLowerCase();
    } catch {
      status = "";
    }
    if (status !== "refunded" && status !== "reversed") {
      await this.db.insert(auditLogs).values({
        actorLabel: "chapa-webhook",
        action: "payment_reversal_unconfirmed",
        targetType: "payment",
        targetId: payment.id,
        after: { event, verifiedStatus: status || null },
      });
      void this.notifications.emitToStaff(["compliance", "administrator"], "staff_alert", {
        kind: "deposit_reversal_unconfirmed",
        message: `Chapa sent ${event} for deposit ${txRef}, but its verify says "${status || "unknown"}". Nothing was changed — check the Chapa dashboard.`,
        url: "/admin/transactions",
      });
      return;
    }

    if (payment.status !== "credited") {
      // Never credited: close it, nothing to claw back.
      await this.db
        .update(payments)
        .set({ status: "failed" })
        .where(and(eq(payments.id, payment.id), ne(payments.status, "credited")));
      return;
    }

    const userEtbId = await this.ledger.ensureUserAccount(payment.userId, "ETB");
    const externalId = await this.ledger.systemAccountId("system:external");
    let debited = 0n;
    let applied = false;
    await this.db.transaction(async (tx) => {
      const claimed = await tx
        .update(payments)
        .set({ status: "reversed" })
        .where(and(eq(payments.id, payment.id), eq(payments.status, "credited")))
        .returning({ id: payments.id });
      if (claimed.length === 0) return;

      const balances = await this.ledger.lockAndReadBalances(tx, [userEtbId, externalId]);
      const available = balances.get(userEtbId) ?? 0n;
      debited =
        available >= payment.amountCents ? payment.amountCents : available > 0n ? available : 0n;
      if (debited > 0n) {
        await this.ledger.postTransaction(tx, {
          kind: "deposit",
          paymentId: payment.id,
          note: "deposit_reversed",
          entries: [
            { accountId: userEtbId, asset: "ETB", amount: -debited },
            { accountId: externalId, asset: "ETB", amount: debited },
          ],
        });
      }
      const open = await tx
        .select({ id: freezes.id })
        .from(freezes)
        .where(and(eq(freezes.userId, payment.userId), isNull(freezes.liftedAt)))
        .limit(1);
      if (open.length === 0) {
        await tx.insert(freezes).values({
          userId: payment.userId,
          reason: `deposit ${txRef} ${status} by the payment provider`,
          createdBy: "chapa-reversal",
        });
        await tx.update(users).set({ status: "frozen" }).where(eq(users.id, payment.userId));
      }
      const evidence = {
        paymentId: payment.id,
        txRef,
        amountCents: payment.amountCents.toString(),
        debitedCents: debited.toString(),
        shortfallCents: (payment.amountCents - debited).toString(),
      };
      await tx.insert(complianceEvents).values({
        userId: payment.userId,
        ruleKey: "deposit_reversed",
        action: "freeze",
        evidence,
      });
      await tx.insert(auditLogs).values({
        actorLabel: "chapa-webhook",
        action: "deposit_reversed",
        targetType: "payment",
        targetId: payment.id,
        after: evidence,
      });
      applied = true;
    });

    if (applied) {
      const short = payment.amountCents - debited;
      void this.notifications.emit(payment.userId, "deposit_reversed", {
        amountCents: payment.amountCents.toString(),
      });
      void this.notifications.emitToStaff(["compliance", "administrator"], "staff_alert", {
        kind: "deposit_reversed",
        message: `Deposit ${txRef} (${payment.amountCents / 100n} ETB) was ${status} by the provider. The account is frozen; ${debited / 100n} ETB was debited back${short > 0n ? `, ${short / 100n} ETB short` : ""}.`,
        url: "/admin/users",
      });
    }
  }

  /**
   * The ONLY code path that credits a deposit. Idempotent: the conditional
   * UPDATE to `credited` is the mutex — a rival webhook/reconcile loses the
   * UPDATE and no-ops. Verify-before-credit is non-negotiable: status, mode,
   * currency, and the exact amount must match what we initialized.
   */
  async settleByTxRef(txRef: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(payments)
      .where(eq(payments.chapaTxRef, txRef))
      .limit(1);
    const payment = rows[0];
    // A `failed` row is still verified: a customer can retry a checkout and
    // succeed after an earlier failure — they must be credited.
    if (!payment || payment.status === "credited" || payment.status === "reversed") return;

    const verified = await this.chapa.verifyTransaction(txRef);
    if (!verified) return; // Chapa doesn't know it yet (pending) — try again later.
    if (verified.status === "failed") {
      await this.db
        .update(payments)
        .set({ status: "failed" })
        .where(and(eq(payments.id, payment.id), inArray(payments.status, [...CREDITABLE])));
      return;
    }
    if (verified.status !== "success") return; // pending

    const expectedMode = this.chapa.testMode ? "test" : "live";
    const amountMatches = etbToCents(verified.amount) === payment.amountCents;
    if (verified.currency !== "ETB" || !amountMatches || verified.mode !== expectedMode) {
      // Verified state disagrees with what we initialized — never credit,
      // leave the row uncredited, and put the mismatch on the audit trail.
      await this.db.insert(auditLogs).values({
        actorLabel: "chapa-webhook",
        action: "payment_verify_mismatch",
        targetType: "payment",
        targetId: payment.id,
        after: {
          expected: { amountCents: payment.amountCents.toString(), currency: "ETB", mode: expectedMode },
          got: {
            amount: String(verified.amount),
            currency: verified.currency,
            mode: verified.mode,
            status: verified.status,
          },
        },
      });
      return;
    }

    const userEtbId = await this.ledger.ensureUserAccount(payment.userId, "ETB");
    const externalId = await this.ledger.systemAccountId("system:external");

    let credited = false;
    await this.db.transaction(async (tx) => {
      // The idempotency mutex: exactly one settle wins this UPDATE.
      const claimed = await tx
        .update(payments)
        .set({ status: "credited", creditedAt: sql`now()` })
        .where(and(eq(payments.id, payment.id), inArray(payments.status, [...CREDITABLE])))
        .returning({ id: payments.id });
      if (claimed.length === 0) return;

      await this.ledger.lockAndReadBalances(tx, [userEtbId, externalId]);
      await this.ledger.postTransaction(tx, {
        kind: "deposit",
        paymentId: payment.id,
        initiatedBy: payment.userId,
        note: "chapa_deposit",
        entries: [
          { accountId: externalId, asset: "ETB", amount: -payment.amountCents },
          { accountId: userEtbId, asset: "ETB", amount: payment.amountCents },
        ],
      });
      await tx.insert(auditLogs).values({
        actorLabel: "chapa-webhook",
        action: "deposit_credited",
        targetType: "payment",
        targetId: payment.id,
        after: { txRef, amountCents: payment.amountCents.toString() },
      });
      credited = true;
    });

    if (credited) {
      void this.notifications.emit(payment.userId, "deposit_credited", {
        amountCents: payment.amountCents.toString(),
        txRef,
      });
    }
  }

  private serialize(row: PaymentRow): PaymentResponse {
    return {
      id: row.id,
      txRef: row.chapaTxRef,
      amountCents: row.amountCents.toString(),
      status: row.status as PaymentStatus,
      createdAt: row.createdAt.toISOString(),
      creditedAt: row.creditedAt ? row.creditedAt.toISOString() : null,
    };
  }
}
