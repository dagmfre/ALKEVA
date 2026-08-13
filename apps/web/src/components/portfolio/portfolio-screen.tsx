"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type {
  HoldingDto,
  MetalAsset,
  PortfolioResponse,
  TierDto,
  TreasurySummaryResponse,
} from "@alkeva/shared";

import { useAssetPrice } from "@/components/market/price-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TierMark } from "@/components/shell/nav-items";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";
import { revalueHolding } from "@/lib/live-value";
import {
  ARROW,
  SIGN,
  coverage,
  deltaClass,
  direction,
  grams,
  money,
  pctMilli,
  signedMoney,
  usd,
} from "@/lib/format";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/**
 * What you own, what it cost, and what backs it.
 *
 * The composition answers those three in that order on both screen sizes: the
 * mark-to-market total (with the first-loss sentence beneath it), the holdings
 * with their real cost basis replayed from settled orders, and the vault
 * figures that make the holding more than a database row.
 */
export function PortfolioScreen() {
  const t = useTranslations("portfolio");
  const tc = useTranslations("common");
  const th = useTranslations("home");
  const { open, revision } = useTradeSheet();
  const isDesktop = useIsDesktop();
  const router = useRouter();
  const { data, loading } = useResource<PortfolioResponse>("/portfolio", { revision });
  const xau = useAssetPrice("XAU");
  const xpt = useAssetPrice("XPT");

  const trade = (asset: MetalAsset, side: "buy" | "sell") =>
    isDesktop ? router.push(`/trade?asset=${asset}&side=${side}`) : open(asset, side);

  if (loading || !data) return <PortfolioSkeleton />;

  // Re-mark at the shared live tick: Portfolio ≡ Home total ≡ ticker at every
  // instant. Cost basis and methodology stay the server's.
  const held = data.holdings
    .filter((h) => BigInt(h.gramsMg) > 0n)
    .map((h) => revalueHolding(h, h.asset === "XAU" ? xau : xpt));
  const totalMetal = held.reduce((sum, h) => sum + BigInt(h.valueCents), 0n);
  const totalCost = BigInt(data.totalCostBasisCents);
  const totalGainLossCents = (totalMetal - totalCost).toString();
  const totalGainLossPctMilli =
    totalCost > 0n ? (((totalMetal - totalCost) * 100_000n) / totalCost).toString() : null;
  const dir = direction(totalGainLossCents);
  const pct = pctMilli(totalGainLossPctMilli);

  if (held.length === 0) {
    return (
      <div className="mx-auto max-w-[36rem] rounded-lg border border-border bg-card p-5">
        <h2 className="text-[1.125rem] font-semibold">{t("emptyTitle")}</h2>
        <p className="mb-3.5 mt-1 text-[0.9375rem] text-muted-foreground">{t("emptyBody")}</p>
        <Button size="cta" onClick={() => trade("XAU", "buy")}>
          {th("buyGoldCta")}
        </Button>
      </div>
    );
  }

  const share = (h: HoldingDto) =>
    totalMetal > 0n ? (Number(BigInt(h.valueCents)) / Number(totalMetal)) * 100 : 0;
  const largest = held.reduce((a, b) => (BigInt(a.valueCents) >= BigInt(b.valueCents) ? a : b));

  return (
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12 lg:gap-5">
      <section className="flex flex-col rounded-lg border border-border bg-card p-4 lg:col-span-8 lg:p-5">
        <span className="text-[0.9375rem] leading-relaxed text-muted-foreground">
          {t("totalMetalValue")}
        </span>
        <div className="mt-1.5 flex flex-wrap items-end justify-between gap-3">
          <span className="flex items-baseline gap-2">
            <span className="tnum text-[2.125rem] font-semibold leading-none tracking-[-0.01em] lg:text-[2.5rem]">
              {money(totalMetal)}
            </span>
            <span className="text-[1.0625rem] text-muted-foreground">{tc("birr")}</span>
          </span>
          {/*
            A user who buys and opens this immediately is down by exactly the
            commission they paid. That is correct and honest, and it is the
            first thing a new user sees — so it is stated calmly, one step down
            in weight from the holding itself, with the reason directly beneath.
          */}
          <span className={cn("flex flex-col items-end gap-0.5", deltaClass(dir))}>
            <span className="tnum text-[1.0625rem] font-semibold">
              {ARROW[dir]} {SIGN[dir]}
              {signedMoney(totalGainLossCents)}
            </span>
            {pct && (
              <span className="tnum text-[0.9375rem]">
                {SIGN[dir]}
                {pct}%
              </span>
            )}
          </span>
        </div>

        <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-well" aria-hidden="true">
          {held.map((h) => (
            <span
              key={h.asset}
              className={h.asset === "XAU" ? "bg-gold-500" : "bg-platinum-400"}
              style={{ width: `${share(h)}%` }}
            />
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1.5">
          {held.map((h) => (
            <span
              key={h.asset}
              className="flex items-center gap-2 text-[0.9375rem] text-muted-foreground"
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  h.asset === "XAU" ? "bg-gold-500" : "bg-platinum-400",
                )}
              />
              {h.asset === "XAU" ? tc("gold") : tc("platinum")}{" "}
              <span className="tnum font-semibold text-foreground">{share(h).toFixed(1)}%</span>
            </span>
          ))}
        </div>

        {dir === "down" && (
          <p className="mt-4 border-t border-border pt-3.5 text-[0.9375rem] leading-relaxed text-muted-foreground">
            {t("firstLoss")}
          </p>
        )}
      </section>

      <TierCard tier={data.tier} className="lg:col-span-4" />

      <section className="rounded-lg border border-border bg-card px-4 pb-3 lg:col-span-8 lg:px-5">
        <div className="flex items-center justify-between py-3.5">
          <h2 className="text-[1.125rem] font-semibold">{t("holdingsTitle")}</h2>
          <span className="text-[0.9375rem] text-subtle">{t("costFromLedger")}</span>
        </div>
        {held.map((h) => (
          <HoldingRow key={h.asset} holding={h} />
        ))}
      </section>

      <div className="flex flex-col gap-3.5 lg:col-span-4 lg:gap-4">
        <div className="rounded-lg border border-border bg-card p-4 lg:p-5">
          <span className="text-[0.9375rem] leading-relaxed text-muted-foreground">
            {t("cashLabel")}
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="tnum text-[1.625rem] font-semibold">{money(data.etbCents)}</span>
            <span className="text-[0.9375rem] text-muted-foreground">{tc("birr")}</span>
          </div>
        </div>
        <Button size="cta" onClick={() => trade(largest.asset, "buy")}>
          {t("buyMore", {
            metal: largest.asset === "XAU" ? tc("gold") : tc("platinum"),
          })}
        </Button>
        <Button variant="outline" size="cta" onClick={() => trade(largest.asset, "sell")}>
          {t("sellCta")}
        </Button>
      </div>

      <VaultStrip asset={largest.asset} className="lg:col-span-12" />
    </div>
  );
}

function HoldingRow({ holding }: { holding: HoldingDto }) {
  const t = useTranslations("portfolio");
  const tc = useTranslations("common");
  const isGold = holding.asset === "XAU";
  const dir = direction(holding.gainLossCents);
  const pct = pctMilli(holding.gainLossPctMilli);

  return (
    <div className="grid grid-cols-2 items-center gap-4 border-t border-border py-4 lg:grid-cols-[1fr_0.8fr_1.15fr_1.15fr_1.6fr]">
      <span className="flex items-center gap-2.5 text-[1.0625rem] font-semibold">
        <span
          className={cn("size-2.5 rounded-full", isGold ? "bg-gold-500" : "bg-platinum-400")}
        />
        {isGold ? tc("gold") : tc("platinum")}
      </span>
      <Cell label={t("gramsLabel")}>{grams(holding.gramsMg)}</Cell>
      <Cell label={t("currentValue")} accent={isGold ? "gold" : "platinum"}>
        {money(holding.valueCents)}
      </Cell>
      <Cell label={t("costBasis")} muted>
        {money(holding.costBasisCents)}
      </Cell>
      <Cell label={t("gainLoss")} align="end" className={deltaClass(dir)}>
        {ARROW[dir]} {SIGN[dir]}
        {signedMoney(holding.gainLossCents)}
        {pct && (
          <span className="ms-1.5 text-[0.9375rem] font-medium">
            {SIGN[dir]}
            {pct}%
          </span>
        )}
      </Cell>
    </div>
  );
}

function Cell({
  label,
  children,
  accent,
  muted,
  align,
  className,
}: {
  label: string;
  children: React.ReactNode;
  accent?: "gold" | "platinum";
  muted?: boolean;
  align?: "end";
  className?: string;
}) {
  return (
    <span className={cn("flex flex-col gap-0.5", align === "end" && "items-end text-end")}>
      <span className="text-[0.9375rem] leading-snug text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tnum whitespace-nowrap text-[1.0625rem] font-semibold",
          muted && "font-medium",
          accent === "gold" && "text-gold-400",
          accent === "platinum" && "text-platinum-400",
          className,
        )}
      >
        {children}
      </span>
    </span>
  );
}

