import { Redis } from "ioredis";
import { createDb, priceTicks } from "@alkeva/db";
import {
  loadDotenvUpwards,
  loadEnv,
  METAL_ASSETS,
  UNITS,
  type MetalAsset,
} from "@alkeva/shared";
import { checkAlerts } from "./alerts.js";
import { fetchFallback, fetchPrimary, fetchUsdEtbRate, type FeedResult } from "./feeds.js";

/**
 * ALKEVA price worker — Design §6.
 * Every PRICE_TICK_SECONDS: metal USD/oz (primary → fallback) × cached USD→ETB
 * → integer ETB cents per gram → insert price_tick with both sources recorded.
 * If both feeds fail, no tick is written; the API serves the last tick as stale.
 */
loadDotenvUpwards();
const env = loadEnv();
const { db, client } = createDb(env.DATABASE_URL, { max: 2 });
const redis = new Redis(env.REDIS_URL);

// Single-writer guard: a session-scoped advisory lock on its own dedicated
// connection (max: 1 — the lock lives exactly as long as this process).
// Stale/duplicate worker processes were observed double-writing ticks; a
// second instance now idles instead of writing.
const lockConn = createDb(env.DATABASE_URL, { max: 1 }).client;
const LOCK_KEY = [0x414c4b, 0x707774] as const; // "ALK", "pwt" — price-worker tick lock

async function acquireSingleWriterLock(): Promise<boolean> {
  const [row] = await lockConn`
    select pg_try_advisory_lock(${LOCK_KEY[0]}, ${LOCK_KEY[1]}) as ok
  `;
  return Boolean(row?.ok);
}

const FX_CACHE_KEY = "fx:USD:ETB:micro";
const FX_SOURCE = "open.er-api.com";
let running = true;

/** cents/g = (usdPerOzMicro × fxMicro × 100_000) / (1e12 × TROY_OZ_MG) */
function computeEtbCentsPerGram(usdPerOzMicro: bigint, fxMicro: bigint): bigint {
  return (
    (usdPerOzMicro * fxMicro * 100_000n) /
    (UNITS.MICRO * UNITS.MICRO * UNITS.TROY_OZ_MG)
  );
}

async function getFxMicro(): Promise<bigint> {
  const cached = await redis.get(FX_CACHE_KEY);
  if (cached) return BigInt(cached);
  const fresh = await fetchUsdEtbRate(env.FX_URL);
  await redis.set(FX_CACHE_KEY, fresh.toString(), "EX", env.FX_CACHE_SECONDS);
  return fresh;
}

async function fetchMetal(asset: MetalAsset): Promise<FeedResult> {
  try {
    return await fetchPrimary(env.PRICE_PRIMARY_URL, asset);
  } catch (primaryErr) {
    console.warn(`[${asset}] primary feed failed: ${(primaryErr as Error).message}`);
    return await fetchFallback(env.PRICE_FALLBACK_URL, asset);
  }
}

async function tick(): Promise<void> {
  const fxMicro = await getFxMicro();
  for (const asset of METAL_ASSETS) {
    try {
      const feed = await fetchMetal(asset);
      const etbCentsPerGram = computeEtbCentsPerGram(feed.usdPerOzMicro, fxMicro);
      await db.insert(priceTicks).values({
        asset,
        usdPerOzMicro: feed.usdPerOzMicro,
        etbRateMicro: fxMicro,
        etbCentsPerGram,
        source: feed.source,
        fxSource: FX_SOURCE,
      });
      console.log(
        `[${asset}] ${feed.source}: ${(Number(feed.usdPerOzMicro) / 1e6).toFixed(2)} USD/oz → ${(
          Number(etbCentsPerGram) / 100
        ).toFixed(2)} ETB/g`,
      );
      // Wake the API's SSE fan-out the instant the tick lands. A publish
      // failure must never fail the tick — the API's safety poll covers it.
      try {
        await redis.publish("price:tick", asset);
      } catch (err) {
        console.error(`[${asset}] tick publish failed: ${(err as Error).message}`);
      }
      // Alerts fire on the tick that crossed them (F24). An alert failure
      // must never stop the price loop.
      try {
        await checkAlerts(db, env, asset, etbCentsPerGram);
      } catch (err) {
        console.error(`[${asset}] alert check failed: ${(err as Error).message}`);
      }
    } catch (err) {
      console.error(`[${asset}] all feeds failed: ${(err as Error).message}`);
    }
  }
}

async function loop(): Promise<void> {
  console.log(
    `ALKEVA price worker: every ${env.PRICE_TICK_SECONDS}s, primary=${env.PRICE_PRIMARY_URL}`,
  );
  while (running) {
    const started = Date.now();
    try {
      await tick();
    } catch (err) {
      // FX failure lands here — skip the whole tick, never write a made-up rate.
      console.error(`tick failed: ${(err as Error).message}`);
    }
    const elapsed = Date.now() - started;
    const waitMs = Math.max(0, env.PRICE_TICK_SECONDS * 1000 - elapsed);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down`);
  running = false;
  await Promise.allSettled([client.end(), lockConn.end(), redis.quit()]);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

if (await acquireSingleWriterLock()) {
  await loop();
} else {
  // Another worker holds the lock. Idle (don't exit: on Render an exit would
  // restart-loop the whole service) and never write a duplicate tick.
  console.warn(
    "price worker: another instance holds the tick lock — idling, not writing",
  );
  await new Promise(() => undefined);
}
