import { Redis } from "ioredis";
import { createDb, priceTicks } from "@alkeva/db";
import {
  loadDotenvUpwards,
  loadEnv,
  METAL_ASSETS,
  UNITS,
  type MetalAsset,
} from "@alkeva/shared";
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
  await Promise.allSettled([client.end(), redis.quit()]);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await loop();
