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
  payouts,
  quotes,
  users,
  type Db,
} from "@alkeva/db";
import type {
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
