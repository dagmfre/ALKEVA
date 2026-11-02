import http from "node:http";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Redis } from "ioredis";
import { createDb, notifications, priceTicks, users } from "@alkeva/db";
import {
  loadDotenvUpwards,
  loadEnv,
  METAL_ASSETS,
  UNITS,
  type MetalAsset,
} from "@alkeva/shared";
import { checkAlerts } from "./alerts.js";
import { NotificationDispatcher } from "./dispatcher.js";
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
// idleTimeoutSec 0: the lock lives exactly as long as this connection, and the
// default 20 s idle timeout silently closed it — releasing the lock while
// this worker kept writing, so a second worker could start ticking too
// (seen 2 Nov 2026: two workers both firing alerts).
const lockConn = createDb(env.DATABASE_URL, { max: 1, idleTimeoutSec: 0 }).client;
const LOCK_KEY = [0x414c4b, 0x707774] as const; // "ALK", "pwt" — price-worker tick lock

async function acquireSingleWriterLock(): Promise<boolean> {
  const [row] = await lockConn`
    select pg_try_advisory_lock(${LOCK_KEY[0]}, ${LOCK_KEY[1]}) as ok
  `;
  return Boolean(row?.ok);
}

const FX_CACHE_KEY = "fx:USD:ETB:micro";
/** Last FX rate that passed the jump check — never expires. */
const FX_GOOD_KEY = "fx:USD:ETB:last-good";
/** A jump that keeps repeating: { micro, count } — accepted after FX_CONFIRMATIONS. */
const FX_PENDING_KEY = "fx:USD:ETB:pending";
const FX_CONFIRMATIONS = 6;
const FX_RETRY_SECONDS = 600;
const FX_SOURCE = "open.er-api.com";
/** Two feeds "agree" when they are within this many basis points. */
const AGREE_BPS = 50n;
/** Last tick per metal that was not suspect — the circuit breaker's anchor. */
const lastGood = new Map<MetalAsset, bigint>();
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

function movedBps(from: bigint, to: bigint): bigint {
  if (from === 0n) return 0n;
  const diff = to > from ? to - from : from - to;
  return (diff * 10_000n) / from;
}

/**
 * The same notice to every active administrator/finance user, at most once an
 * hour per kind. Rows are queued; the notification dispatcher delivers them.
 */
async function notifyStaff(kind: string, message: string): Promise<void> {
  try {
    const first = await redis.set(`staffalert:${kind}`, "1", "EX", 3600, "NX");
    if (!first) return;
    const staff = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.role, ["administrator", "finance"]), eq(users.status, "active")));
    for (const s of staff) {
      await db.insert(notifications).values({
        userId: s.id,
        channel: "email",
        template: "staff_alert",
        payload: { kind, message, url: "/admin/treasury" },
        status: "queued",
      });
    }
  } catch (err) {
    console.error(`staff alert failed (${kind}): ${(err as Error).message}`);
  }
}

/**
 * USD→ETB with a jump guard. A refresh that moves more than FX_MAX_MOVE_BPS
 * from the last accepted rate is held back (the previous rate keeps serving)
 * until the same reading has repeated FX_CONFIRMATIONS times — a real
 * devaluation persists, a bad print does not. Staff hear about it either way.
 */
async function getFxMicro(): Promise<bigint> {
  const cached = await redis.get(FX_CACHE_KEY);
  if (cached) return BigInt(cached);
  const fresh = await fetchUsdEtbRate(env.FX_URL);
  const goodRaw = await redis.get(FX_GOOD_KEY);
  const good = goodRaw ? BigInt(goodRaw) : null;

  if (good === null || movedBps(good, fresh) <= BigInt(env.FX_MAX_MOVE_BPS)) {
    await redis.del(FX_PENDING_KEY);
    await redis.set(FX_GOOD_KEY, fresh.toString());
    await redis.set(FX_CACHE_KEY, fresh.toString(), "EX", env.FX_CACHE_SECONDS);
    return fresh;
  }

  const pendingRaw = await redis.get(FX_PENDING_KEY);
  const pending = pendingRaw ? (JSON.parse(pendingRaw) as { micro: string; count: number }) : null;
  const count =
    pending && movedBps(BigInt(pending.micro), fresh) <= AGREE_BPS ? pending.count + 1 : 1;
  if (count >= FX_CONFIRMATIONS) {
    console.warn(`fx: ${fresh} confirmed after ${count} readings — accepting the new level`);
    await redis.del(FX_PENDING_KEY);
    await redis.set(FX_GOOD_KEY, fresh.toString());
    await redis.set(FX_CACHE_KEY, fresh.toString(), "EX", env.FX_CACHE_SECONDS);
    await notifyStaff(
      "fx_level_accepted",
      `USD→ETB moved from ${Number(good) / 1e6} to ${Number(fresh) / 1e6} and held for ${count} readings; the new rate is now used for prices.`,
    );
    return fresh;
  }
  await redis.set(FX_PENDING_KEY, JSON.stringify({ micro: fresh.toString(), count }));
  // Keep serving the last good rate, but look again soon.
  await redis.set(FX_CACHE_KEY, good.toString(), "EX", FX_RETRY_SECONDS);
  console.warn(`fx: ${fresh} is a ${movedBps(good, fresh)} bps jump from ${good} — held (${count}/${FX_CONFIRMATIONS})`);
  await notifyStaff(
    "fx_jump_held",
    `USD→ETB feed jumped from ${Number(good) / 1e6} to ${Number(fresh) / 1e6}. Prices keep using the previous rate until the new one repeats ${FX_CONFIRMATIONS} times.`,
  );
  return good;
}

