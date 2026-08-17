"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { HoldingDto, MetalAsset, OrderListResponse, PortfolioResponse } from "@alkeva/shared";

import { OrdersTable } from "@/components/orders/orders-table";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader, Stat } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { PriceAlertButton } from "@/components/market/price-alert-dialog";
import { MoveAttribution } from "@/components/market/move-attribution";
import { PriceChart } from "@/components/market/price-chart";
import { useAssetPrice, usePrices, type LivePrice } from "@/components/market/price-provider";
import { TrustPanel } from "@/components/market/trust-panel";
import { MetalMass } from "@/components/three/metal-mass";
import { TierMark } from "@/components/shell/nav-items";
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
  timeOfDay,
} from "@/lib/format";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/**
 * The dashboard.
 *
 * On a wide screen this is a 12-column status board — what you hold, both
 * markets, the chart, the vault proof and the last orders all visible at once,
 * because a dealer's home screen answers "where do I stand?" before anything
 * else. Below 1024px the same blocks stack in the same order. Nothing is
 * desktop-only: the phone gets every figure, just in sequence.
 *
 * Rows are top-aligned (`items-start`) rather than stretched. The previous
 * composition pinned the right column to a fixed 372px while its contents were
 * taller, so the primary CTA escaped its column and overlapped the panel below
 * it — the overflow the user reported.
 */