/**
 * Gemstone tier.
 *
 * The lowest band is named "Gold", which is also an asset and the brand
 * colour — so tier identity is carried by a faceted mark and a label, never by
 * a colour fill that would compete with the metals (`design/design.md` §5).
 */
function TierCard({ tier, className }: { tier: TierDto; className?: string }) {
  const t = useTranslations("tier");
  if (!tier.name) return null;

  const progress = tier.progressPctMilli ? Number(tier.progressPctMilli) / 1000 : null;
  const localizedName = t.has(`names.${tier.name}` as never)
    ? t(`names.${tier.name}` as never)
    : tier.name;
  const localizedNext =
    tier.nextName && t.has(`names.${tier.nextName}` as never)
      ? t(`names.${tier.nextName}` as never)
      : tier.nextName;

  return (
    <section
      className={cn("flex flex-col rounded-lg border border-border bg-card p-4 lg:p-5", className)}
    >
      <div className="flex items-center gap-3">
        <TierMark size={34} />
        <span className="flex flex-col">
          <span className="text-[1.125rem] font-semibold leading-snug">{localizedName}</span>
          <span className="text-[0.9375rem] leading-snug text-muted-foreground">
            {t("currentLevel")}
          </span>
        </span>
      </div>

      {progress !== null && localizedNext && (
        <>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-[0.9375rem] text-muted-foreground">
              {t("towards", { name: localizedNext })}
            </span>
            <span className="tnum text-[0.9375rem] font-semibold">{progress.toFixed(0)}%</span>
          </div>
          <div className="well mt-2 h-2 overflow-hidden rounded-full">
            <span
              className="block h-full rounded-full bg-platinum-500 transition-[width] duration-200"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[0.9375rem] text-subtle">
            <span className="tnum">${usd(tier.holdingUsdCents)}</span>
            {tier.nextThresholdUsd !== null && (
              <span className="tnum">${tier.nextThresholdUsd.toLocaleString("en-US")}</span>
            )}
          </div>
        </>
      )}

      <p className="mt-3.5 text-[0.9375rem] leading-relaxed text-muted-foreground">
        {tier.bandMaxUsd === null ? t("topUnlock") : t("unlock")}
      </p>

      {localizedNext && tier.nextThresholdUsd !== null && (
        <div className="mt-auto flex items-center justify-between border-t border-border pt-3.5">
          <span className="text-[0.9375rem] text-muted-foreground">{t("nextLevel")}</span>
          <span className="flex items-center gap-2.5 text-base font-semibold">
            <span className="size-2 rounded-full bg-platinum-400" />
            {localizedNext}
            <span className="tnum text-[0.9375rem] font-normal text-muted-foreground">
              ${tier.nextThresholdUsd.toLocaleString("en-US")}+
            </span>
          </span>
        </div>
      )}
    </section>
  );
}

