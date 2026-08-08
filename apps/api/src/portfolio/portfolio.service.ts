import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  holdingTierConfig,
  orders,
  priceTicks,
  quotes,
  users,
  type Db,
} from "@alkeva/db";
import {
  METAL_ASSETS,
  UNITS,
  type HoldingDto,
  type MetalAsset,
  type PortfolioResponse,
  type TierDto,
} from "@alkeva/shared";
import { DB } from "../core/core.module.js";
import { LedgerService } from "../ledger/ledger.service.js";

interface LatestTick {
  unitEtbCentsPerGram: bigint;
  etbRateMicro: bigint;
  at: Date;
}

/**
 * Read-only portfolio projection (Phase 3.2): live value, weighted-average
 * cost basis, gain/loss, and the gemstone holding tier.
 *
 * Nothing here writes money. The one write is the `users.holding_tier` cache,
 * refreshed when the computed tier drifts from the stored one, so the caps
 * OrdersService enforces stay consistent with the tier the user is shown.
 */
@Injectable()
export class PortfolioService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ledger: LedgerService,
  ) {}

  async forUser(userId: string): Promise<PortfolioResponse> {
    const balances = await this.ledger.balancesForUser(userId);
    const etbCents = BigInt(balances.etbCents);

    const heldMg: Record<MetalAsset, bigint> = {
      XAU: BigInt(balances.xauMg),
      XPT: BigInt(balances.xptMg),
    };

    const holdings: HoldingDto[] = [];
    let totalMetalValueCents = 0n;
    let totalCostBasisCents = 0n;
    let fxRateMicro: bigint | null = null;

    for (const asset of METAL_ASSETS) {
      const tick = await this.latestTick(asset);
      if (tick && fxRateMicro === null) fxRateMicro = tick.etbRateMicro;

      const mg = heldMg[asset];
      // Same single-rounding rule as the quote engine: unit price is per gram,
      // holdings are milligrams, so divide by MG_PER_GRAM exactly once.
      const valueCents = tick ? (tick.unitEtbCentsPerGram * mg) / UNITS.MG_PER_GRAM : 0n;
      const costBasisCents = await this.costBasis(userId, asset);
      const gainLossCents = valueCents - costBasisCents;

      holdings.push({
        asset,
        gramsMg: mg.toString(),
        valueCents: valueCents.toString(),
        costBasisCents: costBasisCents.toString(),
        gainLossCents: gainLossCents.toString(),
        gainLossPctMilli:
          costBasisCents === 0n
            ? null
            : ((gainLossCents * 100_000n) / costBasisCents).toString(),
        unitEtbCentsPerGram: tick ? tick.unitEtbCentsPerGram.toString() : null,
        priceAt: tick ? tick.at.toISOString() : null,
      });

      totalMetalValueCents += valueCents;
      totalCostBasisCents += costBasisCents;
    }

    const totalValueCents = etbCents + totalMetalValueCents;
    const totalGainLossCents = totalMetalValueCents - totalCostBasisCents;

    const tier = await this.tierFor(userId, totalValueCents, fxRateMicro);

    return {
      etbCents: etbCents.toString(),
      holdings,
      totalMetalValueCents: totalMetalValueCents.toString(),
      totalValueCents: totalValueCents.toString(),
      totalCostBasisCents: totalCostBasisCents.toString(),
      totalGainLossCents: totalGainLossCents.toString(),
      totalGainLossPctMilli:
        totalCostBasisCents === 0n
          ? null
          : ((totalGainLossCents * 100_000n) / totalCostBasisCents).toString(),
      tier,
      asOf: new Date().toISOString(),
    };
  }

  private async latestTick(asset: MetalAsset): Promise<LatestTick | null> {
    const rows = await this.db
      .select({
        unitEtbCentsPerGram: priceTicks.etbCentsPerGram,
        etbRateMicro: priceTicks.etbRateMicro,
        at: priceTicks.at,
      })
      .from(priceTicks)
      .where(eq(priceTicks.asset, asset))
      .orderBy(desc(priceTicks.at))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Weighted-average cost basis of the grams still held.
   *
   * Replayed from settled orders in settlement order rather than stored, for
   * the same reason balances are: a derived number can be recomputed and
   * audited, a stored one can drift. Buys add what the user actually paid
   * (fees included — the commission is part of what the metal cost). Sells
   * remove cost proportionally to the fraction of the holding sold, which is
   * what makes the average "weighted".
   */
  private async costBasis(userId: string, asset: MetalAsset): Promise<bigint> {
    const rows = await this.db
      .select({
        side: orders.side,
        gramsMg: quotes.gramsMg,
        subtotalCents: quotes.subtotalCents,
        totalCents: quotes.totalCents,
      })
      .from(orders)
      .innerJoin(quotes, eq(orders.quoteId, quotes.id))
      .where(
        and(
          eq(orders.userId, userId),
          eq(orders.asset, asset),
          eq(orders.status, "settled"),
        ),
      )
      .orderBy(asc(orders.settledAt), asc(orders.createdAt));

    let heldMg = 0n;
    let costCents = 0n;

    for (const row of rows) {
      if (row.side === "buy") {
        heldMg += row.gramsMg;
        costCents += row.totalCents;
        continue;
      }
      // Sell: retire cost in proportion to the grams leaving.
      if (heldMg <= 0n) continue;
      const soldMg = row.gramsMg > heldMg ? heldMg : row.gramsMg;
      const costRemoved = (costCents * soldMg) / heldMg;
      costCents -= costRemoved;
      heldMg -= soldMg;
      if (heldMg === 0n) costCents = 0n;
    }

    return costCents > 0n ? costCents : 0n;
  }

  /**
   * Gemstone tier (Decision A3). Bands are defined in USD, holdings are in ETB,
   * so the conversion uses the FX rate stored on the price tick — the same rate
   * the price itself was derived from, never a separately-fetched one.
   */
  private async tierFor(
    userId: string,
    totalValueCents: bigint,
    fxRateMicro: bigint | null,
  ): Promise<TierDto> {
    const holdingUsdCents =
      fxRateMicro && fxRateMicro > 0n ? (totalValueCents * 1_000_000n) / fxRateMicro : 0n;

    const bands = await this.db
      .select()
      .from(holdingTierConfig)
      .orderBy(asc(holdingTierConfig.rank));

    const empty: TierDto = {
      name: null,
      rank: null,
      holdingUsdCents: holdingUsdCents.toString(),
      bandMaxUsd: null,
      nextName: null,
      nextThresholdUsd: null,
      progressPctMilli: null,
      deliveryEligible: false,
      perTxnCapCents: null,
      dailyCapCents: null,
    };
    if (bands.length === 0) return empty;

    // Bands are ranked ascending by value; the first whose ceiling we are under
    // wins, and a null ceiling is the unbounded top tier.
    const index = bands.findIndex(
      (b) => b.maxUsd === null || holdingUsdCents < BigInt(b.maxUsd) * 100n,
    );
    const current = index === -1 ? bands[bands.length - 1] : bands[index];
    if (!current) return empty;

    const next = index === -1 ? undefined : bands[index + 1];
    const floorUsdCents =
      index <= 0 ? 0n : BigInt(bands[index - 1]?.maxUsd ?? 0) * 100n;
    const ceilingUsdCents = current.maxUsd === null ? null : BigInt(current.maxUsd) * 100n;

    let progressPctMilli: string | null = null;
    if (ceilingUsdCents !== null && ceilingUsdCents > floorUsdCents) {
      const span = ceilingUsdCents - floorUsdCents;
      const into = holdingUsdCents - floorUsdCents;
      const clamped = into < 0n ? 0n : into > span ? span : into;
      progressPctMilli = ((clamped * 100_000n) / span).toString();
    }

    await this.cacheTier(userId, current.name);

    return {
      name: current.name,
      rank: current.rank,
      holdingUsdCents: holdingUsdCents.toString(),
      bandMaxUsd: current.maxUsd,
      nextName: next?.name ?? null,
      nextThresholdUsd: current.maxUsd,
      progressPctMilli,
      deliveryEligible: current.deliveryEligible,
      perTxnCapCents: current.perTxnCapCents === null ? null : current.perTxnCapCents.toString(),
      dailyCapCents: current.dailyCapCents === null ? null : current.dailyCapCents.toString(),
    };
  }

  /** Keeps the tier OrdersService caps against in step with the one shown. */
  private async cacheTier(userId: string, name: string): Promise<void> {
    const rows = await this.db
      .select({ holdingTier: users.holdingTier })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (rows[0]?.holdingTier === name) return;
    await this.db.update(users).set({ holdingTier: name }).where(eq(users.id, userId));
  }
}
