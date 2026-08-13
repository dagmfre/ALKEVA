import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, ilike, isNull, lt, or, sql } from "drizzle-orm";
import { Redis } from "ioredis";
import {
  auditLogs,
  complianceEvents,
  freezes,
  kycSubmissions,
  orders,
  payments,
  payouts,
  quotes,
  users,
  type Db,
} from "@alkeva/db";
import type {
  AdminAnalyticsPointDto,
  AdminAnalyticsResponse,
  AdminAuditItem,
  AdminKycItem,
  AdminOrderSearchItem,
  AdminOverviewResponse,
  AdminReviewItem,
  AdminSearchDto,
  AdminTreasuryResponse,
  AdminUserDetailResponse,
  AdminUserItem,
  MetalAsset,
  OrderSide,
  OrderStatus,
} from "@alkeva/shared";
import { DB, REDIS } from "../core/core.module.js";
import { ChapaService } from "../chapa/chapa.service.js";
import { LedgerService } from "../ledger/ledger.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { TreasuryService } from "../treasury/treasury.service.js";

const CHAPA_BALANCE_CACHE_KEY = "chapa:balances";

/**
 * The staff console's read models and the two compliance write actions
 * (freeze/unfreeze). Everything else the console does is delegated to the
 * owning service — KYC review to KycService, payout decisions to
 * PayoutsService, review resolution to OrdersService — so no money logic
 * exists here. By construction there is NO balance-adjust path: this service
 * cannot write ledger entries at all (Phase 5 done-when).
 */