/** The same vault proof as the dashboard, laid out as a wide strip. */
function VaultStrip({ asset, className }: { asset: MetalAsset; className?: string }) {
  const t = useTranslations("home");
  const { data } = useResource<TreasurySummaryResponse>("/treasury/summary", {
    intervalMs: 60_000,
  });
  const reserve = data?.reserves.find((r) => r.asset === asset) ?? null;

  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-lg border border-border bg-card p-4 lg:flex-row lg:items-center lg:gap-6 lg:p-5",
        className,
      )}
    >
      <span className="flex max-w-[27rem] flex-col gap-1">
        <span className="text-[1.125rem] font-semibold leading-normal">{t("vaultTitle")}</span>
        <span className="text-[0.9375rem] leading-relaxed text-muted-foreground">
          {t("vaultBody")}
        </span>
      </span>
      <span className="flex flex-wrap gap-2.5 lg:ms-auto">
        <Figure label={t("inVault")} value={reserve ? grams(reserve.physicalMg) : null} unit={t("gramUnit")} />
        <Figure label={t("issued")} value={reserve ? grams(reserve.issuedMg) : null} unit={t("gramUnit")} />
        <Figure
          label={t("coverage")}
          value={reserve ? (coverage(reserve.reserveRatioPctMilli) ?? "∞") : null}
          gold
        />
      </span>
    </section>
  );
}

function Figure({
  label,
  value,
  unit,
  gold,
}: {
  label: string;
  value: string | null;
  unit?: string;
  gold?: boolean;
}) {
  return (
    <span className="well flex min-w-[10rem] flex-1 flex-col gap-0.5 rounded-md px-4 py-3">
      <span className="text-[0.9375rem] leading-snug text-muted-foreground">{label}</span>
      {value === null ? (
        <Skeleton className="mt-1 h-5 w-20" />
      ) : (
        <span className={cn("tnum text-[1.125rem] font-semibold", gold && "text-gold-400")}>
          {value}
          {unit && (
            <span className="ms-1 font-sans text-[0.9375rem] font-normal text-muted-foreground">
              {unit}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function PortfolioSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12 lg:gap-5">
      <Skeleton className="h-44 rounded-lg lg:col-span-8" />
      <Skeleton className="h-44 rounded-lg lg:col-span-4" />
      <Skeleton className="h-40 rounded-lg lg:col-span-8" />
      <Skeleton className="h-40 rounded-lg lg:col-span-4" />
    </div>
  );
}
