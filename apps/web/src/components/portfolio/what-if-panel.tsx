"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FeeRatesResponse, MetalAsset, PortfolioResponse } from "@alkeva/shared";

import { useAssetPrice } from "@/components/market/price-provider";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { grams, money } from "@/lib/format";
import { revalueHolding } from "@/lib/live-value";
import { useResource } from "@/lib/use-resource";

/** mg of metal that `cents` buys at `unitCentsPerGram`. Floor, once — the same
    rule the quote engine applies, so the figure cannot read high. */
function mgFor(cents: bigint, unitCentsPerGram: bigint): bigint {
  if (unitCentsPerGram <= 0n) return BigInt(0);
  return (cents * 1000n) / unitCentsPerGram;
}

/**
 * What a different split would look like — arithmetic, not advice.
 *
 * Decision A4 keeps the platform non-advisory, so this panel is built to be
 * incapable of recommending: the slider opens at the user's *current* split, no
 * target is suggested, nothing is called optimal, and there is no risk
 * questionnaire to imply one answer is better. It answers one question the user
 * asked by moving the handle — "what would that cost?" — and hands off to the
 * ordinary quote flow, which is the only binding number.
 */
export function WhatIfPanel({
  portfolio,
  className,
}: {
  portfolio: PortfolioResponse;
  className?: string;
}) {
  const t = useTranslations("whatIf");
  const tc = useTranslations("common");
  const xau = useAssetPrice("XAU");
  const xpt = useAssetPrice("XPT");
  const { data: fees } = useResource<FeeRatesResponse>("/fees");

  // Live-marked metal values, cost basis untouched (server-authoritative).
  const marked = useMemo(
    () =>
      portfolio.holdings.map((h) => revalueHolding(h, h.asset === "XAU" ? xau : xpt)),
    [portfolio.holdings, xau, xpt],
  );

  const valueOf = (asset: MetalAsset): bigint =>
    BigInt(marked.find((h) => h.asset === asset)?.valueCents ?? "0");
  const goldValue = valueOf("XAU");
  const platValue = valueOf("XPT");
  const totalMetal = goldValue + platValue;

  const currentGoldPct =
    totalMetal > 0n ? Number((goldValue * 1000n) / totalMetal) / 10 : 50;

  // Opens where the user already is. Any other default would be a suggestion.
  const [target, setTarget] = useState<number | null>(null);
  const goldPct = target ?? currentGoldPct;

  if (totalMetal <= 0n) {
    return (
      <Panel className={className}>
        <PanelHeader title={t("title")} hint={t("hint")} />
        <PanelBody>
          <p className="py-4 text-[0.9375rem] text-muted-foreground">{t("noHoldings")}</p>
        </PanelBody>
      </Panel>
    );
  }

  const targetGold = (totalMetal * BigInt(Math.round(goldPct * 10))) / 1000n;
  const goldDelta = targetGold - goldValue;
  const platDelta = -goldDelta;

  const goldUnit = BigInt(xau?.etbCentsPerGram ?? "0");
  const platUnit = BigInt(xpt?.etbCentsPerGram ?? "0");
  const abs = (v: bigint) => (v < 0n ? -v : v);

  // Commission applies to each leg's notional; a reallocation is two trades.
  const commissionMilli = BigInt(fees?.commissionPctMilli ?? 0);
  const serviceFee = BigInt(fees?.serviceFeeCents ?? "0");
  const notional = abs(goldDelta) + abs(platDelta);
  const estFee =
    fees && notional > 0n ? (notional * commissionMilli) / 100_000n + serviceFee * 2n : BigInt(0);

  // "Moved" means the user moved the handle — not that the arithmetic produced
  // a residue. The slider steps in whole percent while the real split is
  // fractional (42.3%), so at rest the rounding alone yields a few birr of
  // delta; showing that as a trade to make would be noise presented as advice.
  const moved = target !== null && Math.round(goldPct) !== Math.round(currentGoldPct);

  return (
    <Panel className={className}>
      <PanelHeader title={t("title")} hint={t("hint")} />
      <PanelBody>
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3 text-[0.9375rem]">
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="size-2.5 rounded-full bg-gold-500" />
              {tc("gold")} <span className="tnum font-semibold">{goldPct.toFixed(0)}%</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="tnum font-semibold">{(100 - goldPct).toFixed(0)}%</span>{" "}
              {tc("platinum")}
              <span aria-hidden="true" className="size-2.5 rounded-full bg-platinum-400" />
            </span>
          </div>

          <Slider
            value={[goldPct]}
            onValueChange={([v]) => setTarget(v ?? currentGoldPct)}
            min={0}
            max={100}
            step={1}
            aria-label={t("sliderLabel")}
          />

          {!moved ? (
            <p className="text-[0.9375rem] text-muted-foreground">
              {t("atCurrent", { pct: currentGoldPct.toFixed(0) })}
            </p>
          ) : (
            <dl className="flex flex-col gap-2.5">
              <Move
                label={goldDelta > 0n ? t("buy", { metal: tc("gold") }) : t("sell", { metal: tc("gold") })}
                amount={`${grams(mgFor(abs(goldDelta), goldUnit))} · ${money(abs(goldDelta))}`}
              />
              <Move
                label={
                  platDelta > 0n
                    ? t("buy", { metal: tc("platinum") })
                    : t("sell", { metal: tc("platinum") })
                }
                amount={`${grams(mgFor(abs(platDelta), platUnit))} · ${money(abs(platDelta))}`}
              />
              <div className="well flex items-baseline justify-between gap-3 rounded-lg p-3 text-[0.9375rem]">
                <dt className="text-muted-foreground">
                  {t("estimatedFees", { pct: (Number(commissionMilli) / 1000).toFixed(2) })}
                </dt>
                <dd className="tnum font-medium">{fees ? money(estFee) : <Skeleton className="h-4 w-16" />}</dd>
              </div>
            </dl>
          )}

          <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">{t("disclaimer")}</p>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/trade">{t("goToTrade")}</Link>
            </Button>
            {moved && (
              <Button variant="ghost" onClick={() => setTarget(null)}>
                {t("reset")}
              </Button>
            )}
          </div>
        </div>
      </PanelBody>
    </Panel>
  );
}

function Move({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[0.9375rem]">
      <dt>{label}</dt>
      <dd className="tnum font-medium">{amount}</dd>
    </div>
  );
}
