"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  MetalAsset,
  PriceLatestResponse,
  PriceSnapshotResponse,
} from "@alkeva/shared";

import { api } from "@/lib/api";

/**
 * The one price the whole platform shows.
 *
 * Every consumer — top-bar ticker, Home cards, the chart's current-price tag,
 * the trade estimate, the alert dialog, holdings totals — reads THIS store, so
 * at any instant the entire UI renders the identical latest tick. Divergence
 * (bucket averages in one corner, a 3-minute-old fetch in another) is what this
 * file exists to make impossible.
 *
 * Transport: SSE first (`/api/prices/stream` — a snapshot is pushed the moment
 * the worker lands a tick), degrading to one shared 10s poll of
 * `/api/prices/snapshot` when the stream can't be held open, retrying SSE
 * every minute. One connection or one timer for the whole app — never one per
 * component.
 */

/** Exactly the API's latest-tick shape — `etbCentsPerGram` is always a raw tick, never a bucket average. */
export type LivePrice = PriceLatestResponse;

export type FeedStatus = "connecting" | "live" | "polling" | "degraded";

export interface PriceStore {
  prices: Partial<Record<MetalAsset, LivePrice>>;
  status: FeedStatus;
  /** True when either asset's tick is older than the freshness window — drives the stale banner. */
  anyStale: boolean;
}

const PriceContext = createContext<PriceStore | null>(null);

// Mirrors MAX_TICK_AGE_SECONDS in @alkeva/shared. Kept local because the web
// app only ever `import type`s from shared — a value import drags the Node-only
// env.ts into the browser bundle (the Phase 3 countdown-ring failure class).
const MAX_TICK_AGE_MS = 180_000;
const POLL_MS = 10_000;
const SSE_RETRY_MS = 60_000;
const SSE_GIVE_UP_ERRORS = 3;
const SSE_OPEN_TIMEOUT_MS = 15_000;
/** How often the staleness ratchet re-evaluates a quiet feed. */
const RATCHET_MS = 30_000;

export function PriceProvider({ children }: { children: React.ReactNode }) {
  const [prices, setPrices] = useState<Partial<Record<MetalAsset, LivePrice>>>({});
  const [status, setStatus] = useState<FeedStatus>("connecting");
  // Bumped on a timer so a feed that stopped delivering still flips to stale.
  const [ratchet, setRatchet] = useState(0);

  useEffect(() => {
    let disposed = false;
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let sseRetryTimer: ReturnType<typeof setTimeout> | null = null;
    let openTimeout: ReturnType<typeof setTimeout> | null = null;
    let errorCount = 0;

    const applySnapshot = (snap: PriceSnapshotResponse) => {
      if (disposed || !Array.isArray(snap.prices)) return;
      setPrices((prev) => {
        const next = { ...prev };
        for (const p of snap.prices) next[p.asset as MetalAsset] = p;
        return next;
      });
    };

    /** One snapshot fetch. `silent` keeps it from touching status (visibility resume). */
    const fetchOnce = async (silent: boolean) => {
      try {
        applySnapshot(await api<PriceSnapshotResponse>("/prices/snapshot"));
        if (!silent) setStatus("polling");
      } catch {
        if (!silent) setStatus("degraded");
      }
    };

    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      if (sseRetryTimer) clearTimeout(sseRetryTimer);
      sseRetryTimer = null;
    };

    const closeStream = () => {
      if (openTimeout) clearTimeout(openTimeout);
      openTimeout = null;
      es?.close();
      es = null;
    };

    const startPolling = () => {
      if (disposed || pollTimer) return;
      void fetchOnce(false);
      pollTimer = setInterval(() => void fetchOnce(false), POLL_MS);
      // Keep trying to get the stream back — SSE is the primary transport.
      sseRetryTimer = setTimeout(() => {
        stopPolling();
        connect();
      }, SSE_RETRY_MS);
    };

    const fallBack = () => {
      closeStream();
      startPolling();
    };

    const connect = () => {
      if (disposed || document.visibilityState === "hidden") return;
      errorCount = 0;
      setStatus((s) => (s === "polling" || s === "degraded" ? s : "connecting"));
      es = new EventSource("/api/prices/stream");
      openTimeout = setTimeout(fallBack, SSE_OPEN_TIMEOUT_MS);
      es.onopen = () => {
        if (openTimeout) clearTimeout(openTimeout);
        openTimeout = null;
        errorCount = 0;
      };
      es.addEventListener("snapshot", (ev) => {
        errorCount = 0;
        setStatus("live");
        try {
          applySnapshot(JSON.parse((ev as MessageEvent).data) as PriceSnapshotResponse);
        } catch {
          /* malformed frame — the next one recovers */
        }
      });
      es.onerror = () => {
        // EventSource retries by itself; only bail after repeated failures.
        errorCount += 1;
        if (errorCount >= SSE_GIVE_UP_ERRORS) fallBack();
      };
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        // No point streaming to a hidden tab — free the connection.
        closeStream();
        stopPolling();
      } else {
        void fetchOnce(true); // catch up instantly, then resume the stream
        connect();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    connect();
    const ratchetTimer = setInterval(() => setRatchet((n) => n + 1), RATCHET_MS);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      closeStream();
      stopPolling();
      clearInterval(ratchetTimer);
    };
  }, []);

  const value = useMemo<PriceStore>(() => {
    void ratchet; // dependency: re-evaluate staleness on the timer
    const now = Date.now();
    const out: Partial<Record<MetalAsset, LivePrice>> = {};
    let anyStale = false;
    for (const [asset, p] of Object.entries(prices) as [MetalAsset, LivePrice][]) {
      // Ratchet: a dead feed can't keep showing a green price — recompute
      // staleness locally from the tick's own timestamp.
      const stale = p.stale || now - new Date(p.at).getTime() > MAX_TICK_AGE_MS;
      out[asset] = stale === p.stale ? p : { ...p, stale };
      if (stale) anyStale = true;
    }
    return { prices: out, status, anyStale };
  }, [prices, status, ratchet]);

  return <PriceContext.Provider value={value}>{children}</PriceContext.Provider>;
}

export function usePrices(): PriceStore {
  const ctx = useContext(PriceContext);
  if (!ctx) throw new Error("usePrices must be used inside <PriceProvider>");
  return ctx;
}

/** The latest raw tick for one metal, or null before the first snapshot arrives. */
export function useAssetPrice(asset: MetalAsset): LivePrice | null {
  return usePrices().prices[asset] ?? null;
}
