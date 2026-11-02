import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { deliveryRequests, payments, payouts, type Db } from "@alkeva/db";
import type {
  MetalAsset,
  ProgressResponse,
  WalletPendingItem,
  WalletResponse,
} from "@alkeva/shared";
import { Auth, AuthGuard } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { DB } from "../core/core.module.js";
import { LedgerService } from "../ledger/ledger.service.js";
import { PortfolioService } from "./portfolio.service.js";

/**
 * The navbar wallet ("cart") and profile tier. Both are cheap reads meant to
 * be fetched on every page: the wallet is three balance projections plus the
 * money still in flight, so the badge on the header icon can say "2 pending".
 */
@Controller()
@UseGuards(AuthGuard)
export class WalletController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ledger: LedgerService,
    private readonly portfolio: PortfolioService,
  ) {}

  @Get("wallet")
  async wallet(@Auth() auth: AccessPayload): Promise<WalletResponse> {
    const balances = await this.ledger.balancesForUser(auth.sub);
    const [outflows, inflows, deliveries] = await Promise.all([
      this.db
        .select()
        .from(payouts)
        .where(
          and(
            eq(payouts.userId, auth.sub),
            inArray(payouts.status, ["requested", "approved", "processing"]),
          ),
        )
        .orderBy(desc(payouts.createdAt))
        .limit(10),
      this.db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.userId, auth.sub),
            inArray(payments.status, ["initiated", "webhook_received", "verified"]),
            gt(payments.createdAt, sql`now() - interval '1 day'`),
          ),
        )
        .orderBy(desc(payments.createdAt))
        .limit(10),
      this.db
        .select()
        .from(deliveryRequests)
        .where(
          and(
            eq(deliveryRequests.userId, auth.sub),
            inArray(deliveryRequests.status, ["requested", "reviewing", "approved", "scheduled"]),
          ),
        )
        .orderBy(desc(deliveryRequests.createdAt))
        .limit(5),
    ]);

    const pending: WalletPendingItem[] = [
      ...outflows.map((p) => ({
        kind: "withdrawal" as const,
        id: p.id,
        status: p.status,
        amountCents: p.amountCents.toString(),
        asset: null,
        gramsMg: null,
        createdAt: p.createdAt.toISOString(),
      })),
      ...inflows.map((p) => ({
        kind: "deposit" as const,
        id: p.id,
        status: p.status,
        amountCents: p.amountCents.toString(),
        asset: null,
        gramsMg: null,
        createdAt: p.createdAt.toISOString(),
      })),
      ...deliveries.map((d) => ({
        kind: "delivery" as const,
        id: d.id,
        status: d.status,
        amountCents: null,
        asset: d.asset as MetalAsset,
        gramsMg: d.gramsMg.toString(),
        createdAt: d.createdAt.toISOString(),
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return { ...balances, pending, pendingCount: pending.length };
  }

  @Get("me/progress")
  progress(@Auth() auth: AccessPayload): Promise<ProgressResponse> {
    return this.portfolio.progress(auth.sub);
  }
}