export function HomeScreen() {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const tp = useTranslations("portfolio");
  const { open, revision } = useTradeSheet();
  const isDesktop = useIsDesktop();
  const router = useRouter();
  const [selected, setSelected] = useState<MetalAsset>("XAU");

  const portfolio = useResource<PortfolioResponse>("/portfolio", { revision });
  // One shared store — the same tick the ticker, chart tag and AI quote read.
  const { anyStale: stale } = usePrices();
  const xau = useAssetPrice("XAU");
  const xpt = useAssetPrice("XPT");

  const data = portfolio.data;

  /** Re-marked at the live tick so Home ≡ Portfolio ≡ ticker at every instant. */
  const held = useMemo(() => {
    const byAsset = new Map<MetalAsset, HoldingDto>();
    for (const h of data?.holdings ?? []) {
      byAsset.set(h.asset, revalueHolding(h, h.asset === "XAU" ? xau : xpt));
    }
    return byAsset;
  }, [data, xau, xpt]);

  const metalCents = [...held.values()].reduce((sum, h) => sum + BigInt(h.valueCents), 0n);
  const cashCents = data ? BigInt(data.etbCents) : 0n;
  const totalCents = data ? metalCents + cashCents : null;

  const costCents = data ? BigInt(data.totalCostBasisCents) : 0n;
  const gainCents = metalCents - costCents;
  const gainPct =
    costCents > 0n ? pctMilli(((gainCents * 100_000n) / costCents).toString()) : null;
  const dir = direction(gainCents);

  const share = (part: bigint) =>
    totalCents && totalCents > 0n ? (Number(part) / Number(totalCents)) * 100 : 0;

  /** On desktop the ticket is a route; on a phone it is a sheet over this page. */
  const trade = (asset: MetalAsset, side: "buy" | "sell") =>
    isDesktop ? router.push(`/trade?asset=${asset}&side=${side}`) : open(asset, side);

  const goldMg = held.get("XAU")?.gramsMg ?? "0";
  const platMg = held.get("XPT")?.gramsMg ?? "0";
  const largest = BigInt(goldMg) >= BigInt(platMg) ? "XAU" : "XPT";
  const largestMg = largest === "XAU" ? goldMg : platMg;

  return (
    <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-12 lg:gap-5">
      {/* Prices stay visible when the feed is late — the last known price with
          an honest timestamp beats an empty screen. The API refuses to quote
          on a stale tick anyway, and says so in its own words. */}
      {stale && (
        <SystemBanner tone="caution" className="mb-0 lg:col-span-12">
          {t("stale")}
        </SystemBanner>
      )}

      {/* ── What you hold ─────────────────────────────────────────── */}
      <Panel className="lg:col-span-4">
        <PanelBody className="pt-4">
          <span className="text-[0.9375rem] leading-relaxed text-muted-foreground">
            {t("totalLabel")}
          </span>
          {totalCents === null ? (
            <Skeleton className="mt-1.5 h-10 w-52" />
          ) : (
            <span className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="tnum text-[2.125rem] font-semibold leading-none tracking-[-0.01em]">
                {money(totalCents)}
              </span>
              <span className="text-base text-muted-foreground">{tc("birr")}</span>
              {costCents > 0n && (
                <span className={cn("tnum ms-auto text-[0.9375rem] font-semibold", deltaClass(dir))}>
                  {ARROW[dir]} {SIGN[dir]}
                  {signedMoney(gainCents.toString())}
                  {gainPct && (
                    <span className="ms-1.5 font-normal">
                      {SIGN[dir]}
                      {gainPct}%
                    </span>
                  )}
                </span>
              )}
            </span>
          )}

          {/* Allocation: metal against cash, the split a holder actually asks about. */}
          <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-well" aria-hidden="true">
            <span className="bg-gold-500" style={{ width: `${share(BigInt(held.get("XAU")?.valueCents ?? "0"))}%` }} />
            <span
              className="bg-platinum-400"
              style={{ width: `${share(BigInt(held.get("XPT")?.valueCents ?? "0"))}%` }}
            />
            <span className="bg-muted-foreground/45" style={{ width: `${share(cashCents)}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.875rem] text-muted-foreground">
            <Legend tone="gold" label={tc("gold")} share={share(BigInt(held.get("XAU")?.valueCents ?? "0"))} />
            <Legend
              tone="platinum"
              label={tc("platinum")}
              share={share(BigInt(held.get("XPT")?.valueCents ?? "0"))}
            />
            <Legend tone="cash" label={t("cash")} share={share(cashCents)} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat
              label={tc("gold")}
              value={data ? grams(goldMg) : null}
              unit={tc("g")}
              tone="gold"
              foot={data ? `${money(held.get("XAU")?.valueCents ?? "0")} ${tc("birr")}` : undefined}
            />
            <Stat
              label={tc("platinum")}
              value={data ? grams(platMg) : null}
              unit={tc("g")}
              tone="platinum"
              foot={data ? `${money(held.get("XPT")?.valueCents ?? "0")} ${tc("birr")}` : undefined}
            />
          </div>
          <Stat
            className="mt-2"
            label={t("cash")}
            value={data ? money(cashCents) : null}
            unit={tc("birr")}
          />

          {/* Money in/out — the Phase 4 doors, beside the balance they change. */}
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Button variant="flat" asChild>
              <Link href="/deposit">{t("depositCta")}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/withdraw">{t("withdrawCta")}</Link>
            </Button>
          </div>
        </PanelBody>
      </Panel>

      <MarketCard
        asset="XAU"
        price={xau}
        holding={held.get("XAU") ?? null}
        selected={selected === "XAU"}
        onSelect={() => setSelected("XAU")}
        onTrade={trade}
        className="lg:col-span-4"
      />
      <MarketCard
        asset="XPT"
        price={xpt}
        holding={held.get("XPT") ?? null}
        selected={selected === "XPT"}
        onSelect={() => setSelected("XPT")}
        onTrade={trade}
        className="lg:col-span-4"
      />

      <PriceChart
        asset={selected}
        className="lg:col-span-8 lg:h-[25rem]"
        chartClassName="h-[160px] lg:h-auto"
      />

      <div className="flex flex-col gap-3.5 lg:col-span-4 lg:gap-4">
        <TrustPanel asset={selected} />
        <PriceAlertButton asset={selected} />
        <Button size="cta" onClick={() => trade(selected, "buy")}>
          {selected === "XAU" ? t("buyGoldCta") : t("buyPlatCta")}
        </Button>
      </div>

      {/* Full width: at col-span-8 the row's remaining four columns sat empty,
          since the next panel is itself eight wide and cannot fit beside it. */}
      <MoveAttribution asset={selected} className="lg:col-span-12" />

      <RecentActivity className="lg:col-span-8" revision={revision} />

      <div className="flex flex-col gap-3.5 lg:col-span-4 lg:gap-4">
        {BigInt(largestMg) > 0n && (
          <Panel>
            <PanelHeader
              title={tp("vaultVisualTitle")}
              action={
                <Link
                  href="/portfolio"
                  className="text-[0.9375rem] text-gold-400 hover:text-gold-300"
                >
                  {t("openPortfolio")} →
                </Link>
              }
            />
            <PanelBody>
              <MetalMass
                asset={largest}
                gramsMg={largestMg}
                label={`${grams(largestMg)} ${tc("g")} ${largest === "XAU" ? tc("gold") : tc("platinum")}`}
              />
            </PanelBody>
          </Panel>
        )}
        {data?.tier.name && <TierProgress tier={data.tier} />}
      </div>
    </div>
  );
}

function Legend({
  tone,
  label,
  share,
}: {
  tone: "gold" | "platinum" | "cash";
  label: string;
  share: number;
}) {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          tone === "gold" && "bg-gold-500",
          tone === "platinum" && "bg-platinum-400",
          tone === "cash" && "bg-muted-foreground/45",
        )}
      />
      {label}
      <span className="tnum font-semibold text-foreground">{share.toFixed(1)}%</span>
    </span>
  );
}

/**
 * One market: the live price, its real 24-hour change, what the viewer holds
 * of it, and the two actions. Selecting a card drives the chart beneath.
 */
function MarketCard({
  asset,
  price,
  holding,
  selected,
  onSelect,
  onTrade,
  className,
}: {
  asset: MetalAsset;
  price: LivePrice | null;
  holding: HoldingDto | null;
  selected: boolean;
  onSelect: () => void;
  onTrade: (asset: MetalAsset, side: "buy" | "sell") => void;
  className?: string;
}) {
  const tc = useTranslations("common");
  const t = useTranslations("home");
  const locale = useLocale();
  const isGold = asset === "XAU";
  // Same canonical 24h change the ticker shows — one number platform-wide.
  const milli = price?.change24hPctMilli ?? null;
  const pct = pctMilli(milli);
  const up = milli !== null && BigInt(milli) > 0n;
  const down = milli !== null && BigInt(milli) < 0n;
  const heldMg = holding?.gramsMg ?? "0";

  return (
    <Panel
      className={cn(
        "transition-colors",
        selected
          ? isGold
            ? "border-gold-500/45"
            : "border-platinum-400/45"
          : "hover:border-input",
        className,
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="flex flex-col gap-3 px-4 pb-3 pt-3.5 text-start outline-none lg:px-5"
      >
        <span className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2.5 text-base font-semibold">
            <span
              aria-hidden="true"
              className={cn(
                "size-2.5 flex-none rounded-full",
                isGold ? "bg-gold-500" : "bg-platinum-400",
              )}
            />
            {isGold ? tc("gold") : tc("platinum")}
            <span className="font-latin text-xs font-medium text-muted-foreground">{asset}</span>
          </span>
          {price && (
            <span className="font-latin text-xs text-subtle">
              {timeOfDay(price.at, locale)} · {price.source}
            </span>
          )}
        </span>

        {price ? (
          <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span
              className={cn(
                "tnum text-[1.75rem] font-semibold leading-none",
                isGold ? "text-gold-400" : "text-platinum-400",
              )}
            >
              {money(price.etbCentsPerGram)}
            </span>
            <span className="text-[0.9375rem] text-muted-foreground">
              {tc("birr")} / {tc("g")}
            </span>
            {pct && (
              <span
                className={cn(
                  "tnum ms-auto text-[0.9375rem] font-semibold",
                  up ? "text-gain" : down ? "text-loss" : "text-muted-foreground",
                )}
              >
                {up ? "↑" : down ? "↓" : "·"} {up ? "+" : down ? "−" : ""}
                {pct}%
                <span className="ms-1.5 font-sans font-normal text-muted-foreground">
                  {t("last24h")}
                </span>
              </span>
            )}
          </span>
        ) : (
          <Skeleton className="h-8 w-40" />
        )}

        <span className="well flex items-baseline justify-between rounded-md px-3.5 py-2.5">
          <span className="text-[0.875rem] text-muted-foreground">{t("youHold")}</span>
          <span className="tnum text-[0.9375rem] font-semibold">
            {grams(heldMg)}
            <span className="ms-1 font-sans font-normal text-muted-foreground">{tc("g")}</span>
            {holding && BigInt(heldMg) > 0n && (
              <span className="ms-2.5 font-sans font-normal text-muted-foreground">
                ≈ {money(holding.valueCents)}
              </span>
            )}
          </span>
        </span>
      </button>

      <PanelBody className="grid grid-cols-2 gap-2.5 pb-4">
        <Button variant="flat" size="sm" onClick={() => onTrade(asset, "buy")}>
          {t("buyShort")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={BigInt(heldMg) === 0n}
          onClick={() => onTrade(asset, "sell")}
        >
          {t("sellShort")}
        </Button>
      </PanelBody>
    </Panel>
  );
}

/** Where this holding sits in the gemstone bands — the same figures Portfolio shows. */
function TierProgress({ tier }: { tier: PortfolioResponse["tier"] }) {
  const t = useTranslations("tier");
  const progress = tier.progressPctMilli ? Number(tier.progressPctMilli) / 1000 : null;
  const name = tier.name && t.has(`names.${tier.name}` as never)
    ? t(`names.${tier.name}` as never)
    : tier.name;
  const next =
    tier.nextName && t.has(`names.${tier.nextName}` as never)
      ? t(`names.${tier.nextName}` as never)
      : tier.nextName;

  return (
    <Panel>
      <PanelBody className="pt-4">
        <div className="flex items-center gap-3">
          <TierMark size={30} />
          <span className="flex flex-col">
            <span className="text-base font-semibold leading-snug">{name}</span>
            <span className="text-[0.875rem] leading-snug text-muted-foreground">
              {t("currentLevel")}
            </span>
          </span>
        </div>
        {progress !== null && next && (
          <>
            <div className="mt-3.5 flex items-baseline justify-between">
              <span className="text-[0.875rem] text-muted-foreground">
                {t("towards", { name: next })}
              </span>
              <span className="tnum text-[0.875rem] font-semibold">{progress.toFixed(0)}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-well">
              <span
                className="block h-full rounded-full bg-platinum-500 transition-[width] duration-200"
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
          </>
        )}
      </PanelBody>
    </Panel>
  );
}

/**
 * The last few orders, on the dashboard because a dealer checks "did it go
 * through" before anything else. A settled row links to its receipt; a refused
 * row says why, right here, without a tap.
 */
function RecentActivity({ className, revision }: { className?: string; revision: number }) {
  const t = useTranslations("home");
  const { data, loading } = useResource<OrderListResponse>("/orders?limit=6", { revision });

  const orders = data?.orders ?? [];
  if (loading) return <Skeleton className={cn("h-64 rounded-lg", className)} />;
  if (orders.length === 0) return null;

  return (
    <Panel className={cn("overflow-hidden", className)}>
      <PanelHeader
        title={t("recentActivity")}
        action={
          <Link href="/history" className="text-[0.9375rem] text-gold-400 hover:text-gold-300">
            {t("viewAll")} →
          </Link>
        }
      />
      <OrdersTable groups={[{ key: "recent", orders }]} />
    </Panel>
  );
}
