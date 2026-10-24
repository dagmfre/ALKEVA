"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { MetalAsset } from "@alkeva/shared";

import { PriceChart } from "@/components/market/price-chart";
import { useAssetPrice } from "@/components/market/price-provider";
import { MetalMass } from "@/components/three/metal-mass";
import { Coin, DeltaChip, Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { fxRate, money, usdPerOz } from "@/lib/format";

/**
 * The landing page's live surfaces. `/prices/*` is public, so a signed-out
 * visitor sees the same feed the terminal quotes — the page carries the real
 * market, not a mock. If the feed is down these read as pending, never as
 * invented numbers. All of this renders inside the page's PriceProvider.
 */

const GRAMS_PER_TROY_OUNCE = 31.1034768;

/** Hero object: both metals as real 3D bars, the live gold price beside them. */
export function LandingHeroVisual() {
  const t = useTranslations("public");
  const tc = useTranslations("common");
  const gold = useAssetPrice("XAU");

  return (
    <div className="relative isolate h-[22rem] lg:h-[34rem]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 [background:radial-gradient(55%_45%_at_45%_50%,oklch(0.797_0.09_78.1/0.18),transparent_70%)]"
      />
      <MetalMass asset="XAU" gramsMg="12000" className="absolute inset-x-[4%] top-[8%] w-[78%]" />
      <MetalMass asset="XPT" gramsMg="5000" className="absolute end-0 bottom-[2%] w-[48%]" />

      <div className="absolute end-[2%] top-[10%] flex flex-col gap-1 rounded-[0.875rem] border border-gold-400/25 bg-card/90 px-4 py-3 shadow-(--shadow-pop)">
        <span className="flex items-center gap-2 text-[0.75rem] font-semibold text-muted-foreground">
          <span aria-hidden="true" className="live-dot size-[7px] rounded-full bg-gain" />
          {t("liveNow")} · {tc("gold")}
        </span>
        {gold ? (
          <>
            <span className="tnum text-[1.375rem] font-semibold">
              {money(gold.etbCentsPerGram)}{" "}
              <span className="text-[0.75rem] font-medium text-muted-foreground">
                {tc("birr")}/{tc("g")}
              </span>
            </span>
            <DeltaChip pctMilli={gold.change24hPctMilli} className="self-start bg-transparent px-0" />
          </>
        ) : (
          <Skeleton className="h-10 w-36" />
        )}
      </div>
    </div>
  );
}

/** The market section: the real chart beside the arithmetic that makes the price. */
export function LandingMarket() {
  const [asset, setAsset] = useState<MetalAsset>("XAU");
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_23rem]">
      <PriceChart asset={asset} onAssetChange={setAsset} className="hidden min-h-[26rem] lg:flex" />
      <PriceChart asset={asset} onAssetChange={setAsset} compact className="lg:hidden" />
      <PriceFormula asset={asset} />
    </div>
  );
}

/**
 * World spot in dollars per troy ounce, divided into grams, times the birr
 * rate: the whole derivation of the number a customer pays, with the live
 * figures filled in. The result is the feed's own birr price, not a re-sum.
 */
function PriceFormula({ asset }: { asset: MetalAsset }) {
  const t = useTranslations("public");
  const tc = useTranslations("common");
  const p = useAssetPrice(asset);
  const usdPerGram = p ? Number(BigInt(p.usdPerOzMicro)) / 1_000_000 / GRAMS_PER_TROY_OUNCE : null;

  const rows = [
    { k: t("formulaSpot"), v: p ? `${usdPerOz(p.usdPerOzMicro)} USD/oz` : null },
    { k: t("formulaOunce"), v: usdPerGram !== null ? `${usdPerGram.toFixed(2)} USD/g` : null },
    { k: t("formulaFx", { source: p?.fxSource ?? "—" }), v: p ? `× ${fxRate(p.fxRateMicro)}` : null },
  ];

  return (
    <Panel aria-label={t("formulaTitle")}>
      <PanelHeader title={t("formulaTitle")} dot={asset === "XAU" ? "gold" : "platinum"} />
      <div className="flex flex-1 flex-col gap-3 px-[1.125rem] pb-[1.125rem]">
        <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">{t("marketBody")}</p>
        <div className="flex flex-col overflow-hidden rounded-[0.75rem] border border-border">
          {rows.map((r) => (
            <div key={r.k} className="flex items-baseline justify-between gap-3 border-b border-border bg-background px-3.5 py-3 text-[0.8125rem]">
              <span className="text-muted-foreground">{r.k}</span>
              {r.v ? <span className="tnum font-medium">{r.v}</span> : <Skeleton className="h-4 w-20" />}
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 bg-gold-400/8 px-3.5 py-3.5">
            <span className="flex items-center gap-2 text-[0.875rem] font-bold">
              <Coin metal={asset} size="sm" />
              {t("formulaResult")}
            </span>
            {p ? (
              <span className="tnum text-[1.125rem] font-semibold text-gold-300">
                {money(p.etbCentsPerGram)} <span className="text-[0.75rem] text-subtle">{tc("birr")}</span>
              </span>
            ) : (
              <Skeleton className="h-5 w-24" />
            )}
          </div>
        </div>
        <p className="mt-auto text-[0.75rem] leading-relaxed text-subtle">{t("marketSource")}</p>
      </div>
    </Panel>
  );
}
