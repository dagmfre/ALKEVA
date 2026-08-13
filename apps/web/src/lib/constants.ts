/**
 * The worker's tick cadence. Live prices no longer poll at this rate — the
 * shared PriceProvider streams them over SSE (with its own 10s poll fallback);
 * this constant remains for non-price surfaces that refresh on a tick-ish beat.
 */
export const PRICE_TICK_MS = 30_000;
