import { Controller, Get, Inject } from "@nestjs/common";
import { desc, sql } from "drizzle-orm";
import type { Redis } from "ioredis";
import { priceTicks, type Db } from "@alkeva/db";
import { MAX_TICK_AGE_SECONDS, type HealthResponse } from "@alkeva/shared";
import { DB, REDIS } from "../core/core.module.js";

@Controller()
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get("healthz")
  async healthz(): Promise<HealthResponse> {
    let db: HealthResponse["db"] = "ok";
    let redis: HealthResponse["redis"] = "ok";
    let priceFeed: HealthResponse["priceFeed"] = "empty";
    let latestTickAgeSec: number | null = null;

    try {
      await this.db.execute(sql`select 1`);
    } catch {
      db = "down";
    }

    try {
      await this.redis.ping();
    } catch {
      redis = "down";
    }

    if (db === "ok") {
      try {
        const rows = await this.db
          .select({ at: priceTicks.at })
          .from(priceTicks)
          .orderBy(desc(priceTicks.at))
          .limit(1);
        if (rows[0]) {
          latestTickAgeSec = Math.round((Date.now() - rows[0].at.getTime()) / 1000);
          priceFeed = latestTickAgeSec > MAX_TICK_AGE_SECONDS ? "stale" : "ok";
        }
      } catch {
        priceFeed = "empty";
      }
    }

    return {
      ok: db === "ok" && redis === "ok" && priceFeed === "ok",
      db,
      redis,
      priceFeed,
      latestTickAgeSec,
    };
  }
}
