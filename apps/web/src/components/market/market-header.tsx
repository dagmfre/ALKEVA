"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { MetalAsset } from "@alkeva/shared";

import { useAssetPrice } from "@/components/market/price-provider";
import { Badge } from "@/components/ui/badge";
import { Coin, DeltaChip, Stat, StatStrip } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { eatTimeSec, fxRate, money, usdPerOz } from "@/lib/format";
import { usePriceSeries } from "@/lib/use-price-series";
import { cn } from "@/lib/utils";

/**
 * The market head (RabbitX's pair header, translated): a Gold / Platinum
 * selector, the live birr-per-gram price with its canonical 24h change, then
 * the facts behind that price in one strip — world spot, the birr rate,
 * the 24h range and the tick it came from.
 *
 * One row on a desk; on a phone the selector and price stack and the facts
 * scroll sideways. It never becomes a column of lonely figures.
 */
export function MarketHeader({
  asset,
  onAssetChange,
}: {
  asset: MetalAsset;
  onAssetChange: (a: MetalAsset) => void;
}) {
  const tc = useTranslations("common");
  const tm = useTranslations("market");
  const price = useAssetPrice(asset);
  const day = usePriceSeries(asset, "24h");
  const flash = useTickFlash(price?.etbCentsPerGram ?? null);

  // The 24h range from stored 5-minute buckets, widened to include the live
  // tick so the price shown can never sit outside its own range.
  const live = price ? BigInt(price.etbCentsPerGram) : null;
  const hi = day.high ? maxB(BigInt(day.high), live) : live;
  const lo = day.low ? minB(BigInt(day.low), live) : live;

  return (
    <section
      data-panel=""
      aria-label={tm("selector")}
      className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card lg:flex-row lg:items-stretch"
    >
      <div className="flex flex-none items-center p-2.5 lg:ps-2.5 lg:pe-1">
        <Segmented
          value={asset}
          onValueChange={onAssetChange}
          size="lg"
          stretch
          className="bg-background lg:w-auto"
          aria-label={tm("selector")}
          options={(["XAU", "XPT"] as const).map((a) => ({
            value: a,
            label: (
              <span className="flex items-center gap-2 pe-1">
                <Coin metal={a} />
                {a === "XAU" ? tc("gold") : tc("platinum")}
              </span>
            ),
          }))}
        />
      </div>

      <div className="flex flex-none flex-col justify-center gap-1 px-4 pb-3 lg:border-s lg:border-border lg:px-6 lg:py-2.5">
        <div className="flex items-baseline gap-2.5">
          {price ? (
            <span
              key={price.etbCentsPerGram}
              className={cn(
                "tnum text-[1.875rem] leading-none font-semibold tracking-[-0.02em] lg:text-[1.625rem]",
                flash,
              )}
            >
              {money(price.etbCentsPerGram)}
            </span>
          ) : (
            <Skeleton className="h-7 w-40" />
          )}
          <DeltaChip pctMilli={price?.change24hPctMilli} />
          {price?.stale && <Badge variant="muted">{tc("delayed")}</Badge>}
        </div>
        <span className="data-label">{tm("perGram24h")}</span>
      </div>

      <StatStrip className="border-t border-border lg:min-w-0 lg:flex-1 lg:border-t-0 lg:border-s">
        <Stat surface="strip" label={tm("worldSpot")} value={price ? usdPerOz(price.usdPerOzMicro) : null} />
        <Stat surface="strip" label={tm("fx")} value={price ? fxRate(price.fxRateMicro) : null} />
        <Stat surface="strip" label={tm("high24h")} value={hi !== null ? money(hi) : null} />
        <Stat surface="strip" label={tm("low24h")} value={lo !== null ? money(lo) : null} />
        <Stat
          surface="strip"
          label={tm("lastTick", { source: price?.source ?? "—" })}
          value={price ? eatTimeSec(price.at) : null}
        />
        <div className="ms-auto hidden flex-none items-center !border-s-0 pe-4 2xl:flex">
          <Badge variant="gold" dot>
            {tm("heldBadge")}
          </Badge>
        </div>
      </StatStrip>
    </section>
  );
}

/**
 * A price that just changed gets a brief gain/loss tint (`.tick-up` /
 * `.tick-down`); key the element by the value so the animation restarts.
 */
export function useTickFlash(value: string | null): string {
  const prev = useRef<string | null>(null);
  const [cls, setCls] = useState("");
  useEffect(() => {
    if (value === null) return;
    const before = prev.current;
    prev.current = value;
    if (before === null || before === value) return;
    setCls(BigInt(value) > BigInt(before) ? "tick-up" : "tick-down");
  }, [value]);
  return cls;
}

function maxB(a: bigint, b: bigint | null): bigint {
  return b !== null && b > a ? b : a;
}
function minB(a: bigint, b: bigint | null): bigint {
  return b !== null && b < a ? b : a;
}

export { Coin };
