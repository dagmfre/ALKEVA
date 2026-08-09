"use client";

import { useTranslations } from "next-intl";
import type { HoldingDto, PortfolioResponse, TierDto } from "@alkeva/shared";

import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";
import {
  ARROW,
  SIGN,
  deltaClass,
  direction,
  grams,
  money,
  pctMilli,
  signedMoney,
  usd,
} from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

export function PortfolioScreen() {
  const t = useTranslations("portfolio");
  const tc = useTranslations("common");
  const { open, revision } = useTradeSheet();
  const { data, loading } = useResource<PortfolioResponse>("/portfolio", { revision });

  if (loading || !data) return <PortfolioSkeleton />;

  const held = data.holdings.filter((h) => BigInt(h.gramsMg) > 0n);
  const dir = direction(data.totalGainLossCents);
  const pct = pctMilli(data.totalGainLossPctMilli);

  if (held.length === 0) {
    return (
      <>
        <h1 className="mb-3.5 mt-1 text-2xl font-semibold">{t("title")}</h1>
        <Card className="p-5">
          <CardTitle className="mb-1">{t("emptyTitle")}</CardTitle>
          <p className="mb-3.5 text-[0.9375rem] text-muted-foreground">{t("emptyBody")}</p>
          <Button size="cta" onClick={() => open("XAU", "buy")}>
            {tc("gold")}
          </Button>
        </Card>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-3.5 mt-1 text-2xl font-semibold">{t("title")}</h1>

      <Card className="mb-3.5 p-5">
        <div className="text-[0.9375rem] text-muted-foreground">{t("totalValue")}</div>
        <div className="tnum my-0.5 text-[2.25rem] font-semibold leading-[1.1] tracking-[-0.01em]">
          {money(data.totalValueCents)}
          <span className="ms-1.5 font-sans text-base font-medium tracking-normal text-muted-foreground">
            {tc("birr")}
          </span>
        </div>
        {/*
          A user who buys and opens this immediately is down by exactly the
          commission they paid. That is correct and honest, and it is the first
          thing a new user sees — so it is stated calmly, one step down in
          weight from the holding itself, with the reason directly beneath.
        */}
        <div className={cn("tnum text-[0.9375rem] font-medium", deltaClass(dir))}>
          {ARROW[dir]} {SIGN[dir]}
          {signedMoney(data.totalGainLossCents)}
          {pct && ` · ${SIGN[dir]}${pct}%`}
        </div>
        {dir === "down" && (
          <p className="mt-2.5 text-[0.9375rem] text-muted-foreground">{t("firstLoss")}</p>
        )}
      </Card>

      {held.map((h) => (
        <HoldingCard key={h.asset} holding={h} />
      ))}

      {BigInt(data.etbCents) > 0n && (
        <Card className="mb-3.5 flex items-baseline justify-between p-4">
          <span className="text-base font-medium">{t("cashLabel")}</span>
          <span className="tnum text-[1.0625rem] font-semibold">{money(data.etbCents)}</span>
        </Card>
      )}

      <TierCard tier={data.tier} />
    </>
  );
}

function HoldingCard({ holding }: { holding: HoldingDto }) {
  const t = useTranslations("portfolio");
  const tc = useTranslations("common");
  const isGold = holding.asset === "XAU";
  const dir = direction(holding.gainLossCents);

  return (
    <Card className="mb-2.5 p-4">
      <div className="flex items-baseline justify-between border-b border-border pb-2.5">
        <span className="flex items-center gap-2 text-base font-medium">
          <span className={cn("size-2 rounded-full", isGold ? "bg-gold-500" : "bg-platinum-400")} />
          {isGold ? tc("gold") : tc("platinum")}
        </span>
        <span className="tnum text-[1.0625rem] font-semibold">
          {grams(holding.gramsMg)}
          <span className="ms-1 font-sans text-sm font-normal text-muted-foreground">{tc("g")}</span>
        </span>
      </div>
      <Line label={t("currentValue")}>
        <span className={cn("font-semibold", isGold ? "text-gold-400" : "text-platinum-400")}>
          {money(holding.valueCents)}
        </span>
      </Line>
      <Line label={t("costBasis")}>{money(holding.costBasisCents)}</Line>
      <Line label={t("gainLoss")}>
        <span className={cn("font-semibold", deltaClass(dir))}>
          {ARROW[dir]} {SIGN[dir]}
          {signedMoney(holding.gainLossCents)}
        </span>
      </Line>
    </Card>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 pt-2">
      <span className="text-[0.9375rem] text-muted-foreground">{label}</span>
      <span className="tnum text-[0.9375rem]">{children}</span>
    </div>
  );
}

/**
 * Gemstone tier.
 *
 * The lowest band is named "Gold", which is also an asset and the brand
 * colour — so tier identity is carried by a faceted mark and a label, never by
 * a colour fill that would compete with the metals (`design/design.md` §5).
 */
function TierCard({ tier }: { tier: TierDto }) {
  const t = useTranslations("tier");
  if (!tier.name) return null;

  const progress = tier.progressPctMilli ? Number(tier.progressPctMilli) / 1000 : null;
  const localizedName = t.has(`names.${tier.name}` as never)
    ? t(`names.${tier.name}` as never)
    : tier.name;

  return (
    <Card className="p-4">
      <div className="mb-3.5 flex items-center gap-3">
        <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true" className="flex-none">
          <path
            d="M17 3 L28 12 L23.5 27 H10.5 L6 12 Z"
            stroke="var(--platinum-400)"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M6 12 H28 M17 3 V27 M10.5 27 L17 12 L23.5 27"
            stroke="var(--platinum-400)"
            strokeWidth="1"
            opacity="0.55"
          />
        </svg>
        <div>
          <div className="text-base font-semibold">{localizedName}</div>
          <div className="text-[0.9375rem] text-muted-foreground">
            {tier.bandMaxUsd === null ? t("topBand") : t("band", { max: tier.bandMaxUsd })}
          </div>
        </div>
      </div>

      {progress !== null && (
        <>
          <div className="h-1.5 overflow-hidden rounded-full bg-popover">
            <div
              className="h-full rounded-full bg-platinum-500 transition-[width] duration-200"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between gap-3">
            <span className="tnum text-[0.8125rem] text-muted-foreground">
              ${usd(tier.holdingUsdCents)}
            </span>
            {tier.nextName && tier.nextThresholdUsd !== null && (
              <span className="text-[0.9375rem] text-muted-foreground">
                {t("toNext", { name: tier.nextName, amount: tier.nextThresholdUsd })}
              </span>
            )}
          </div>
        </>
      )}

      <p className="mt-3 border-t border-border pt-3 text-[0.9375rem] text-muted-foreground">
        {tier.bandMaxUsd === null ? t("topUnlock") : t("unlock")}
      </p>
    </Card>
  );
}

function PortfolioSkeleton() {
  return (
    <>
      <Skeleton className="mb-3.5 mt-1 h-8 w-36" />
      <Card className="mb-3.5 p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="my-2 h-9 w-52" />
        <Skeleton className="h-4 w-40" />
      </Card>
      <Card className="mb-2.5 p-4">
        <Skeleton className="h-5 w-full" />
      </Card>
      <Card className="p-4">
        <Skeleton className="h-5 w-full" />
      </Card>
    </>
  );
}
