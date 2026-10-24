"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type {
  MeResponse,
  MetalAsset,
  OrderListResponse,
  OrderSide,
  PortfolioResponse,
} from "@alkeva/shared";

import { useAssetPrice } from "@/components/market/price-provider";
import { MarketHeader } from "@/components/market/market-header";
import { PriceChart } from "@/components/market/price-chart";
import { TickTape } from "@/components/market/tick-tape";
import { OrdersTable } from "@/components/orders/orders-table";
import { HoldingsTable } from "@/components/portfolio/holdings-table";
import { TierGauge, useTierName } from "@/components/portfolio/tier-gauge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderTicket, Row } from "@/components/trade/order-ticket";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";
import { useTradeForm } from "@/components/trade/use-trade-form";
import { SystemBanner } from "@/components/system/banner";
import { revalueHolding } from "@/lib/live-value";
import { money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

type PositionsTab = "holdings" | "orders" | "refused" | "receipts";

/**
 * The trading terminal (RabbitX's layout, translated to metal dealing):
 *
 *   market head ─────────────────────────────────────────────
 *   price chart            │ price ticks │ order
 *   your metal (holdings · orders · refused · receipts) │ account
 *
 * Row two has one height and every panel stretches to it; row three takes
 * whatever height is left on the screen, so nothing ends in empty page.
 * On a phone it is one column in reading order: price, chart, order, metal.
 *
 * It mounts the same `useTradeForm` as the phone sheet, so the idempotency
 * key per quote, the server-driven countdown and the deliberately
 * never-disabled Confirm exist exactly once in the codebase.
 */
export function TradeWorkspace({
  initialAsset,
  initialSide,
}: {
  initialAsset: MetalAsset;
  initialSide: OrderSide;
}) {
  const t = useTranslations("trade");
  const { revision, settled } = useTradeSheet();
  const orderRef = useRef<HTMLElement>(null);

  const form = useTradeForm({ active: true, initialAsset, initialSide, revision, settled });
  const { asset, setAsset, setSide, errorCode, isPlatformHalt } = form;
  const error = errorCode ? t(`errors.${errorCode}` as never) : null;

  function pick(a: MetalAsset, s: OrderSide) {
    setAsset(a);
    setSide(s);
    orderRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      {error && (
        <SystemBanner tone={isPlatformHalt ? "critical" : "caution"} className="mb-0">
          {error}
        </SystemBanner>
      )}

      <MarketHeader asset={asset} onAssetChange={setAsset} />

      <div className="grid grid-cols-1 gap-3 lg:h-[clamp(34rem,calc(100dvh-14.5rem),42rem)] lg:grid-cols-[minmax(0,1fr)_22.25rem] xl:grid-cols-[minmax(0,1fr)_18.25rem_22.25rem]">
        <PriceChart asset={asset} className="hidden lg:flex" />
        <PriceChart asset={asset} compact className="lg:hidden" />
        <TickTape asset={asset} className="hidden xl:flex" />
        <Panel ref={orderRef} aria-label={t("orderTitle")} className="scroll-mt-20">
          <PanelHeader title={t("orderTitle")} hint={t("orderHint")} />
          <OrderTicket form={form} />
        </Panel>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_22.25rem]">
        <Positions onTrade={pick} />
        <AccountPanel />
      </div>
    </div>
  );
}

/* ── Your metal ────────────────────────────────────────────────────── */