async function fetchSecondary(asset: MetalAsset, primarySource: string): Promise<FeedResult | null> {
  try {
    return primarySource === "swissquote"
      ? await fetchPrimary(env.PRICE_PRIMARY_URL, asset)
      : await fetchFallback(env.PRICE_FALLBACK_URL, asset);
  } catch {
    return null;
  }
}

/**
 * Circuit breaker: a move larger than PRICE_MAX_TICK_MOVE_BPS from the last
 * good tick needs the other feed to agree. Unconfirmed, the tick is stored
 * (the record stays honest) but flagged suspect: quotes refuse it, the public
 * price keeps showing the last good tick, and staff are told.
 */
async function isSuspect(asset: MetalAsset, feed: FeedResult): Promise<boolean> {
  const anchor = lastGood.get(asset);
  if (anchor === undefined) return false;
  if (movedBps(anchor, feed.usdPerOzMicro) <= BigInt(env.PRICE_MAX_TICK_MOVE_BPS)) return false;
  const second = await fetchSecondary(asset, feed.source);
  if (second && movedBps(feed.usdPerOzMicro, second.usdPerOzMicro) <= AGREE_BPS) {
    console.warn(`[${asset}] large move confirmed by ${second.source}`);
    return false;
  }
  return true;
}

async function seedLastGood(): Promise<void> {
  for (const asset of METAL_ASSETS) {
    const [row] = await db
      .select({ usd: priceTicks.usdPerOzMicro })
      .from(priceTicks)
      .where(and(eq(priceTicks.asset, asset), eq(priceTicks.suspect, false)))
      .orderBy(desc(priceTicks.at))
      .limit(1);
    if (row) lastGood.set(asset, row.usd);
  }
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
      const suspect = await isSuspect(asset, feed);
      await db.insert(priceTicks).values({
        asset,
        usdPerOzMicro: feed.usdPerOzMicro,
        etbRateMicro: fxMicro,
        etbCentsPerGram,
        source: feed.source,
        fxSource: FX_SOURCE,
        suspect,
      });
      if (suspect) {
        const anchor = lastGood.get(asset) ?? 0n;
        console.warn(
          `[${asset}] SUSPECT tick from ${feed.source}: ${Number(feed.usdPerOzMicro) / 1e6} USD/oz vs last good ${Number(anchor) / 1e6} — not confirmed, quotes refuse it`,
        );
        await notifyStaff(
          `price_suspect_${asset}`,
          `${asset} feed (${feed.source}) moved ${movedBps(anchor, feed.usdPerOzMicro)} bps and the second feed did not confirm it. Buying and selling ${asset} is paused until a confirmed price arrives.`,
        );
        continue;
      }
      lastGood.set(asset, feed.usdPerOzMicro);
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
        await checkAlerts(db, redis, pushReady, asset, etbCentsPerGram);
      } catch (err) {
        console.error(`[${asset}] alert check failed: ${(err as Error).message}`);
      }
    } catch (err) {
      console.error(`[${asset}] all feeds failed: ${(err as Error).message}`);
    }
  }
}

const pushReady = env.WEB_PUSH_VAPID_PUBLIC_KEY.length > 0 && env.WEB_PUSH_VAPID_PRIVATE_KEY.length > 0;
const dispatcher = new NotificationDispatcher(db, env);

/**
 * Delivers the notification outbox (email + browser push) every few seconds,
 * on its own loop so a slow SMTP server can never delay a price tick.
 */
async function dispatchLoop(): Promise<void> {
  console.log(`notification dispatcher: every 3s (email ${env.SMTP_HOST ? "on" : "off"}, push ${pushReady ? "on" : "off"})`);
  while (running) {
    let handled = 0;
    try {
      handled = await dispatcher.runOnce();
    } catch (err) {
      console.error(`dispatch failed: ${(err as Error).message}`);
    }
    // A full batch means more is waiting: go again at once.
    if (handled < 20) await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

async function loop(): Promise<void> {
  console.log(
    `ALKEVA price worker: every ${env.PRICE_TICK_SECONDS}s, primary=${env.PRICE_FALLBACK_URL} (swissquote), backup=${env.PRICE_PRIMARY_URL}`,
  );
  while (running) {
    const started = Date.now();
    // Re-confirm the lock every tick (re-entrant for the holder). If the
    // connection dropped and another worker took over, stop writing and exit;
    // the container restarts into the idle path.
    if (!(await acquireSingleWriterLock().catch(() => false))) {
      console.error("price worker: lost the tick lock — exiting so only one writer remains");
      process.exit(1);
    }
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
  await seedLastGood();
  void dispatchLoop();
  await loop();
} else {
  // Another worker holds the lock. Idle (don't exit: on Render an exit would
  // restart-loop the whole service) and never write a duplicate tick.
  console.warn(
    "price worker: another instance holds the tick lock — idling, not writing",
  );
  await new Promise(() => undefined);
}
