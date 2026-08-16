"use client";

import { useTranslations } from "next-intl";
import type { MetalAsset, PriceLatestResponse } from "@alkeva/shared";

import { MetalMass } from "@/components/three/metal-mass";
import { PriceChart } from "@/components/market/price-chart";
import { PriceProvider } from "@/components/market/price-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { money, pctMilli, timeOfDay } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/**
 * The landing page's live surfaces.
 *
 * `/prices/latest` and `/prices/history` are public, so a signed-out visitor
 * sees the same feed the trading screen quotes — the first trust signal is
 * that the marketing page carries the real market rather than a mock. Nothing
 * here is illustrative: if the feed is down, these read as pending, not as
 * invented numbers.
 */

/** Hero object: the metal itself, with the live gold price pinned beside it. */
export function LandingHeroVisual() {
  const t = useTranslations("public");
  const tc = useTranslations("common");
  const { data } = useResource<PriceLatestResponse>("/prices/latest?asset=XAU", {
    intervalMs: 30_000,
  });

  return (
    <div className="relative isolate flex min-h-[21rem] items-center justify-center lg:min-h-[30rem]">
      {/* A single warm light behind the bar — the room, not a glass card. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-70 [background:radial-gradient(60%_50%_at_50%_45%,oklch(0.868_0.175_96.5/0.16),transparent_70%)]"
      />
      <MetalMass asset="XAU" gramsMg="10000" className="w-full max-w-[34rem]" />

      <div className="absolute end-0 top-2 rounded-lg border border-border bg-card/90 px-4 py-3 backdrop-blur-[2px] lg:end-4">
        <span className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
          <span aria-hidden="true" className="glow-gold size-2 rounded-full bg-gold-500" />
          {t("liveNow")}
        </span>
        {data ? (
          <>
            <span className="tnum mt-1 block text-[1.375rem] font-semibold text-gold-400">
              {money(data.etbCentsPerGram)}
            </span>
            <span className="text-[0.8125rem] text-muted-foreground">
              {tc("birr")} / {tc("g")} · {tc("gold")}
            </span>
          </>
        ) : (
          <Skeleton className="mt-1.5 h-7 w-32" />
        )}
      </div>
    </div>
  );
}

/**
 * The market section: both metals, and the real 24-hour curve.
 *
 * The chart reads the shared price store for its current-price tag, so the
 * landing page mounts the same provider the app does — `/prices/stream` is
 * public, and the visitor gets the identical pushed tick.
 */
export function LandingMarket() {
  const t = useTranslations("public");

  return (
    <PriceProvider>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_20rem] lg:gap-5">
        <PriceChart asset="XAU" className="h-[22rem]" chartClassName="h-auto" />
        <div className="flex flex-col gap-4">
          <PriceCell asset="XAU" />
          <PriceCell asset="XPT" />
          <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
            {t("marketSource")}
          </p>
        </div>
      </div>
    </PriceProvider>
  );
}

/** Compact live quote — also used above the fold. */
export function PriceCell({ asset, className }: { asset: MetalAsset; className?: string }) {
  const tc = useTranslations("common");
  const { data } = useResource<PriceLatestResponse>(`/prices/latest?asset=${asset}`, {
    intervalMs: 30_000,
  });
  const milli = data?.change24hPctMilli ?? null;
  const pct = pctMilli(milli);
  const up = milli !== null && BigInt(milli) > 0n;
  const down = milli !== null && BigInt(milli) < 0n;
  const isGold = asset === "XAU";

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3.5",
        className,
      )}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5 text-[0.9375rem]">
          <span
            aria-hidden="true"
            className={cn("size-2.5 rounded-full", isGold ? "bg-gold-500" : "bg-platinum-400")}
          />
          {isGold ? tc("gold") : tc("platinum")}
          <span className="text-muted-foreground">· {tc("perGram")}</span>
        </span>
        {data && (
          <span className="font-latin text-[0.75rem] text-subtle">
            {timeOfDay(data.at, "en")}
          </span>
        )}
      </span>
      {data ? (
        <span className="flex items-baseline gap-2.5">
          <span
            className={cn(
              "tnum text-[1.5rem] font-semibold",
              isGold ? "text-gold-400" : "text-platinum-400",
            )}
          >
            {money(data.etbCentsPerGram)}
          </span>
          {pct && (
            <span
              className={cn(
                "tnum text-[0.9375rem] font-semibold",
                up ? "text-gain" : down ? "text-loss" : "text-muted-foreground",
              )}
            >
              {up ? "↑" : down ? "↓" : "·"} {up ? "+" : down ? "−" : ""}
              {pct}%
            </span>
          )}
        </span>
      ) : (
        <Skeleton className="h-7 w-32" />
      )}
    </div>
  );
}
