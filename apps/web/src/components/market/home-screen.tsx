"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { HoldingDto, MetalAsset, OrderListResponse, PortfolioResponse } from "@alkeva/shared";

import { PriceAlertButton } from "@/components/market/price-alert-dialog";
import { TickerStrip } from "@/components/market/ticker-strip";
import { PriceChart } from "@/components/market/price-chart";
import { useAssetPrice, usePrices } from "@/components/market/price-provider";
import { TrustPanel } from "@/components/market/trust-panel";
import { OrdersTable } from "@/components/orders/orders-table";
import { TierGauge, useTierName } from "@/components/portfolio/tier-gauge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { SystemBanner } from "@/components/system/banner";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";
import { revalueHolding } from "@/lib/live-value";
import {
  ARROW,
  SIGN,
  deltaClass,
  direction,
  grams,
  money,
  pctMilli,
  signedMoney,
} from "@/lib/format";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/**
 * Markets — the first screen. Answers, top to bottom: what are the metals
 * worth right now, how has the price moved, where do I stand, what did I last
 * do, and is it all backed.
 *
 *   ticker: gold · platinum · world gold · world platinum · USD→ETB
 *   price chart                         │ total holdings
 *   recent activity  (takes the rest)   │ vault backing
 *
 * Every grid row stretches; each panel has one elastic region, so a short
 * panel grows its body instead of leaving page under it.
 */
export function HomeScreen() {
  const t = useTranslations("home");
  const { open, revision } = useTradeSheet();
  const isDesktop = useIsDesktop();
  const router = useRouter();
  const [selected, setSelected] = useState<MetalAsset>("XAU");
  const { anyStale: stale } = usePrices();

  /** On a desk the ticket is the terminal; on a phone a sheet over this page. */
  const trade = (asset: MetalAsset, side: "buy" | "sell") =>
    isDesktop ? router.push(`/trade?asset=${asset}&side=${side}`) : open(asset, side);

  return (
    <div className="flex flex-1 flex-col gap-3">
      {stale && (
        <SystemBanner tone="caution" className="mb-0">
          {t("stale")}
        </SystemBanner>
      )}

      <TickerStrip selected={selected} onSelect={setSelected} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_25.25rem]">
        <PriceChart
          asset={selected}
          onAssetChange={setSelected}
          actions={<PriceAlertButton asset={selected} compact />}
          className="hidden min-h-[27rem] lg:flex"
        />
        <PriceChart
          asset={selected}
          onAssetChange={setSelected}
          compact
          className="lg:hidden"
        />
        <TotalPanel revision={revision} onTrade={trade} />
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_25.25rem]">
        <RecentActivity revision={revision} onBuy={() => trade("XAU", "buy")} />
        <TrustPanel />
      </div>
    </div>
  );
}

/* ── Total holdings ────────────────────────────────────────────────── */

