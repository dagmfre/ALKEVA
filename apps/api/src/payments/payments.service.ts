import { randomUUID } from "node:crypto";
import {
  BadGatewayException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, eq, ne, sql } from "drizzle-orm";
import { auditLogs, payments, users, type Db } from "@alkeva/db";
import {
  parseDepositChannels,
  type CreatePaymentDto,
  type DepositChannelsResponse,
  type Env,
  type PaymentResponse,
  type PaymentStatus,
} from "@alkeva/shared";
import { DB, ENV } from "../core/core.module.js";
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
@Injectable()
export class PaymentsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly chapa: ChapaService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
  ) {}

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

  async create(userId: string, dto: CreatePaymentDto): Promise<PaymentResponse> {
    this.chapa.assertConfigured();
    await this.ledger.assertNotFrozen(userId);
    await this.assertKycTier(userId);
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
        returnUrl: `${this.env.WEB_ORIGIN}/deposit/return?id=${payment.id}`,
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

    if (event === "charge.success") {
      await this.settleByTxRef(txRef);
    } else if (event.startsWith("charge.")) {
      // failed / cancelled / reversed-before-credit: terminal, no money moved.
      await this.db
        .update(payments)
        .set({ status: "failed" })
        .where(and(eq(payments.id, payment.id), ne(payments.status, "credited")));
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
    if (!payment || payment.status === "credited" || payment.status === "failed") return;

    const verified = await this.chapa.verifyTransaction(txRef);
    if (!verified) return; // Chapa doesn't know it yet (pending) — try again later.
    if (verified.status === "failed") {
      await this.db
        .update(payments)
        .set({ status: "failed" })
        .where(and(eq(payments.id, payment.id), ne(payments.status, "credited")));
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
        .where(and(eq(payments.id, payment.id), ne(payments.status, "credited")))
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

  private async assertKycTier(userId: string): Promise<void> {
    const rows = await this.db
      .select({ kycTier: users.kycTier })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if ((rows[0]?.kycTier ?? 0) < 1) throw new ForbiddenException("kyc_required");
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
