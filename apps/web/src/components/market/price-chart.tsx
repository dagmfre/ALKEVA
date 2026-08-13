"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { MetalAsset, PriceRange } from "@alkeva/shared";

import { useAssetPrice } from "@/components/market/price-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { axisLabel, money } from "@/lib/format";
import { usePriceSeries } from "@/lib/use-price-series";
import { cn } from "@/lib/utils";

const RANGES: PriceRange[] = ["24h", "7d", "30d", "1y"];
const W = 796;
const H = 320;
const PAD = 14;

/**
 * One metal, one range, one line — with the axes a price chart owes its reader.
 *
 * No categorical palette and no candlesticks: a single series does not need
 * five colours, and OHLC candles imply an intraday order book this product
 * does not have. What it does have is a real y-axis, the current price tagged
 * on it, a time axis, and the window's true open/high/low — all read off the
 * ticks the worker stored (`design/design.md` §4).
 */
export function PriceChart({
  asset,
  className,
  chartClassName,
  showOhlc = true,
}: {
  asset: MetalAsset;
  className?: string;
  chartClassName?: string;
  showOhlc?: boolean;
}) {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const [range, setRange] = useState<PriceRange>("24h");
  const series = usePriceSeries(asset, range);
  // "Current" is the shared store's latest raw tick — the buckets only draw
  // the line. Before the first snapshot lands, fall back to the last bucket
  // so the chart never shows an empty cell.
  const live = useAssetPrice(asset);
  const current = live?.etbCentsPerGram ?? series.lastBucket;

  const isGold = asset === "XAU";
  const stroke = isGold ? "var(--gold-400)" : "var(--platinum-400)";
  const points = series.points;

  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => Number(BigInt(p.etbCentsPerGram)));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mid = (min + max) / 2;

    /**
     * The axis always spans at least ±0.5% of the price.
     *
     * Without this floor the axis fits itself to whatever the data did, so a
     * quiet day — gold moved 0.07% — renders as a dramatic cliff from the
     * bottom of the frame to the top. On a savings product that is a lie told
     * with geometry: the shape says "something happened" when nothing did.
     */
    const MIN_SPAN_RATIO = 0.01;
    const minSpan = Math.max(1, mid * MIN_SPAN_RATIO);
    const lo = max - min < minSpan ? mid - minSpan / 2 : min;
    const hi = max - min < minSpan ? mid + minSpan / 2 : max;
    const span = hi - lo;

    const x = (i: number) => (i / (points.length - 1)) * W;
    const y = (v: number) => H - PAD - ((v - lo) / span) * (H - PAD * 2);

    const line = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" L");
    const last = values[values.length - 1] ?? mid;

    return {
      line: `M${line}`,
      area: `M${line} L${W},${H} L0,${H} Z`,
      lastX: x(values.length - 1),
      lastY: y(last),
      lo,
      span,
      ticks: niceTicks(lo, hi).map((v) => ({ value: v, y: y(v) })),
      xLabels: pickIndices(points.length).map((i) => ({
        key: i,
        label: axisLabel(points[i]!.at, range),
      })),
    };
  }, [points, range]);

  // Pin the current-price tag where the LIVE tick sits on the chart's own
  // scale, clamped into the frame when the tick has moved outside the window.
  const tagY = useMemo(() => {
    if (!geometry) return 0;
    if (!current) return geometry.lastY;
    const v = Number(BigInt(current));
    const raw = H - PAD - ((v - geometry.lo) / geometry.span) * (H - PAD * 2);
    return Math.min(Math.max(raw, PAD), H - PAD);
  }, [geometry, current]);

  const gradientId = `fade-${asset}`;

  return (
    <section
      className={cn(
        "flex flex-col rounded-lg border bg-card px-4 pb-3 pt-4 lg:px-5",
        isGold ? "border-gold-500/30" : "border-border",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5 text-[1.125rem] font-semibold">
          <span
            className={cn("size-2.5 flex-none rounded-full", isGold ? "bg-gold-500" : "bg-platinum-400")}
          />
          {isGold ? tc("gold") : tc("platinum")}
          <span className="text-[0.9375rem] font-normal text-muted-foreground">
            · {tc("perGram")}
          </span>
        </span>
        <span className="flex items-center gap-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={cn(
                "font-latin min-h-9 rounded-full px-3.5 text-[0.8125rem] transition-colors",
                range === r
                  ? "bg-popover font-semibold text-foreground"
                  : "font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </span>
      </div>

      {showOhlc && (
        <div className="mb-2.5 flex flex-wrap gap-x-6 gap-y-1.5">
          <Ohlc label={t("open")} value={series.open} />
          <Ohlc label={t("high")} value={series.high} />
          <Ohlc label={t("low")} value={series.low} />
          <Ohlc label={t("current")} value={current} accent={isGold ? "gold" : "platinum"} />
        </div>
      )}

      {series.loading ? (
        <Skeleton className={cn("h-40 flex-1 rounded-md", chartClassName)} />
      ) : geometry ? (
        <>
          <div className={cn("grid min-h-0 flex-1 grid-cols-[1fr_5.375rem]", chartClassName)}>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              width="100%"
              height="100%"
              preserveAspectRatio="none"
              role="img"
              aria-label={`${asset} ${range}`}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                </linearGradient>
              </defs>
              {geometry.ticks.map((tick) => (
                <line
                  key={tick.value}
                  x1="0"
                  y1={tick.y}
                  x2={W}
                  y2={tick.y}
                  stroke="var(--border)"
                  strokeOpacity="0.75"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <path d={geometry.area} fill={`url(#${gradientId})`} />
              <path
                d={geometry.line}
                fill="none"
                stroke={stroke}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              <circle cx={geometry.lastX} cy={geometry.lastY} r="4" fill={stroke} vectorEffect="non-scaling-stroke" />
            </svg>

            <div className="font-latin relative text-xs text-subtle">
              {geometry.ticks.map((tick) => (
                <span
                  key={tick.value}
                  className="absolute end-0 -translate-y-1/2 tabular-nums"
                  style={{ top: `${(tick.y / H) * 100}%` }}
                >
                  {money(BigInt(Math.round(tick.value)))}
                </span>
              ))}
              <span
                className={cn(
                  "absolute end-0 -translate-y-1/2 rounded-sm px-2 py-0.5 font-semibold tabular-nums text-primary-foreground",
                  isGold ? "bg-gold-500" : "bg-platinum-400",
                )}
                style={{ top: `${(tagY / H) * 100}%` }}
              >
                {current ? money(current) : ""}
              </span>
            </div>
          </div>

          <div className="font-latin flex justify-between pe-[5.375rem] pt-2 text-xs text-subtle">
            {geometry.xLabels.map((l) => (
              <span key={l.key}>{l.label}</span>
            ))}
          </div>
        </>
      ) : (
        <p className="px-4 py-10 text-center text-[0.9375rem] text-muted-foreground">
          {t("noChartData")}
        </p>
      )}
    </section>
  );
}

function Ohlc({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | null;
  accent?: "gold" | "platinum";
}) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-[0.9375rem] text-muted-foreground">{label}</span>
      {value ? (
        <span
          className={cn(
            "tnum text-sm font-semibold",
            accent === "gold" && "text-gold-400",
            accent === "platinum" && "text-platinum-400",
          )}
        >
          {money(value)}
        </span>
      ) : (
        <Skeleton className="h-4 w-16" />
      )}
    </span>
  );
}

/**
 * Gridline values a human would have chosen: 1/2/5 × a power of ten inside the
 * visible span. Dividing the span into equal thirds instead would print axis
 * labels like 22,183.33 — arithmetically fine, unreadable on a chart.
 */
function niceTicks(lo: number, hi: number, target = 4): number[] {
  const raw = (hi - lo) / Math.max(1, target - 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 0.001; v += step) out.push(v);
  return out;
}

/** ~5 evenly spaced sample indices for the time axis, endpoints included. */
function pickIndices(length: number, count = 5): number[] {
  if (length <= count) return Array.from({ length }, (_, i) => i);
  return Array.from({ length: count }, (_, i) => Math.round((i / (count - 1)) * (length - 1)));
}
