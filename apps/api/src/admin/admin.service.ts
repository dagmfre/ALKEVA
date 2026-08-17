import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, ilike, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { Redis } from "ioredis";
import {
  accounts,
  auditLogs,
  complianceEvents,
  feeConfig,
  freezes,
  kycSubmissions,
  ledgerEntries,
  orders,
  payments,
  payouts,
  priceTicks,
  quotes,
  treasuryConfig,
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
  AdminRevenuePointDto,
  AdminRevenueResponse,
  AdminSearchDto,
  AdminTreasuryResponse,
  AdminUserDetailResponse,
  AdminUserItem,
  MetalAsset,
  OrderSide,
  OrderStatus,
} from "@alkeva/shared";
import { METAL_ASSETS, eatDayStartUtc } from "@alkeva/shared";
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

  /**
   * The owner's revenue view (Decision: administrator = owner).
   *
   * Commission is the platform's only income and it already lives in one
   * place — the `system:fees` account — so the all-time figure is a ledger
   * balance, not an estimate. The windowed figures re-derive the same money
   * from the quotes behind settled orders, which is why the two agree.
   *
   * Three things are deliberately kept apart on this endpoint:
   *   income      — commission the owner earned;
   *   collected   — tax + reforestation, owed to third parties;
   *   liability   — customer balances, which are NOT earnings and must be
   *                 subtracted before anything is called withdrawable.
   */
  async revenue(days: number): Promise<AdminRevenueResponse> {
    const span = Math.min(Math.max(days, 7), 365);
    const since = new Date(Date.now() - span * 24 * 3600 * 1000);
    since.setUTCHours(0, 0, 0, 0);
    const prevSince = new Date(since.getTime() - span * 24 * 3600 * 1000);
    // postgres.js binds raw-sql params as strings — a Date object would throw.
    const sinceIso = since.toISOString();
    const prevSinceIso = prevSince.toISOString();
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const settled = eq(orders.status, "settled");

    const [
      cfgRows,
      tcfgRows,
      dayRows,
      assetRows,
      contributorRows,
      prevRow,
      todayRow,
      monthRow,
      feesAllTime,
      taxAllTime,
      reforestAllTime,
      payoutHold,
      systemCash,
      liabilityRow,
      priceRows,
      vaultBalances,
    ] = await Promise.all([
      this.db.select().from(feeConfig).where(eq(feeConfig.id, 1)).limit(1),
      this.db.select().from(treasuryConfig).where(eq(treasuryConfig.id, 1)).limit(1),
      this.db
        .select({
          day: sql<string>`to_char(${orders.settledAt}, 'YYYY-MM-DD')`,
          side: orders.side,
          fee: sql<string>`coalesce(sum(${quotes.feeCents}), 0)::text`,
          volume: sql<string>`coalesce(sum(${quotes.totalCents}), 0)::text`,
          n: sql<number>`count(*)::int`,
        })
        .from(orders)
        .innerJoin(quotes, eq(orders.quoteId, quotes.id))
        .where(and(settled, sql`${orders.settledAt} >= ${sinceIso}`))
        .groupBy(sql`1`, orders.side),
      this.db
        .select({
          asset: orders.asset,
          fee: sql<string>`coalesce(sum(${quotes.feeCents}), 0)::text`,
          volume: sql<string>`coalesce(sum(${quotes.totalCents}), 0)::text`,
          n: sql<number>`count(*)::int`,
        })
        .from(orders)
        .innerJoin(quotes, eq(orders.quoteId, quotes.id))
        .where(and(settled, sql`${orders.settledAt} >= ${sinceIso}`))
        .groupBy(orders.asset),
      this.db
        .select({
          userId: orders.userId,
          email: users.email,
          fullName: users.fullName,
          fee: sql<string>`coalesce(sum(${quotes.feeCents}), 0)::text`,
          n: sql<number>`count(*)::int`,
        })
        .from(orders)
        .innerJoin(quotes, eq(orders.quoteId, quotes.id))
        .innerJoin(users, eq(orders.userId, users.id))
        .where(and(settled, sql`${orders.settledAt} >= ${sinceIso}`))
        .groupBy(orders.userId, users.email, users.fullName)
        .orderBy(sql`sum(${quotes.feeCents}) desc`)
        .limit(5),
      this.sumFees(sql`${orders.settledAt} >= ${prevSinceIso} and ${orders.settledAt} < ${sinceIso}`),
      this.sumFees(sql`${orders.settledAt} >= ${eatDayStartUtc().toISOString()}`),
      this.sumFees(sql`${orders.settledAt} >= ${monthStart.toISOString()}`),
      this.systemBalance("system:fees"),
      this.systemBalance("system:tax"),
      this.systemBalance("system:reforestation"),
      this.systemBalance("system:payout_hold"),
      this.systemBalance("system:cash"),
      // Everything held in customer accounts — the platform's ETB liability.
      this.db
        .select({ cents: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)::text` })
        .from(ledgerEntries)
        .innerJoin(accounts, eq(accounts.id, ledgerEntries.accountId))
        .where(and(isNull(accounts.systemName), eq(ledgerEntries.asset, "ETB"))),
      // Latest tick per metal, for the exposure valuation.
      this.db
        .select({ asset: priceTicks.asset, price: priceTicks.etbCentsPerGram, at: priceTicks.at })
        .from(priceTicks)
        .where(sql`${priceTicks.at} >= now() - interval '2 days'`)
        .orderBy(desc(priceTicks.at))
        .limit(200),
      Promise.all(
        METAL_ASSETS.map(async (asset) => ({
          asset,
          balance: await this.systemBalance(`system:vault:${asset}`),
        })),
      ),
    ]);

    const cfg = cfgRows[0];
    const tcfg = tcfgRows[0];
    if (!cfg || !tcfg) throw new NotFoundException("config_missing");

    // Zero-filled day axis through today — a day with no trades earned 0, and
    // that is a fact worth drawing rather than a gap to interpolate over.
    const dayCount = Math.floor((Date.now() - since.getTime()) / 86_400_000) + 1;
    const byDay = new Map<string, AdminRevenuePointDto>();
    for (let i = 0; i < dayCount; i++) {
      const key = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      byDay.set(key, { day: key, buyFeeCents: "0", sellFeeCents: "0", volumeCents: "0", orders: 0 });
    }
    for (const r of dayRows) {
      const p = byDay.get(r.day);
      if (!p) continue;
      if (r.side === "buy") p.buyFeeCents = r.fee;
      else p.sellFeeCents = r.fee;
      p.volumeCents = (BigInt(p.volumeCents) + BigInt(r.volume)).toString();
      p.orders += r.n;
    }
    const points = [...byDay.values()];

    const windowCents = points.reduce(
      (acc, p) => acc + BigInt(p.buyFeeCents) + BigInt(p.sellFeeCents),
      0n,
    );
    const windowVolume = points.reduce((acc, p) => acc + BigInt(p.volumeCents), 0n);
    const windowOrders = points.reduce((acc, p) => acc + p.orders, 0);

    // First price seen per asset — the query is newest-first, so that is the
    // latest tick.
    const latestPrice = new Map<string, bigint>();
    for (const row of priceRows) {
      if (!latestPrice.has(row.asset)) latestPrice.set(row.asset, row.price);
    }
    const exposure = vaultBalances.map(({ asset, balance }) => {
      // A negative vault balance is metal issued to customers.
      const issuedMg = balance < 0n ? -balance : 0n;
      const price = latestPrice.get(asset) ?? 0n;
      return {
        asset,
        issuedMg: issuedMg.toString(),
        unitPriceCents: price.toString(),
        valueCents: ((issuedMg * price) / 1000n).toString(),
      };
    });

    const liability = BigInt(liabilityRow[0]?.cents ?? "0");
    const chapaAvailable = await this.chapaAvailableCents();
    const safeToSweep =
      chapaAvailable === null
        ? null
        : chapaAvailable - liability - payoutHold - tcfg.haltThresholdCents;

    return {
      days: span,
      rate: {
        commissionPctMilli: cfg.commissionPctMilli,
        serviceFeeCents: cfg.serviceFeeCents.toString(),
        taxPctMilli: cfg.taxPctMilli,
        reforestPctMilli: cfg.reforestPctMilli,
      },
      earnings: {
        allTimeCents: feesAllTime.toString(),
        windowCents: windowCents.toString(),
        prevWindowCents: prevRow.toString(),
        todayCents: todayRow.toString(),
        monthToDateCents: monthRow.toString(),
        windowVolumeCents: windowVolume.toString(),
        windowOrders,
        effectiveRatePctMilli:
          windowVolume === 0n ? null : ((windowCents * 100_000n) / windowVolume).toString(),
        taxAllTimeCents: taxAllTime.toString(),
        reforestAllTimeCents: reforestAllTime.toString(),
      },
      points,
      byAsset: assetRows.map((r) => ({
        asset: r.asset as MetalAsset,
        feeCents: r.fee,
        volumeCents: r.volume,
        orders: r.n,
      })),
      topContributors: contributorRows.map((r) => ({
        userId: r.userId,
        email: r.email,
        fullName: r.fullName,
        feeCents: r.fee,
        orders: r.n,
      })),
      position: {
        userEtbLiabilityCents: liability.toString(),
        payoutHoldCents: payoutHold.toString(),
        systemCashCents: systemCash.toString(),
        haltThresholdCents: tcfg.haltThresholdCents.toString(),
        chapaAvailableCents: chapaAvailable === null ? null : chapaAvailable.toString(),
        safeToSweepCents:
          safeToSweep === null ? null : (safeToSweep > 0n ? safeToSweep : 0n).toString(),
      },
      exposure,
      asOf: new Date().toISOString(),
    };
  }

  /** Commission summed over settled orders matching an extra time predicate. */
  private async sumFees(where: SQL): Promise<bigint> {
    const rows = await this.db
      .select({ cents: sql<string>`coalesce(sum(${quotes.feeCents}), 0)::text` })
      .from(orders)
      .innerJoin(quotes, eq(orders.quoteId, quotes.id))
      .where(and(eq(orders.status, "settled"), where));
    return BigInt(rows[0]?.cents ?? "0");
  }

  private async systemBalance(systemName: string): Promise<bigint> {
    const rows = await this.db
      .select({ cents: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)::text` })
      .from(accounts)
      .leftJoin(ledgerEntries, eq(ledgerEntries.accountId, accounts.id))
      .where(eq(accounts.systemName, systemName));
    return BigInt(rows[0]?.cents ?? "0");
  }

  /**
   * Merchant ETB balance in cents, or null when Chapa is unconfigured or
   * unreachable. Never throws — an unavailable payment provider must not take
   * the revenue page down with it; the panel says so instead.
   */
  private async chapaAvailableCents(): Promise<bigint | null> {
    if (!this.chapa.configured) return null;
    try {
      const cached = await this.redis.get(CHAPA_BALANCE_CACHE_KEY);
      const balances = cached
        ? (JSON.parse(cached) as { currency: string; availableBalance: number }[])
        : (await this.chapa.balances()).map((b) => ({
            currency: b.currency,
            availableBalance: b.available_balance,
            ledgerBalance: b.ledger_balance,
          }));
      if (!cached) {
        await this.redis.set(CHAPA_BALANCE_CACHE_KEY, JSON.stringify(balances), "EX", 60);
      }
      const etb = balances.find((b) => b.currency === "ETB");
      return etb ? BigInt(Math.round(etb.availableBalance * 100)) : null;
    } catch {
      return null;
    }
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
        declaredFullName: r.submission.declaredFullName,
        declaredDocNumber: r.submission.declaredDocNumber,
        declaredExpiry: r.submission.declaredExpiry,
        extractedFullName: r.submission.extractedFullName,
        extractedDocNumber: r.submission.extractedDocNumber,
        extractedExpiry: r.submission.extractedExpiry,
        extractedConfidence: r.submission.extractedConfidence,
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
