import type { MetalAsset } from "@alkeva/shared";

export interface FeedResult {
  /** USD per troy ounce × 1e6. */
  usdPerOzMicro: bigint;
  source: string;
}

const FETCH_TIMEOUT_MS = 8000;

function toMicro(value: number): bigint {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`invalid price value: ${value}`);
  }
  return BigInt(Math.round(value * 1_000_000));
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

/** gold-api.com — free, keyless. GET /price/XAU → { price: 2650.12, ... } (USD/oz). */
export async function fetchPrimary(baseUrl: string, asset: MetalAsset): Promise<FeedResult> {
  const data = (await getJson(`${baseUrl}/${asset}`)) as { price?: number };
  if (typeof data.price !== "number") throw new Error("gold-api: missing price field");
  return { usdPerOzMicro: toMicro(data.price), source: "gold-api.com" };
}

/**
 * Swissquote public bbo feed — free, keyless.
 * GET /instrument/XAU/USD → [ { spreadProfilePrices: [ { bid, ask } ] } ].
 * Uses the mid of the first available bid/ask.
 */
export async function fetchFallback(baseUrl: string, asset: MetalAsset): Promise<FeedResult> {
  const data = (await getJson(`${baseUrl}/${asset}/USD`)) as Array<{
    spreadProfilePrices?: Array<{ bid?: number; ask?: number }>;
  }>;
  for (const platform of data) {
    const p = platform.spreadProfilePrices?.[0];
    if (p && typeof p.bid === "number" && typeof p.ask === "number") {
      return { usdPerOzMicro: toMicro((p.bid + p.ask) / 2), source: "swissquote" };
    }
  }
  throw new Error("swissquote: no usable bid/ask found");
}

/** open.er-api.com — free, keyless. → { rates: { ETB: 141.2 } }. Returns rate × 1e6. */
export async function fetchUsdEtbRate(url: string): Promise<bigint> {
  const data = (await getJson(url)) as { result?: string; rates?: { ETB?: number } };
  if (data.result !== "success" || typeof data.rates?.ETB !== "number") {
    throw new Error("fx: missing ETB rate");
  }
  return toMicro(data.rates.ETB);
}