function TotalPanel({
  revision,
  onTrade,
}: {
  revision: number;
  onTrade: (asset: MetalAsset, side: "buy" | "sell") => void;
}) {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const tierName = useTierName();
  const portfolio = useResource<PortfolioResponse>("/portfolio", { revision });
  const xau = useAssetPrice("XAU");
  const xpt = useAssetPrice("XPT");
  const data = portfolio.data;

  // Re-marked at the live tick so Markets ≡ Portfolio ≡ terminal at every instant.
  const held = useMemo(() => {
    const byAsset = new Map<MetalAsset, HoldingDto>();
    for (const h of data?.holdings ?? []) byAsset.set(h.asset, revalueHolding(h, h.asset === "XAU" ? xau : xpt));
    return byAsset;
  }, [data, xau, xpt]);

  const goldCents = BigInt(held.get("XAU")?.valueCents ?? "0");
  const platCents = BigInt(held.get("XPT")?.valueCents ?? "0");
  const cashCents = data ? BigInt(data.etbCents) : 0n;
  const metalCents = goldCents + platCents;
  const totalCents = metalCents + cashCents;
  const costCents = data ? BigInt(data.totalCostBasisCents) : 0n;
  const gainCents = metalCents - costCents;
  const gainPct = costCents > 0n ? pctMilli(((gainCents * 100_000n) / costCents).toString()) : null;
  const dir = direction(gainCents);
  const share = (part: bigint) => (totalCents > 0n ? (Number(part) / Number(totalCents)) * 100 : 0);

  const rows = [
    { key: "XAU", tone: "bg-gold-400", label: `${tc("gold")} · ${grams(held.get("XAU")?.gramsMg ?? "0")} ${tc("g")}`, cents: goldCents },
    { key: "XPT", tone: "bg-platinum-400", label: `${tc("platinum")} · ${grams(held.get("XPT")?.gramsMg ?? "0")} ${tc("g")}`, cents: platCents },
    { key: "ETB", tone: "bg-[#5d5a55]", label: t("cash"), cents: cashCents },
  ];

  return (
    <Panel aria-label={t("totalLabel")}>
      <PanelHeader
        title={t("totalLabel")}
        action={
          data?.tier.name ? (
            <Badge variant="gold" dot>
              {tierName(data.tier.name)}
            </Badge>
          ) : null
        }
      />
      <div className="flex flex-1 flex-col gap-4 px-[1.125rem] pb-[1.125rem]">
        {!data ? (
          <Skeleton className="h-16 w-56" />
        ) : (
          <div>
            <div className="flex items-baseline gap-2">
              <span className="tnum text-[2.125rem] leading-none font-semibold tracking-[-0.02em]">
                {money(totalCents)}
              </span>
              <span className="text-[0.9375rem] text-muted-foreground">{tc("birr")}</span>
            </div>
            {costCents > 0n && (
              <p className={cn("tnum mt-1.5 text-[0.8125rem]", deltaClass(dir))}>
                {ARROW[dir]} {signedMoney(gainCents.toString())}
                {gainPct && ` · ${SIGN[dir]}${gainPct}%`}{" "}
                <span className="font-sans text-subtle">{t("vsCost")}</span>
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
            {rows.map((r) =>
              r.cents > 0n ? <span key={r.key} className={r.tone} style={{ width: `${share(r.cents)}%` }} /> : null,
            )}
          </div>
          {rows.map((r) => (
            <div key={r.key} className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
              <span className="flex items-center gap-2 text-muted-foreground">
                <i aria-hidden="true" className={cn("size-2 rounded-[2px]", r.tone)} />
                <span className="tnum">{r.label}</span>
              </span>
              <span className="tnum font-medium">{data ? money(r.cents) : "—"}</span>
            </div>
          ))}
        </div>

        {data?.tier.name && (
          <div className="border-t border-border pt-3.5">
            <TierGauge tier={data.tier} size={76} />
          </div>
        )}

        <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border pt-3.5">
          <Button onClick={() => onTrade("XAU", "buy")}>{t("buyGoldCta")}</Button>
          <Button variant="outline" onClick={() => onTrade("XPT", "buy")}>
            {t("buyPlatCta")}
          </Button>
          <Button variant="ghost" className="border border-border" asChild>
            <Link href="/deposit">{t("depositCta")}</Link>
          </Button>
          <Button variant="ghost" className="border border-border" asChild>
            <Link href="/withdraw">{t("withdrawCta")}</Link>
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/* ── Recent activity ───────────────────────────────────────────────── */

function RecentActivity({ revision, onBuy }: { revision: number; onBuy: () => void }) {
  const t = useTranslations("home");
  const { data, loading } = useResource<OrderListResponse>("/orders?limit=6", { revision });
  const orders = data?.orders ?? [];

  return (
    <Panel aria-label={t("recentActivity")} className="min-h-[16rem]">
      <PanelHeader
        title={t("recentActivity")}
        action={
          <Link href="/history" className="text-[0.8125rem] font-semibold text-gold-400 hover:text-gold-300">
            {t("viewAll")} →
          </Link>
        }
      />
      <div className="min-h-0 flex-1 overflow-auto border-t border-border">
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-[0.9375rem] font-semibold">{t("emptyTitle")}</p>
            <p className="text-[0.8125rem] text-muted-foreground">{t("emptyBody")}</p>
            <Button size="sm" onClick={onBuy}>
              {t("buyGoldCta")}
            </Button>
          </div>
        ) : (
          <OrdersTable groups={[{ key: "recent", orders }]} />
        )}
      </div>
    </Panel>
  );
}
