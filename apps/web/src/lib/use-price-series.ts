"use client";

import { useMemo } from "react";
import type { MetalAsset, PriceHistoryResponse, PricePointDto, PriceRange } from "@alkeva/shared";

import { PRICE_TICK_MS } from "@/lib/constants";
import { useResource } from "@/lib/use-resource";

export interface PriceSeries {
  points: PricePointDto[];
  /** First, highest, lowest and last tick in the window — all in ETB cents/g. */
  open: string | null;
  high: string | null;
  low: string | null;
  current: string | null;
  /** (last − first) / first × 100. Null when the window has fewer than 2 ticks. */
  changePct: number | null;
  loading: boolean;
}

/**
 * One metal over one window, plus the four figures a trader reads first.
 *
 * Every number here is derived from ticks the price worker actually stored —
 * open/high/low are the real extremes of the returned series, not a decorative
 * OHLC row. When the window holds a single tick there is no change to report
 * and the hook says so with null rather than inventing 0.00%.
 */
export function usePriceSeries(asset: MetalAsset, range: PriceRange): PriceSeries {
  const { data, loading } = useResource<PriceHistoryResponse>(
    `/prices/history?asset=${asset}&range=${range}`,
    { intervalMs: range === "24h" ? PRICE_TICK_MS * 4 : undefined },
  );

  return useMemo(() => {
    const points = data?.points ?? [];
    if (points.length === 0) {
      return { points, open: null, high: null, low: null, current: null, changePct: null, loading };
    }

    let high = BigInt(points[0]!.etbCentsPerGram);
    let low = high;
    for (const p of points) {
      const v = BigInt(p.etbCentsPerGram);
      if (v > high) high = v;
      if (v < low) low = v;
    }

    const first = BigInt(points[0]!.etbCentsPerGram);
    const last = BigInt(points[points.length - 1]!.etbCentsPerGram);
    const changePct =
      points.length > 1 && first > 0n ? (Number(last - first) / Number(first)) * 100 : null;

    return {
      points,
      open: first.toString(),
      high: high.toString(),
      low: low.toString(),
      current: last.toString(),
      changePct,
      loading,
    };
  }, [data, loading]);
}
