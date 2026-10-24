import http from "node:http";
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
let holdsWriteLock = false;
let lastTickAt: string | null = null;

/**
 * Health listener. Two jobs, both consequences of Render's free tier having no
 * background-worker type — this process runs as a *web* service:
 *   1. Render fails a deploy that never opens a port.
 *   2. Free web services sleep after ~15 min without traffic, and the price
 *      loop sleeps with them. Now that the API lives on Vercel, no ALKEVA
 *      traffic reaches Render at all, so an external uptime pinger hitting
 *      /healthz is the only thing keeping ticks flowing.
 * Binds only when PORT is set, so local `pnpm dev:worker` opens nothing.
 */
function startHealthServer(): void {
  const port = process.env.PORT;
  if (!port) return;
  http
    .createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/healthz" || req.url === "/") {
        res.statusCode = 200;
        // `writer` distinguishes the ticking instance from an idling duplicate
        // holding no lock — otherwise both look identically "up".
        res.end(JSON.stringify({ ok: true, writer: holdsWriteLock, lastTickAt }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ message: "not_found" }));
    })
    .listen(Number(port), () => console.log(`worker health listening on :${port}`));
}

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
  // Swissquote first — reversing the original gold-api-primary order.
  // On 15 Aug 2026 gold-api.com served a price frozen to six decimals for
  // over an hour while refreshing its updatedAt, flat-lining every chart;
  // Swissquote's public bank feed ticks continuously. gold-api remains the
  // backup, and provenance still records whichever source actually served.
  try {
    return await fetchFallback(env.PRICE_FALLBACK_URL, asset);
  } catch (swissquoteErr) {
    console.warn(`[${asset}] swissquote failed: ${(swissquoteErr as Error).message}`);
    return await fetchPrimary(env.PRICE_PRIMARY_URL, asset);
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
      lastTickAt = new Date().toISOString();
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
    `ALKEVA price worker: every ${env.PRICE_TICK_SECONDS}s, primary=${env.PRICE_FALLBACK_URL} (swissquote), backup=${env.PRICE_PRIMARY_URL}`,
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

// Bind before the lock check: an idling duplicate must still answer Render's
// port probe and the keep-alive pings, otherwise the whole service is marked
// unhealthy and the real writer gets restarted along with it.
startHealthServer();

if (await acquireSingleWriterLock()) {
  holdsWriteLock = true;
  await loop();
} else {
  // Another worker holds the lock. Idle (don't exit: on Render an exit would
  // restart-loop the whole service) and never write a duplicate tick.
  console.warn(
    "price worker: another instance holds the tick lock — idling, not writing",
  );
  await new Promise(() => undefined);
}