@Injectable()
export class AdminService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly ledger: LedgerService,
    private readonly treasury: TreasuryService,
    private readonly chapa: ChapaService,
    private readonly notifications: NotificationsService,
  ) {}

  async overview(): Promise<AdminOverviewResponse> {
    const [kyc] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(kycSubmissions)
      .where(eq(kycSubmissions.status, "pending"));
    const [payoutRows] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(payouts)
      .where(eq(payouts.status, "requested"));
    const [reviews] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(eq(orders.status, "review"));
    const [frozen] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.status, "frozen"));
    return {
      pendingKyc: kyc?.n ?? 0,
      pendingPayouts: payoutRows?.n ?? 0,
      openReviews: reviews?.n ?? 0,
      frozenUsers: frozen?.n ?? 0,
    };
  }

  /**
   * Day-bucketed activity for the overview charts. Five small grouped
   * aggregates merged and zero-filled in JS — read-only, like everything else
   * in this service. Money sums come from the ledgered records (settled
   * orders via their quote totals, credited payments, settled payouts).
   */
  async analytics(days: number): Promise<AdminAnalyticsResponse> {
    const span = Math.min(Math.max(days, 7), 365);
    const since = new Date(Date.now() - span * 24 * 3600 * 1000);
    since.setUTCHours(0, 0, 0, 0);
    // postgres.js binds raw-sql params as strings — a Date object would throw.
    const sinceIso = since.toISOString();
    const dayOf = (col: unknown) => sql<string>`to_char(${col}, 'YYYY-MM-DD')`;

    const [orderRows, paymentRows, payoutRows, userRows, kycRows] = await Promise.all([
      this.db
        .select({
          day: dayOf(orders.settledAt),
          side: orders.side,
          cents: sql<string>`coalesce(sum(${quotes.totalCents}), 0)::text`,
          n: sql<number>`count(*)::int`,
        })
        .from(orders)
        .innerJoin(quotes, eq(orders.quoteId, quotes.id))
        .where(and(eq(orders.status, "settled"), sql`${orders.settledAt} >= ${sinceIso}`))
        .groupBy(sql`1`, orders.side),
      this.db
        .select({
          day: dayOf(payments.creditedAt),
          cents: sql<string>`coalesce(sum(${payments.amountCents}), 0)::text`,
        })
        .from(payments)
        .where(and(eq(payments.status, "credited"), sql`${payments.creditedAt} >= ${sinceIso}`))
        .groupBy(sql`1`),
      this.db
        .select({
          day: dayOf(payouts.settledAt),
          cents: sql<string>`coalesce(sum(${payouts.amountCents}), 0)::text`,
        })
        .from(payouts)
        .where(and(eq(payouts.status, "settled"), sql`${payouts.settledAt} >= ${sinceIso}`))
        .groupBy(sql`1`),
      this.db
        .select({ day: dayOf(users.createdAt), n: sql<number>`count(*)::int` })
        .from(users)
        .where(sql`${users.createdAt} >= ${sinceIso}`)
        .groupBy(sql`1`),
      this.db
        .select({ day: dayOf(kycSubmissions.createdAt), n: sql<number>`count(*)::int` })
        .from(kycSubmissions)
        .where(sql`${kycSubmissions.createdAt} >= ${sinceIso}`)
        .groupBy(sql`1`),
    ]);

    // Zero-filled continuous day axis THROUGH today — a quiet day is a real 0,
    // not a gap, and today's activity is on the chart the moment it happens.
    const dayCount = Math.floor((Date.now() - since.getTime()) / 86_400_000) + 1;
    const byDay = new Map<string, AdminAnalyticsPointDto>();
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(since.getTime() + i * 24 * 3600 * 1000);
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, {
        day: key,
        buyCents: "0",
        sellCents: "0",
        settledOrders: 0,
        depositCents: "0",
        payoutCents: "0",
        newUsers: 0,
        kycSubmissions: 0,
      });
    }
    for (const r of orderRows) {
      const p = byDay.get(r.day);
      if (!p) continue;
      if (r.side === "buy") p.buyCents = r.cents;
      else p.sellCents = r.cents;
      p.settledOrders += r.n;
    }
    for (const r of paymentRows) {
      const p = byDay.get(r.day);
      if (p) p.depositCents = r.cents;
    }
    for (const r of payoutRows) {
      const p = byDay.get(r.day);
      if (p) p.payoutCents = r.cents;
    }
    for (const r of userRows) {
      const p = byDay.get(r.day);
      if (p) p.newUsers = r.n;
    }
    for (const r of kycRows) {
      const p = byDay.get(r.day);
      if (p) p.kycSubmissions = r.n;
    }

    const points = [...byDay.values()];
    const totals = points.reduce(
      (acc, p) => ({
        tradeCents: acc.tradeCents + BigInt(p.buyCents) + BigInt(p.sellCents),
        settledOrders: acc.settledOrders + p.settledOrders,
        depositCents: acc.depositCents + BigInt(p.depositCents),
        payoutCents: acc.payoutCents + BigInt(p.payoutCents),
        newUsers: acc.newUsers + p.newUsers,
      }),
      { tradeCents: 0n, settledOrders: 0, depositCents: 0n, payoutCents: 0n, newUsers: 0 },
    );

    return {
      days: span,
      points,
      totals: {
        tradeCents: totals.tradeCents.toString(),
        settledOrders: totals.settledOrders,
        depositCents: totals.depositCents.toString(),
        payoutCents: totals.payoutCents.toString(),
        newUsers: totals.newUsers,
      },
    };
  }

  async listUsers(dto: AdminSearchDto): Promise<{ users: AdminUserItem[] }> {
    const where = dto.q
      ? or(ilike(users.email, `%${dto.q}%`), ilike(users.fullName, `%${dto.q}%`))
      : undefined;
    const rows = await this.db
      .select()
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(dto.limit);
    return { users: rows.map((u) => this.serializeUser(u)) };
  }

  async userDetail(userId: string): Promise<AdminUserDetailResponse> {
    const rows = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = rows[0];
    if (!user) throw new NotFoundException("user_not_found");

    const balances = await this.ledger.balancesForUser(userId);

    const freezeRows = await this.db
      .select()
      .from(freezes)
      .where(and(eq(freezes.userId, userId), isNull(freezes.liftedAt)))
      .orderBy(desc(freezes.createdAt))
      .limit(1);
    const freeze = freezeRows[0];

    const orderRows = await this.db
      .select({ order: orders, quote: quotes })
      .from(orders)
      .innerJoin(quotes, eq(orders.quoteId, quotes.id))
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(10);

    const eventRows = await this.db
      .select()
      .from(complianceEvents)
      .where(eq(complianceEvents.userId, userId))
      .orderBy(desc(complianceEvents.createdAt))
      .limit(10);

    return {
      ...this.serializeUser(user),
      balances,
      activeFreeze: freeze
        ? {
            id: freeze.id,
            reason: freeze.reason,
            createdBy: freeze.createdBy,
            createdAt: freeze.createdAt.toISOString(),
          }
        : null,
      recentOrders: orderRows.map((r) => ({
        id: r.order.id,
        side: r.order.side as OrderSide,
        asset: r.order.asset as MetalAsset,
        status: r.order.status as OrderStatus,
        failureReason: r.order.failureReason,
        gramsMg: r.quote.gramsMg.toString(),
        unitEtbCentsPerGram: r.quote.unitEtbCentsPerGram.toString(),
        totalCents: r.quote.totalCents.toString(),
        receiptSerial: r.order.receiptSerial === null ? null : r.order.receiptSerial.toString(),
        createdAt: r.order.createdAt.toISOString(),
        settledAt: r.order.settledAt ? r.order.settledAt.toISOString() : null,
      })),
      complianceEvents: eventRows.map((e) => ({
        id: e.id,
        ruleKey: e.ruleKey,
        action: e.action,
        createdAt: e.createdAt.toISOString(),
        resolvedAt: e.resolvedAt ? e.resolvedAt.toISOString() : null,
      })),
    };
  }

  /**
   * Manual freeze (compliance role). Staff accounts cannot be frozen — a
   * compromised-compliance scenario is a role/credential problem, not one
   * this button should be able to cause.
   */
  async freeze(userId: string, actorId: string, reason: string): Promise<void> {
    if (userId === actorId) throw new ForbiddenException("cannot_freeze_self");
    const rows = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = rows[0];
    if (!user) throw new NotFoundException("user_not_found");
    if (user.role !== "user") throw new ForbiddenException("cannot_freeze_staff");

    const existing = await this.db
      .select({ id: freezes.id })
      .from(freezes)
      .where(and(eq(freezes.userId, userId), isNull(freezes.liftedAt)))
      .limit(1);
    if (existing.length > 0) throw new ConflictException("already_frozen");

    await this.db.transaction(async (tx) => {
      await tx.insert(freezes).values({ userId, reason, createdBy: actorId });
      await tx.update(users).set({ status: "frozen" }).where(eq(users.id, userId));
      await tx.insert(auditLogs).values({
        actorId,
        actorLabel: `staff:${actorId}`,
        action: "account_frozen",
        targetType: "user",
        targetId: userId,
        after: { reason },
      });
    });
    void this.notifications.emit(userId, "account_frozen", { reason });
  }

  async unfreeze(userId: string, actorId: string): Promise<void> {
    const lifted = await this.db
      .update(freezes)
      .set({ liftedBy: actorId, liftedAt: sql`now()` })
      .where(and(eq(freezes.userId, userId), isNull(freezes.liftedAt)))
      .returning({ id: freezes.id });
    if (lifted.length === 0) throw new ConflictException("not_frozen");

    await this.db.update(users).set({ status: "active" }).where(eq(users.id, userId));
    await this.db.insert(auditLogs).values({
      actorId,
      actorLabel: `staff:${actorId}`,
      action: "account_unfrozen",
      targetType: "user",
      targetId: userId,
    });
    void this.notifications.emit(userId, "account_unfrozen", {});
  }

  async listKyc(status?: string): Promise<{ submissions: AdminKycItem[] }> {
    const valid = status === "pending" || status === "approved" || status === "rejected";
    const rows = await this.db
      .select({ submission: kycSubmissions, email: users.email })
      .from(kycSubmissions)
      .innerJoin(users, eq(kycSubmissions.userId, users.id))
      .where(valid ? eq(kycSubmissions.status, status) : undefined)
      .orderBy(desc(kycSubmissions.createdAt))
      .limit(100);
    return {
      submissions: rows.map((r) => ({
        id: r.submission.id,
        userEmail: r.email,
        docType: r.submission.docType,
        status: r.submission.status,
        fileName: r.submission.fileRef,
        createdAt: r.submission.createdAt.toISOString(),
      })),
    };
  }

  async listReviews(): Promise<{ reviews: AdminReviewItem[] }> {
    const rows = await this.db
      .select({
        order: orders,
        quote: quotes,
        email: users.email,
        ruleKey: complianceEvents.ruleKey,
      })
      .from(orders)
      .innerJoin(quotes, eq(orders.quoteId, quotes.id))
      .innerJoin(users, eq(orders.userId, users.id))
      .leftJoin(
        complianceEvents,
        and(
          sql`${complianceEvents.evidence} ->> 'orderId' = ${orders.id}::text`,
          isNull(complianceEvents.resolvedAt),
        ),
      )
      .where(eq(orders.status, "review"))
      .orderBy(desc(orders.createdAt))
      .limit(100);
    return {
      reviews: rows.map((r) => ({
        orderId: r.order.id,
        userEmail: r.email,
        side: r.order.side as OrderSide,
        asset: r.order.asset as MetalAsset,
        gramsMg: r.quote.gramsMg.toString(),
        totalCents: r.quote.totalCents.toString(),
        ruleKey: r.ruleKey ?? null,
        createdAt: r.order.createdAt.toISOString(),
      })),
    };
  }

  async searchOrders(dto: AdminSearchDto): Promise<{ orders: AdminOrderSearchItem[] }> {
    const filters = [];
    if (dto.q) {
      const bySerial = /^\d+$/.test(dto.q)
        ? eq(orders.receiptSerial, BigInt(dto.q))
        : undefined;
      filters.push(
        bySerial ? or(ilike(users.email, `%${dto.q}%`), bySerial) : ilike(users.email, `%${dto.q}%`),
      );
    }
    if (
      dto.status === "created" ||
      dto.status === "review" ||
      dto.status === "settled" ||
      dto.status === "rejected"
    ) {
      filters.push(eq(orders.status, dto.status));
    }

    const rows = await this.db
      .select({ order: orders, quote: quotes, email: users.email })
      .from(orders)
      .innerJoin(quotes, eq(orders.quoteId, quotes.id))
      .innerJoin(users, eq(orders.userId, users.id))
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(orders.createdAt))
      .limit(dto.limit);

    return {
      orders: rows.map((r) => ({
        id: r.order.id,
        userEmail: r.email,
        side: r.order.side as OrderSide,
        asset: r.order.asset as MetalAsset,
        status: r.order.status as OrderStatus,
        failureReason: r.order.failureReason,
        gramsMg: r.quote.gramsMg.toString(),
        unitEtbCentsPerGram: r.quote.unitEtbCentsPerGram.toString(),
        totalCents: r.quote.totalCents.toString(),
        receiptSerial: r.order.receiptSerial === null ? null : r.order.receiptSerial.toString(),
        createdAt: r.order.createdAt.toISOString(),
        settledAt: r.order.settledAt ? r.order.settledAt.toISOString() : null,
      })),
    };
  }

  async treasuryDetail(): Promise<AdminTreasuryResponse> {
    const summary = await this.treasury.summary();

    let chapa: AdminTreasuryResponse["chapa"] = null;
    if (this.chapa.configured) {
      try {
        const cached = await this.redis.get(CHAPA_BALANCE_CACHE_KEY);
        if (cached) {
          chapa = JSON.parse(cached) as AdminTreasuryResponse["chapa"];
        } else {
          const balances = await this.chapa.balances();
          chapa = balances.map((b) => ({
            currency: b.currency,
            availableBalance: b.available_balance,
            ledgerBalance: b.ledger_balance,
          }));
          await this.redis.set(CHAPA_BALANCE_CACHE_KEY, JSON.stringify(chapa), "EX", 60);
        }
      } catch {
        chapa = null; // panel shows "unavailable" — never blocks the treasury view
      }
    }
    return { summary, chapa };
  }

  async listAudit(before?: string): Promise<{ entries: AdminAuditItem[]; nextCursor: string | null }> {
    const limit = 50;
    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(before ? lt(auditLogs.createdAt, new Date(before)) : undefined)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      entries: page.map((e) => ({
        id: e.id,
        actorLabel: e.actorLabel,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        after: e.after,
        createdAt: e.createdAt.toISOString(),
      })),
      nextCursor: rows.length > limit && last ? last.createdAt.toISOString() : null,
    };
  }

  /** AML export (F22): every compliance event, with the user's email, as CSV. */
  async complianceCsv(): Promise<string> {
    const rows = await this.db
      .select({ event: complianceEvents, email: users.email })
      .from(complianceEvents)
      .leftJoin(users, eq(complianceEvents.userId, users.id))
      .orderBy(desc(complianceEvents.createdAt));

    const esc = (v: string | null | undefined) =>
      v === null || v === undefined ? "" : `"${v.replace(/"/g, '""')}"`;
    const lines = [
      "id,created_at,user_email,rule_key,action,resolved_at,evidence",
      ...rows.map((r) =>
        [
          r.event.id,
          r.event.createdAt.toISOString(),
          esc(r.email),
          r.event.ruleKey,
          r.event.action,
          r.event.resolvedAt ? r.event.resolvedAt.toISOString() : "",
          esc(JSON.stringify(r.event.evidence ?? null)),
        ].join(","),
      ),
    ];
    return lines.join("\r\n") + "\r\n";
  }

  private serializeUser(u: typeof users.$inferSelect): AdminUserItem {
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      status: u.status,
      kycTier: u.kycTier,
      holdingTier: u.holdingTier,
      createdAt: u.createdAt.toISOString(),
    };
  }
}