function Positions({ onTrade }: { onTrade: (a: MetalAsset, s: OrderSide) => void }) {
  const t = useTranslations("trade");
  const { revision } = useTradeSheet();
  const [tab, setTab] = useState<PositionsTab>("holdings");
  const portfolio = useResource<PortfolioResponse>("/portfolio", { revision });
  const orders = useResource<OrderListResponse>("/orders?limit=50", { revision });
  const xau = useAssetPrice("XAU");
  const xpt = useAssetPrice("XPT");

  const held = useMemo(
    () =>
      (portfolio.data?.holdings ?? [])
        .filter((h) => BigInt(h.gramsMg) > 0n)
        .map((h) => revalueHolding(h, h.asset === "XAU" ? xau : xpt)),
    [portfolio.data, xau, xpt],
  );
  const all = orders.data?.orders ?? [];
  const live = all.filter((o) => o.status !== "rejected");
  const refused = all.filter((o) => o.status === "rejected");
  const receipts = all.filter((o) => o.status === "settled" && o.receiptSerial);

  return (
    <Panel aria-label={t("yourMetal")} className="min-h-[18rem]">
      <PanelHeader
        title={t("yourMetal")}
        action={
          <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
            <Segmented
              value={tab}
              onValueChange={setTab}
              aria-label={t("yourMetal")}
              options={[
                { value: "holdings", label: t("tabHoldings"), count: held.length },
                { value: "orders", label: t("tabOrders"), count: live.length },
                { value: "refused", label: t("tabRefused"), count: refused.length },
                { value: "receipts", label: t("tabReceipts"), count: receipts.length },
              ]}
            />
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-auto border-t border-border">
        {portfolio.loading || orders.loading ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : tab === "holdings" ? (
          held.length === 0 ? (
            <Empty>{t("emptyHoldings")}</Empty>
          ) : (
            <HoldingsTable holdings={held} cashCents={portfolio.data!.etbCents} onTrade={onTrade} />
          )
        ) : tab === "orders" ? (
          live.length === 0 ? (
            <Empty>{t("emptyOrders")}</Empty>
          ) : (
            <OrdersTable groups={[{ key: "o", orders: live }]} />
          )
        ) : tab === "refused" ? (
          refused.length === 0 ? (
            <Empty>{t("emptyRefused")}</Empty>
          ) : (
            <OrdersTable groups={[{ key: "r", orders: refused }]} showReceipt={false} />
          )
        ) : receipts.length === 0 ? (
          <Empty>{t("emptyReceipts")}</Empty>
        ) : (
          <OrdersTable groups={[{ key: "s", orders: receipts }]} showSerial />
        )}
      </div>
    </Panel>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex h-full min-h-32 items-center justify-center px-6 text-center text-[0.875rem] text-muted-foreground">
      {children}
    </p>
  );
}

/* ── Account ───────────────────────────────────────────────────────── */

function AccountPanel() {
  const t = useTranslations("trade");
  const tn = useTranslations("nav");
  const { revision } = useTradeSheet();
  const tierName = useTierName();
  const portfolio = useResource<PortfolioResponse>("/portfolio", { revision });
  const me = useResource<MeResponse>("/auth/me");
  const xau = useAssetPrice("XAU");
  const xpt = useAssetPrice("XPT");

  const data = portfolio.data;
  const metal = data
    ? data.holdings.reduce(
        (s, h) => s + BigInt(revalueHolding(h, h.asset === "XAU" ? xau : xpt).valueCents),
        0n,
      )
    : null;
  const verified = (me.data?.kycTier ?? 0) >= 1;
  const tc = useTranslations("common");
  const parts = data
    ? [
        ...data.holdings.map((h) => ({
          key: h.asset,
          label: h.asset === "XAU" ? tc("gold") : tc("platinum"),
          cents: BigInt(revalueHolding(h, h.asset === "XAU" ? xau : xpt).valueCents),
          tone: h.asset === "XAU" ? "bg-gold-400" : "bg-platinum-400",
        })),
        { key: "ETB", label: t("cash"), cents: BigInt(data.etbCents), tone: "bg-[#5d5a55]" },
      ]
    : [];
  const sum = parts.reduce((s, x) => s + x.cents, 0n);
  const pct = (c: bigint) => (sum > 0n ? (Number(c) / Number(sum)) * 100 : 0);

  return (
    <Panel aria-label={t("account")}>
      <PanelHeader
        title={t("account")}
        action={
          data?.tier.name ? (
            <Badge variant="gold" dot>
              {tierName(data.tier.name)}
            </Badge>
          ) : null
        }
      />
      <div className="flex flex-1 flex-col gap-3.5 px-4 pb-4">
        {data ? <TierGauge tier={data.tier} /> : <Skeleton className="h-14" />}
        <div className="flex flex-col gap-2.5 border-t border-border pt-3">
          <Row label={t("cash")}>{data ? money(data.etbCents) : <Skeleton className="h-4 w-20" />}</Row>
          <Row label={t("metalValue")}>{metal !== null ? money(metal) : <Skeleton className="h-4 w-20" />}</Row>
          <Row label={tn("kyc")}>
            {me.data ? (
              verified ? (
                <span className="text-gain">✓ {t("verified")}</span>
              ) : (
                <Link href="/kyc" className="text-gold-400 hover:text-gold-300">
                  {t("verifyNow")} →
                </Link>
              )
            ) : (
              <Skeleton className="h-4 w-16" />
            )}
          </Row>
        </div>
        {sum > 0n && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
              {parts.map((x) =>
                x.cents > 0n ? <span key={x.key} className={x.tone} style={{ width: `${pct(x.cents)}%` }} /> : null,
              )}
            </div>
            <div className="tnum flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem] text-muted-foreground">
              {parts.map((x) => (
                <span key={x.key} className="flex items-center gap-1.5">
                  <i aria-hidden="true" className={`size-2 rounded-[2px] ${x.tone}`} />
                  <span className="font-sans">{x.label}</span> {pct(x.cents).toFixed(1)}%
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="mt-auto grid grid-cols-2 gap-2">
          <Button variant="outline" asChild>
            <Link href="/deposit">{tn("deposit")}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/withdraw">{tn("withdraw")}</Link>
          </Button>
        </div>
      </div>
    </Panel>
  );
}
