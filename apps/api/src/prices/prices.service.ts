import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { priceTicks, type Db } from "@alkeva/db";
import {
  MAX_TICK_AGE_SECONDS,
  METAL_ASSETS,
  type MetalAsset,
  type PriceHistoryResponse,
  type PriceLatestResponse,
  type PriceRange,
  type PriceSnapshotResponse,
} from "@alkeva/shared";
import { DB } from "../core/core.module.js";

const RANGE_CONFIG: Record<PriceRange, { intervalSql: string; bucketSql: string }> = {
  "24h": { intervalSql: "24 hours", bucketSql: "5 minutes" },
  "7d": { intervalSql: "7 days", bucketSql: "1 hour" },
  "30d": { intervalSql: "30 days", bucketSql: "4 hours" },
  "1y": { intervalSql: "365 days", bucketSql: "1 day" },
};

@Injectable()
export class PricesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async latest(asset: MetalAsset): Promise<PriceLatestResponse> {
    const rows = await this.db
      .select()
      .from(priceTicks)
      .where(eq(priceTicks.asset, asset))
      .orderBy(desc(priceTicks.at))
      .limit(1);
    const tick = rows[0];
    if (!tick) throw new NotFoundException("no_price_data");

    const ageSec = (Date.now() - tick.at.getTime()) / 1000;
    return {
      asset,
      etbCentsPerGram: tick.etbCentsPerGram.toString(),
      usdPerOzMicro: tick.usdPerOzMicro.toString(),
      fxRateMicro: tick.etbRateMicro.toString(),
      source: tick.source,
      fxSource: tick.fxSource,
      at: tick.at.toISOString(),
      stale: ageSec > MAX_TICK_AGE_SECONDS,
      change24hPctMilli: await this.change24h(asset, tick.etbCentsPerGram, tick.at),
    };
  }

  /**
   * The one canonical 24h change (raw ticks, never bucket averages).
   * Reference = newest tick ≥24h older than the latest; a dataset younger than
   * 24h falls back to its oldest tick so a fresh install still shows a number.
   */
  private async change24h(
    asset: MetalAsset,
    latestCents: bigint,
    latestAt: Date,
  ): Promise<string | null> {
    const cutoff = new Date(latestAt.getTime() - 24 * 3600 * 1000);
    const [ref] = await this.db
      .select({ cents: priceTicks.etbCentsPerGram, at: priceTicks.at })
      .from(priceTicks)
      .where(and(eq(priceTicks.asset, asset), lte(priceTicks.at, cutoff)))
      .orderBy(desc(priceTicks.at))
      .limit(1);
    const reference =
      ref ??
      (
        await this.db
          .select({ cents: priceTicks.etbCentsPerGram, at: priceTicks.at })
          .from(priceTicks)
          .where(eq(priceTicks.asset, asset))
          .orderBy(asc(priceTicks.at))
          .limit(1)
      )[0];
    if (!reference || reference.cents === 0n || reference.at.getTime() === latestAt.getTime()) {
      return null;
    }
    return ((latestCents - reference.cents) * 100_000n / reference.cents).toString();
  }

  /**
   * Both metals in one payload — the unit the SSE stream pushes and the poll
   * fallback fetches. An asset with no ticks yet is skipped rather than
   * failing the whole snapshot (fresh-install case).
   */
  async snapshot(): Promise<PriceSnapshotResponse> {
    const settled = await Promise.allSettled(METAL_ASSETS.map((asset) => this.latest(asset)));
    const prices = settled
      .filter((r): r is PromiseFulfilledResult<PriceLatestResponse> => r.status === "fulfilled")
      .map((r) => r.value);
    return { prices, at: new Date().toISOString() };
  }

  async history(asset: MetalAsset, range: PriceRange): Promise<PriceHistoryResponse> {
    const cfg = RANGE_CONFIG[range];
    // Bucketed average keeps payloads small at any range length.
    const points = await this.db
      .select({
        at: sql<string>`to_char(date_bin(${cfg.bucketSql}::interval, ${priceTicks.at}, 'epoch'::timestamptz), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
        etbCentsPerGram: sql<string>`round(avg(${priceTicks.etbCentsPerGram}))::text`,
      })
      .from(priceTicks)
      .where(
        and(
          eq(priceTicks.asset, asset),
          gte(priceTicks.at, sql`now() - ${cfg.intervalSql}::interval`),
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`1`);

    return { asset, range, points };
  }
}
