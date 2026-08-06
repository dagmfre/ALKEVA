import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { priceTicks, type Db } from "@alkeva/db";
import {
  MAX_TICK_AGE_SECONDS,
  type MetalAsset,
  type PriceHistoryResponse,
  type PriceLatestResponse,
  type PriceRange,
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
    };
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
