"use client";

import { useMemo } from "react";
import type { MetalAsset, PriceHistoryResponse, PricePointDto, PriceRange } from "@alkeva/shared";

import { useResource } from "@/lib/use-resource";

export interface PriceSeries {
  points: PricePointDto[];
  /** First, highest and lowest bucket in the window — ETB cents/g. */
  open: string | null;
  high: string | null;
  low: string | null;
  /**
   * The window's last BUCKET AVERAGE — a chart-drawing figure only. The
   * platform's "current price" is the shared PriceProvider's latest raw tick;
   * this hook deliberately does not expose anything called `current` so a
   * bucket average can never again be rendered as the live price.
   */
  lastBucket: string | null;
  loading: boolean;
}

const REFRESH_MS: Record<PriceRange, number> = {
  "24h": 60_000,
  // Coarser buckets move slowly, but "never" was a bug — a chart left open
  // on 7d/30d/1y previously froze at its mount-time data forever.
  "7d": 300_000,
  "30d": 300_000,
  "1y": 300_000,
};

/**
 * One metal over one window, for drawing. Every number is derived from ticks
 * the price worker actually stored — open/high/low are the real extremes of
 * the returned series, not a decorative OHLC row.
 */
export function usePriceSeries(asset: MetalAsset, range: PriceRange): PriceSeries {
  const { data, loading } = useResource<PriceHistoryResponse>(
    `/prices/history?asset=${asset}&range=${range}`,
    { intervalMs: REFRESH_MS[range] },
  );

  return useMemo(() => {
    const points = data?.points ?? [];
    if (points.length === 0) {
      return { points, open: null, high: null, low: null, lastBucket: null, loading };
    }

    let high = BigInt(points[0]!.etbCentsPerGram);
    let low = high;
    for (const p of points) {
      const v = BigInt(p.etbCentsPerGram);
      if (v > high) high = v;
      if (v < low) low = v;
    }

    return {
      points,
      open: points[0]!.etbCentsPerGram,
      high: high.toString(),
      low: low.toString(),
      lastBucket: points[points.length - 1]!.etbCentsPerGram,
      loading,
    };
  }, [data, loading]);
}
