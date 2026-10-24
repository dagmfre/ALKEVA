"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { MetalAsset, PriceRange } from "@alkeva/shared";

import { useAssetPrice } from "@/components/market/price-provider";
import { Coin, Panel, PanelHeader } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { axisLabel, eatStamp, money } from "@/lib/format";
import { usePriceSeries } from "@/lib/use-price-series";
import { cn } from "@/lib/utils";

const RANGES: PriceRange[] = ["24h", "7d", "30d", "1y"];
const W = 1000;
const H = 400;
const PAD = 18;

/**
 * One metal, one range, one line, with the axes a price chart owes its reader:
 * a labelled price axis on human steps, the live price tagged on it, a time
 * axis, the window's real open/high/low/close, and a crosshair that reads any
 * point back. No candles — they imply an order book this dealer does not have.
 *
 * The chart region is the panel's elastic body: give the panel a height (or
 * let a grid row stretch it) and the plot fills it.
 */
export function PriceChart({
  asset,
  onAssetChange,
  actions,
  className,
  compact = false,
  footer = true,
}: {
  asset: MetalAsset;
  /** When given, the title becomes a Gold / Platinum selector. */
  onAssetChange?: (a: MetalAsset) => void;
  /** Extra controls beside the range selector (e.g. a price-alert button). */
  actions?: React.ReactNode;
  className?: string;
  /** Phone: no OHLC row, a fixed-height plot, a narrower axis. */
  compact?: boolean;
  footer?: boolean;
}) {
  const t = useTranslations("home");
  const tm = useTranslations("market");
  const tc = useTranslations("common");
  const [range, setRange] = useState<PriceRange>("24h");
  const series = usePriceSeries(asset, range);
  const live = useAssetPrice(asset);
  // "Current" is the shared store's latest raw tick; the buckets only draw
  // the line. Before the first snapshot lands, fall back to the last bucket.
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
     * The axis always spans at least 0.4% of the price. Without this floor a
     * quiet day (gold moved 0.07%) renders as a cliff from the bottom of the
     * frame to the top — a lie told with geometry on a savings product.
     */
    const minSpan = Math.max(1, mid * 0.004);
    const lo = max - min < minSpan ? mid - minSpan / 2 : min;
    const hi = max - min < minSpan ? mid + minSpan / 2 : max;
    const span = hi - lo;

    const x = (i: number) => (i / (points.length - 1)) * W;
    const y = (v: number) => H - PAD - ((v - lo) / span) * (H - PAD * 2);
    const line = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" L");

    return {
      values,
      line: `M${line}`,
      area: `M${line} L${W},${H} L0,${H} Z`,
      lo,
      span,
      x,
      y,
      ticks: niceTicks(lo, hi).map((v) => ({ value: v, y: y(v) })),
      xLabels: pickIndices(points.length, compact ? 4 : 6).map((i) => ({
        key: i,
        label: axisLabel(points[i]!.at, range),
      })),
    };
  }, [points, range, compact]);

  const tagY = useMemo(() => {
    if (!geometry) return 0;
    if (!current) return geometry.y(geometry.values.at(-1) ?? 0);
    const raw = geometry.y(Number(BigInt(current)));
    return Math.min(Math.max(raw, PAD), H - PAD);
  }, [geometry, current]);

  // Crosshair: the index under the pointer, or null.
  const [hover, setHover] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  function onMove(e: React.PointerEvent) {
    const el = plotRef.current;
    if (!el || !geometry) return;
    const r = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setHover(Math.round(f * (points.length - 1)));
  }

  const change =
    series.open && current
      ? ((Number(BigInt(current)) - Number(BigInt(series.open))) / Number(BigInt(series.open))) * 100
      : null;

  const gradientId = `fade-${asset}-${compact ? "c" : "f"}`;
  const axisW = compact ? "4.5rem" : "4.75rem";

  return (
    <Panel className={cn(compact ? "" : "min-h-[22rem]", className)} aria-label={tm("chartTitle")}>
      <PanelHeader
        title={
          <span className="flex min-w-0 items-center gap-4">
            {onAssetChange ? (
              <Segmented
                value={asset}
                onValueChange={onAssetChange}
                size={compact ? "sm" : "md"}
                aria-label={tm("selector")}
                options={(["XAU", "XPT"] as const).map((a) => ({
                  value: a,
                  label: (
                    <span className="flex items-center gap-1.5 font-sans">
                      <Coin metal={a} size="sm" />
                      {a === "XAU" ? tc("gold") : tc("platinum")}
                    </span>
                  ),
                }))}
              />
            ) : (
              <span>{tm("chartTitle")}</span>
            )}
            {!compact && (
              <span className="tnum hidden items-center gap-3.5 text-[0.75rem] font-medium text-subtle xl:flex">
                <Ohlc k="O" v={series.open} />
                <Ohlc k="H" v={series.high} />
                <Ohlc k="L" v={series.low} />
                <Ohlc k="C" v={current} />
                {change !== null && (
                  <span className={change >= 0 ? "text-gain" : "text-loss"}>
                    {change >= 0 ? "+" : "−"}
                    {Math.abs(change).toFixed(2)}%
                  </span>
                )}
              </span>
            )}
          </span>
        }
        action={
          <span className="flex items-center gap-2">
            {actions}
            <Segmented
              value={range}
              onValueChange={setRange}
              size={compact ? "sm" : "md"}
              aria-label={tm("range")}
              options={RANGES.map((r) => ({ value: r, label: <span className="tnum">{r}</span> }))}
            />
          </span>
        }
      />

      {series.loading ? (
        <div className={cn("px-4 pb-4", compact ? "h-[14rem]" : "min-h-0 flex-1")}>
          <Skeleton className="size-full min-h-40" />
        </div>
      ) : geometry ? (
        <div
          className={cn("grid", compact ? "h-[15rem]" : "min-h-0 flex-1")}
          style={{ gridTemplateColumns: `minmax(0,1fr) ${axisW}`, gridTemplateRows: "minmax(0,1fr) 1.875rem" }}
        >
          <div
            ref={plotRef}
            className="relative min-h-0 touch-none border-y border-border"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
          >
            {geometry.ticks.map((tick) => (
              <div
                key={tick.value}
                aria-hidden="true"
                className="absolute inset-x-0 border-t border-dashed border-white/5"
                style={{ top: `${(tick.y / H) * 100}%` }}
              />
            ))}
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="absolute inset-0 size-full overflow-visible"
              role="img"
              aria-label={`${asset} ${range}`}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={stroke} stopOpacity="0.16" />
                  <stop offset="0.55" stopColor={stroke} stopOpacity="0.04" />
                  <stop offset="1" stopColor={stroke} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={geometry.area} fill={`url(#${gradientId})`} />
              <path
                d={geometry.line}
                fill="none"
                stroke={stroke}
                strokeWidth="2"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {/* The live price level, dashed across the plot. */}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 border-t border-dashed opacity-55"
              style={{ top: `${(tagY / H) * 100}%`, borderColor: stroke }}
            />
            {hover !== null && geometry.values[hover] !== undefined && (
              <Crosshair
                left={(geometry.x(hover) / W) * 100}
                top={(geometry.y(geometry.values[hover]!) / H) * 100}
                stroke={stroke}
                when={eatStamp(points[hover]!.at)}
                value={money(points[hover]!.etbCentsPerGram)}
              />
            )}
          </div>

          <div className="relative border-y border-border">
            {geometry.ticks.map((tick) => (
              <span
                key={tick.value}
                className="tnum absolute start-2.5 -translate-y-1/2 text-[0.6875rem] text-subtle"
                style={{ top: `${(tick.y / H) * 100}%` }}
              >
                {money(BigInt(Math.round(tick.value)))}
              </span>
            ))}
            {current && (
              <span
                className="tnum absolute inset-x-1 -translate-y-1/2 rounded-[0.375rem] px-1.5 py-[3px] text-center text-[0.6875rem] font-semibold text-[#141006]"
                style={{ top: `${(tagY / H) * 100}%`, background: stroke }}
              >
                {money(current)}
              </span>
            )}
          </div>

          <div className="tnum flex items-center justify-between ps-3 pe-1 text-[0.6875rem] text-subtle">
            {geometry.xLabels.map((l) => (
              <span key={l.key}>{l.label}</span>
            ))}
          </div>
          <div />
        </div>
      ) : (
        <p className="flex flex-1 items-center justify-center px-4 py-10 text-center text-[0.875rem] text-muted-foreground">
          {t("noChartData")}
        </p>
      )}

      {footer && !compact && live && (
        <div className="tnum flex flex-none flex-wrap justify-between gap-x-3 gap-y-1 border-t border-border px-[1.125rem] py-2.5 text-[0.6875rem] text-subtle">
          <span className="truncate">
            {tm("chartSource", { source: live.source, fxSource: live.fxSource })}
          </span>
          <span className="font-sans">{tm("tickEvery")}</span>
        </div>
      )}
    </Panel>
  );
}

