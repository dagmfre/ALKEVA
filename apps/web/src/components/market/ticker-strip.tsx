"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { MetalAsset } from "@alkeva/shared";

import { useTickFlash } from "@/components/market/market-header";
import { useAssetPrice } from "@/components/market/price-provider";
import { Coin, DeltaChip } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { fxRate, money, usdPerOz } from "@/lib/format";
import { usePriceSeries } from "@/lib/use-price-series";
import { cn } from "@/lib/utils";

/**
 * The FBS-style ticker: both metals in birr with their 24h move and a
 * sparkline, then the world spot and the birr rate that produce them.
 */
export function TickerStrip({
  selected,
  onSelect,
  className,
}: {
  /** When given, the metal cells become buttons that pick a chart. */
  selected?: MetalAsset;
  onSelect?: (a: MetalAsset) => void;
  className?: string;
}) {
  const t = useTranslations("market");
  const xau = useAssetPrice("XAU");
  const xpt = useAssetPrice("XPT");

  return (
    <section
      data-panel=""
      aria-label={t("tickerLabel")}
      className={cn(
        "flex overflow-x-auto rounded-lg border border-border bg-card [scrollbar-width:none] xl:grid xl:grid-cols-[1.25fr_1.25fr_1fr_1fr_1fr] xl:overflow-hidden",
        className,
      )}
    >
      <MetalTick asset="XAU" active={selected === "XAU"} onSelect={onSelect} />
      <MetalTick asset="XPT" active={selected === "XPT"} onSelect={onSelect} />
      <FactTick label={t("worldGold")} value={xau ? usdPerOz(xau.usdPerOzMicro) : null} />
      <FactTick label={t("worldPlatinum")} value={xpt ? usdPerOz(xpt.usdPerOzMicro) : null} />
      <FactTick
        label={t("fxSource", { source: xau?.fxSource ?? "—" })}
        value={xau ? fxRate(xau.fxRateMicro) : null}
      />
    </section>
  );
}

function MetalTick({
  asset,
  active,
  onSelect,
}: {
  asset: MetalAsset;
  active: boolean;
  onSelect?: (a: MetalAsset) => void;
}) {
  const tc = useTranslations("common");
  const price = useAssetPrice(asset);
  const flash = useTickFlash(price?.etbCentsPerGram ?? null);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(asset)}
      disabled={!onSelect}
      aria-pressed={onSelect ? active : undefined}
      className={cn(
        "relative flex min-w-[15.5rem] flex-none flex-col justify-center gap-1.5 border-e border-border px-[1.125rem] py-3.5 text-start outline-none transition-colors xl:min-w-0",
        onSelect && "hover:bg-white/[0.02] focus-visible:bg-white/[0.03]",
        active && "bg-white/[0.025]",
      )}
    >
      {active && (
        <span aria-hidden="true" className="absolute inset-x-[1.125rem] top-0 h-0.5 rounded-b-full bg-gold-400" />
      )}
      <span className="flex items-center gap-2 text-[0.84375rem] font-bold">
        <Coin metal={asset} size="sm" className="size-5" />
        {asset === "XAU" ? tc("gold") : tc("platinum")}
        <span className="tnum text-[0.75rem] font-medium text-subtle">{asset} / ETB</span>
      </span>
      <span className="flex items-center justify-between gap-3">
        <span className="flex items-baseline gap-2">
          {price ? (
            <span key={price.etbCentsPerGram} className={cn("tnum text-[1.3125rem] font-semibold", flash)}>
              {money(price.etbCentsPerGram)}
            </span>
          ) : (
            <Skeleton className="h-6 w-28" />
          )}
          <DeltaChip pctMilli={price?.change24hPctMilli} className="bg-transparent px-0" />
        </span>
        <Sparkline asset={asset} up={!price?.change24hPctMilli || Number(price.change24hPctMilli) >= 0} />
      </span>
    </button>
  );
}

function FactTick({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex min-w-[11rem] flex-none flex-col justify-center gap-1.5 border-e border-border px-[1.125rem] py-3.5 last:border-e-0 xl:min-w-0">
      <span className="truncate text-[0.8125rem] text-muted-foreground">{label}</span>
      {value ? (
        <span className="tnum text-[1.1875rem] font-semibold">{value}</span>
      ) : (
        <Skeleton className="h-6 w-24" />
      )}
    </div>
  );
}

/** 24h of 5-minute buckets as a 96×30 line, tinted by the day's direction. */
function Sparkline({ asset, up }: { asset: MetalAsset; up: boolean }) {
  const { points } = usePriceSeries(asset, "24h");
  const d = useMemo(() => {
    if (points.length < 2) return null;
    const v = points.map((p) => Number(BigInt(p.etbCentsPerGram)));
    // Same honesty floor as the big chart: a 1-birr wobble must not draw as
    // a crash. The line spans at least 0.4% of the price.
    const lo0 = Math.min(...v);
    const hi0 = Math.max(...v);
    const floor = ((lo0 + hi0) / 2) * 0.004;
    const pad = Math.max(0, floor - (hi0 - lo0)) / 2;
    const min = lo0 - pad;
    const span = hi0 - lo0 + pad * 2 || 1;
    return v
      .map((y, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * 96).toFixed(1)} ${(27 - ((y - min) / span) * 24).toFixed(1)}`)
      .join(" ");
  }, [points]);
  if (!d) return <span className="h-[30px] w-24 flex-none" />;
  return (
    <svg width="96" height="30" viewBox="0 0 96 30" aria-hidden="true" className="flex-none">
      <path
        d={d}
        fill="none"
        stroke={up ? "var(--gain)" : "var(--loss)"}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
