"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { MetalAsset, PortfolioResponse, TierDto } from "@alkeva/shared";

import { useAssetPrice } from "@/components/market/price-provider";
import { TrustPanel } from "@/components/market/trust-panel";
import { BadgesRow } from "@/components/portfolio/badges-row";
import { DeliveryCard } from "@/components/portfolio/delivery-card";
import { HoldingsTable } from "@/components/portfolio/holdings-table";
import { TierGauge, useTierName } from "@/components/portfolio/tier-gauge";
import { TierMark } from "@/components/shell/nav-items";
import { GoldVault } from "@/components/three/gold-vault";
import { MetalMass } from "@/components/three/metal-mass";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Coin, Panel, PanelHeader, Stat, StatStrip } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";
import { revalueHolding } from "@/lib/live-value";
import { ARROW, SIGN, deltaClass, direction, grams, money, pctMilli, signedMoney } from "@/lib/format";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/**
 * What you own, what it cost, and what backs it.
 *
 *   summary strip: total · cost basis · gain/loss · gold · platinum · cash
 *   holdings (table + allocation + badges)   │ your vault (3D)
 *   tier            │ physical delivery      │ vault backing
 *
 * Holdings are re-marked at the shared live tick; cost basis and the
 * gain/loss methodology stay the server's.
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

  const held = data.holdings
    .filter((h) => BigInt(h.gramsMg) > 0n)
    .map((h) => revalueHolding(h, h.asset === "XAU" ? xau : xpt));
  const metal = held.reduce((s, h) => s + BigInt(h.valueCents), 0n);
  const cash = BigInt(data.etbCents);
  const total = metal + cash;
  const cost = BigInt(data.totalCostBasisCents);
  const gain = metal - cost;
  const dir = direction(gain);
  const pct = cost > 0n ? pctMilli(((gain * 100_000n) / cost).toString()) : null;
  const gold = held.find((h) => h.asset === "XAU");
  const plat = held.find((h) => h.asset === "XPT");

  if (held.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-3">
        <SummaryStrip total={total} cost={0n} gain={0n} pct={null} dir="flat" goldMg="0" platMg="0" cash={cash} />
        <Panel className="flex-1 items-center justify-center gap-3 p-8 text-center">
          <span className="flex gap-2">
            <Coin metal="XAU" size="lg" />
            <Coin metal="XPT" size="lg" />
          </span>
          <h2 className="text-[1.125rem] font-bold">{t("emptyTitle")}</h2>
          <p className="max-w-sm text-[0.875rem] text-muted-foreground">{t("emptyBody")}</p>
          <div className="flex gap-2">
            <Button onClick={() => trade("XAU", "buy")}>{th("buyGoldCta")}</Button>
            <Button variant="outline" onClick={() => trade("XPT", "buy")}>
              {th("buyPlatCta")}
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  const share = (cents: bigint) => (total > 0n ? (Number(cents) / Number(total)) * 100 : 0);

  return (
    <div className="flex flex-1 flex-col gap-3">
      <SummaryStrip
        total={total}
        cost={cost}
        gain={gain}
        pct={pct}
        dir={dir}
        goldMg={gold?.gramsMg ?? "0"}
        platMg={plat?.gramsMg ?? "0"}
        cash={cash}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_29.375rem]">
        <Panel aria-label={t("holdingsTitle")}>
          <PanelHeader title={t("holdingsTitle")} hint={t("costFromLedger")} />
          <div className="border-t border-border">
            <HoldingsTable holdings={held} cashCents={data.etbCents} onTrade={trade} />
          </div>
          <div className="flex flex-1 flex-col gap-5 border-t border-border px-[1.125rem] py-4">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[0.8125rem] font-bold">{t("allocation")}</span>
                <span className="data-label">{t("byLiveValue")}</span>
              </div>
              <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                {gold && <span className="bg-gold-400" style={{ width: `${share(BigInt(gold.valueCents))}%` }} />}
                {plat && <span className="bg-platinum-400" style={{ width: `${share(BigInt(plat.valueCents))}%` }} />}
                {cash > 0n && <span className="bg-[#5d5a55]" style={{ width: `${share(cash)}%` }} />}
              </div>
              <div className="tnum flex flex-wrap gap-x-5 gap-y-1 text-[0.75rem] text-muted-foreground">
                {gold && <Legend tone="bg-gold-400" label={tc("gold")} pct={share(BigInt(gold.valueCents))} />}
                {plat && <Legend tone="bg-platinum-400" label={tc("platinum")} pct={share(BigInt(plat.valueCents))} />}
                <Legend tone="bg-[#5d5a55]" label={th("cash")} pct={share(cash)} />
              </div>
            </div>
            {dir === "down" && (
              <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">{t("firstLoss")}</p>
            )}
            <BadgesRow badges={data.badges ?? []} className="mt-auto" />
          </div>
        </Panel>

        <VaultPanel goldMg={gold?.gramsMg ?? null} goldValue={gold?.valueCents ?? null} platMg={plat?.gramsMg ?? null} />
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-3">
        <TierPanel tier={data.tier} />
        <DeliveryCard eligible={data.tier.deliveryEligible} holdings={held} />
        <TrustPanel />
      </div>
    </div>
  );
}

function SummaryStrip({
  total,
  cost,
  gain,
  pct,
  dir,
  goldMg,
  platMg,
  cash,
}: {
  total: bigint;
  cost: bigint;
  gain: bigint;
  pct: string | null;
  dir: ReturnType<typeof direction>;
  goldMg: string;
  platMg: string;
  cash: bigint;
}) {
  const t = useTranslations("portfolio");
  const tc = useTranslations("common");
  return (
    <section data-panel="" aria-label={t("summary")} className="overflow-hidden rounded-lg border border-border bg-card">
      <StatStrip className="min-h-[5.25rem] lg:[&>*]:flex-auto">
        <Stat surface="strip" size="lg" label={t("totalLive")} value={money(total)} unit={tc("birr")} />
        <Stat surface="strip" label={t("costBasisMetal")} value={money(cost)} />
        <Stat
          surface="strip"
          label={t("gainLossMetal")}
          tone={dir === "up" ? "gain" : dir === "down" ? "loss" : undefined}
          value={
            cost > 0n
              ? `${ARROW[dir]} ${signedMoney(gain.toString())}${pct ? ` · ${SIGN[dir]}${pct}%` : ""}`
              : "—"
          }
        />
        <Stat surface="strip" label={t("goldHeld")} tone="gold" value={grams(goldMg)} unit={tc("g")} />
        <Stat surface="strip" label={t("platinumHeld")} tone="platinum" value={grams(platMg)} unit={tc("g")} />
        <Stat surface="strip" label={t("cashEtb")} value={money(cash)} />
      </StatStrip>
    </section>
  );
}

function Legend({ tone, label, pct }: { tone: string; label: string; pct: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <i aria-hidden="true" className={cn("size-2 rounded-[2px]", tone)} />
      <span className="font-sans">{label}</span>
      <b className="font-semibold text-foreground">{pct.toFixed(1)}%</b>
    </span>
  );
}

/**
 * The vault visual (spec F13): gold lives in the gold box — click it open to
 * lift the bar out; platinum is its own ingot. Bar volume ∝ grams held, and
 * every label comes from the same holding rows as the table.
 */