function Ohlc({ k, v }: { k: string; v: string | null }) {
  return (
    <span>
      {k} <b className="font-medium text-foreground">{v ? money(v) : "—"}</b>
    </span>
  );
}

function Crosshair({
  left,
  top,
  stroke,
  when,
  value,
}: {
  left: number;
  top: number;
  stroke: string;
  when: string;
  value: string;
}) {
  const flip = left > 62;
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 border-s border-dashed border-white/25"
        style={{ left: `${left}%` }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -ms-[5px] -mt-[5px] size-[10px] rounded-full border-2 bg-background"
        style={{ left: `${left}%`, top: `${top}%`, borderColor: stroke }}
      />
      <div
        className={cn(
          "tnum pointer-events-none absolute top-3 rounded-[0.5rem] border border-input bg-raised px-2.5 py-1.5 text-[0.75rem] whitespace-nowrap shadow-(--shadow-pop)",
          flip ? "-translate-x-[calc(100%+12px)]" : "translate-x-3",
        )}
        style={{ left: `${left}%` }}
      >
        <span className="text-subtle">{when}</span>
        <span className="ms-2.5 font-semibold">{value}</span>
      </div>
    </>
  );
}

/**
 * Gridline values a human would have chosen: 1/2/2.5/5 × a power of ten,
 * chosen in BIRR so the axis lands on 20,700 / 20,750 rather than on round
 * numbers of cents nobody reads.
 */
function niceTicks(loCents: number, hiCents: number, target = 5): number[] {
  const lo = loCents / 100;
  const hi = hiCents / 100;
  const raw = (hi - lo) / Math.max(1, target - 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 0.001; v += step) {
    out.push(Math.round(v * 100));
  }
  return out;
}

/** Evenly spaced sample indices for the time axis, endpoints included. */
function pickIndices(length: number, count: number): number[] {
  if (length <= count) return Array.from({ length }, (_, i) => i);
  return Array.from({ length: count }, (_, i) => Math.round((i / (count - 1)) * (length - 1)));
}
