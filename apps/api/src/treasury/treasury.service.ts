import { Inject, Injectable, InternalServerErrorException } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import {
  accounts,
  ledgerEntries,
  orders,
  quotes,
  treasuryConfig,
  vaultHoldings,
  type Db,
} from "@alkeva/db";
import {
  METAL_ASSETS,
  type MetalAsset,
  type TreasuryReserveDto,
  type TreasurySummaryResponse,
} from "@alkeva/shared";
import { DB } from "../core/core.module.js";

/**
 * Point-in-time treasury projections (Design §3.4): reserve ratio and float
 * are DERIVED from the ledger + vault records, never stored. Plain reads, no
 * locks — this is a dashboard, not a gate (the gates live in OrdersService,
 * inside the order transaction).
 */
@Injectable()
export class TreasuryService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async summary(): Promise<TreasurySummaryResponse> {
    const cfgRows = await this.db
      .select()
      .from(treasuryConfig)
      .where(eq(treasuryConfig.id, 1))
      .limit(1);
    const cfg = cfgRows[0];
    if (!cfg) throw new InternalServerErrorException("treasury_config_missing");

    const reserves: TreasuryReserveDto[] = [];
    for (const asset of METAL_ASSETS) {
      reserves.push(await this.reserveFor(asset));
    }

    const cashCents = await this.systemBalance("system:cash");
    const sellbackUsedTodayCents = await this.sellbackUsedToday();
    const headroom = cashCents - cfg.haltThresholdCents;

    return {
      reserves,
      float: {
        cashCents: cashCents.toString(),
        floatTargetCents: cfg.floatTargetCents.toString(),
        haltThresholdCents: cfg.haltThresholdCents.toString(),
        sellHeadroomCents: (headroom > 0n ? headroom : 0n).toString(),
        sellbackUsedTodayCents: sellbackUsedTodayCents.toString(),
        sellbackCeilingCents: cfg.dailySellbackCeilingCents.toString(),
      },
      asOf: new Date().toISOString(),
    };
  }

  private async reserveFor(asset: MetalAsset): Promise<TreasuryReserveDto> {
    const physicalRows = await this.db
      .select({
        mg: sql<string>`coalesce(sum(case when ${vaultHoldings.kind} = 'intake' then ${vaultHoldings.gramsMg} else -${vaultHoldings.gramsMg} end), 0)::bigint`,
      })
      .from(vaultHoldings)
      .where(eq(vaultHoldings.asset, asset));
    const physicalMg = BigInt(physicalRows[0]?.mg ?? "0");

    const vaultBalance = await this.systemBalance(`system:vault:${asset}`);
    const issuedMg = vaultBalance < 0n ? -vaultBalance : 0n;
    const availableMg = physicalMg + vaultBalance;

    return {
      asset,
      physicalMg: physicalMg.toString(),
      issuedMg: issuedMg.toString(),
      availableMg: availableMg.toString(),
      reserveRatioPctMilli:
        issuedMg === 0n ? null : ((physicalMg * 100_000n) / issuedMg).toString(),
    };
  }

  private async systemBalance(systemName: string): Promise<bigint> {
    const rows = await this.db
      .select({ balance: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)::bigint` })
      .from(accounts)
      .leftJoin(ledgerEntries, eq(ledgerEntries.accountId, accounts.id))
      .where(eq(accounts.systemName, systemName));
    return BigInt(rows[0]?.balance ?? "0");
  }

  // TODO(phase-5): Africa/Addis_Ababa day boundary (matches OrdersService).
  private async sellbackUsedToday(): Promise<bigint> {
    const rows = await this.db
      .select({ total: sql<string>`coalesce(sum(${quotes.totalCents}), 0)::bigint` })
      .from(orders)
      .innerJoin(quotes, eq(orders.quoteId, quotes.id))
      .where(
        and(
          eq(orders.side, "sell"),
          eq(orders.status, "settled"),
          sql`${orders.settledAt} >= date_trunc('day', now())`,
        ),
      );
    return BigInt(rows[0]?.total ?? "0");
  }
}