function VaultPanel({
  goldMg,
  goldValue,
  platMg,
}: {
  goldMg: string | null;
  goldValue: string | null;
  platMg: string | null;
}) {
  const t = useTranslations("portfolio");
  const tc = useTranslations("common");
  const options = [
    ...(goldMg ? [{ value: "XAU" as const, label: tc("gold") }] : []),
    ...(platMg ? [{ value: "XPT" as const, label: tc("platinum") }] : []),
  ];
  const [view, setView] = useState<MetalAsset>(goldMg ? "XAU" : "XPT");

  return (
    <Panel aria-label={t("vaultVisualTitle")}>
      <PanelHeader
        title={t("vaultVisualTitle")}
        action={
          options.length > 1 ? (
            <Segmented value={view} onValueChange={setView} size="sm" aria-label={t("vaultVisualTitle")} options={options} />
          ) : (
            <span className="data-label">{t("vaultVisualHint")}</span>
          )
        }
      />
      <div className="flex flex-1 flex-col px-3 pb-3">
        {view === "XAU" && goldMg ? (
          <GoldVault
            gramsMg={goldMg}
            gramsLabel={`${grams(goldMg)} ${tc("g")}`}
            valueLabel={`${money(goldValue ?? "0")} ${tc("birr")}`}
            fill
            className="flex-1 rounded-md bg-background"
          />
        ) : platMg ? (
          <div className="grid min-h-[300px] flex-1 place-items-center rounded-md bg-background p-4">
            <MetalMass asset="XPT" gramsMg={platMg} label={`${grams(platMg)} ${tc("g")} ${tc("platinum")}`} />
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

/**
 * Gemstone tier. The lowest band is called "Gold", which is also an asset and
 * the brand colour — so identity rides on the faceted mark and the name.
 */
function TierPanel({ tier }: { tier: TierDto }) {
  const t = useTranslations("tier");
  const name = useTierName();
  if (!tier.name) {
    return (
      <Panel aria-label={t("label")}>
        <PanelHeader title={t("label")} />
        <p className="flex flex-1 items-center px-[1.125rem] pb-[1.125rem] text-[0.84375rem] text-muted-foreground">
          {t("unlock")}
        </p>
      </Panel>
    );
  }
  const tc = useTranslations("common");
  const toNext =
    tier.nextThresholdUsd !== null
      ? Math.max(0, tier.nextThresholdUsd * 100 - Number(BigInt(tier.holdingUsdCents))) / 100
      : null;
  const unlocks = [
    { k: t("perTxnCap"), v: tier.perTxnCapCents ? `${money(tier.perTxnCapCents)} ${tc("birr")}` : t("noLimit") },
    { k: t("dailyCap"), v: tier.dailyCapCents ? `${money(tier.dailyCapCents)} ${tc("birr")}` : t("noLimit") },
    { k: t("delivery"), v: tier.deliveryEligible ? t("yes") : t("notYet") },
    ...(toNext !== null && tier.nextName
      ? [{ k: t("toNextLabel", { name: name(tier.nextName) ?? "" }), v: `$${toNext.toLocaleString("en-US", { maximumFractionDigits: 0 })}` }]
      : []),
  ];

  return (
    <Panel aria-label={t("label")}>
      <PanelHeader
        title={t("label")}
        action={
          tier.nextThresholdUsd !== null ? (
            <span className="data-label">{t("toNextShort", { name: name(tier.nextName) ?? "" })}</span>
          ) : null
        }
      />
      <div className="flex flex-1 flex-col gap-4 px-[1.125rem] pb-[1.125rem]">
        <div className="flex items-center gap-3">
          <TierMark size={34} />
          <div className="flex flex-col">
            <span className="text-[1.0625rem] font-bold">{name(tier.name)}</span>
            <span className="text-[0.78125rem] text-muted-foreground">{t("currentLevel")}</span>
          </div>
          {tier.deliveryEligible && (
            <Badge variant="gold" dot className="ms-auto">
              {t("deliveryOn")}
            </Badge>
          )}
        </div>
        <TierGauge tier={tier} />
        <div className="flex flex-col gap-2 border-t border-border pt-3.5">
          <span className="text-[0.8125rem] font-bold">{t("whatItUnlocks")}</span>
          {unlocks.map((c) => (
            <div key={c.k} className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
              <span className="text-muted-foreground">{c.k}</span>
              <span className="tnum font-medium">{c.v}</span>
            </div>
          ))}
        </div>
        <p className="mt-auto text-[0.75rem] leading-relaxed text-subtle">
          {tier.bandMaxUsd === null ? t("topUnlock") : t("unlock")}
        </p>
      </div>
    </Panel>
  );
}

function PortfolioSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-3">
      <Skeleton className="h-[5.25rem] rounded-lg" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_29.375rem]">
        <Skeleton className="h-[28rem] rounded-lg" />
        <Skeleton className="h-[28rem] rounded-lg" />
      </div>
    </div>
  );
}
