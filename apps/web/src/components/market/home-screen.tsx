"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type {
  BalancesResponse,
  MetalAsset,
  OrderListResponse,
  PriceLatestResponse,
} from "@alkeva/shared";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PriceChart } from "@/components/market/price-chart";
import { TrustPanel } from "@/components/market/trust-panel";
import { SystemBanner } from "@/components/system/banner";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";
import { KNOWN_ERRORS } from "@/components/trade/use-trade-form";
import { grams, money, signedPct, timeOfDay } from "@/lib/format";
import { usePriceSeries } from "@/lib/use-price-series";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";
import { PRICE_TICK_MS } from "@/lib/constants";
import { useIsDesktop } from "@/lib/use-is-desktop";

/**
 * The dashboard.
 *
 * On a wide screen this is a 12-column workspace — holdings, both metals, the
 * chart, the vault panel and recent activity all visible at once, because a
 * dealer's home screen is a status board, not a scroll. Below 1024px the same
 * blocks stack into one column. Nothing is desktop-only: the phone gets every
 * figure, just in sequence.
 */
export function HomeScreen() {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const { open, revision } = useTradeSheet();
  const isDesktop = useIsDesktop();
  const router = useRouter();
  const [selected, setSelected] = useState<MetalAsset>("XAU");

  const balances = useResource<BalancesResponse>("/ledger/balances", { revision });
  const xau = useResource<PriceLatestResponse>("/prices/latest?asset=XAU", {
    intervalMs: PRICE_TICK_MS,
  });
  const xpt = useResource<PriceLatestResponse>("/prices/latest?asset=XPT", {
    intervalMs: PRICE_TICK_MS,
  });

  const stale = Boolean(xau.data?.stale || xpt.data?.stale);
  const totalCents =
    balances.data && xau.data && xpt.data
      ? (
          BigInt(balances.data.etbCents) +
          (BigInt(xau.data.etbCentsPerGram) * BigInt(balances.data.xauMg)) / 1000n +
          (BigInt(xpt.data.etbCentsPerGram) * BigInt(balances.data.xptMg)) / 1000n
        ).toString()
      : null;

  /** On desktop the ticket is a route; on a phone it is a sheet over this page. */
  const trade = (asset: MetalAsset) =>
    isDesktop ? router.push(`/trade?asset=${asset}&side=buy`) : open(asset, "buy");

  return (
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12 lg:gap-5">
      {/* Prices stay visible when the feed is late — the last known price with
          an honest timestamp beats an empty screen. The API refuses to quote
          on a stale tick anyway, and says so in its own words. */}
      {stale && (
        <SystemBanner tone="caution" className="mb-0 lg:col-span-12">
          {t("stale")}
        </SystemBanner>
      )}

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 lg:col-span-4 lg:p-5">
        <span className="text-[0.9375rem] leading-relaxed text-muted-foreground">
          {t("totalLabel")}
        </span>
        {totalCents === null ? (
          <Skeleton className="h-10 w-52" />
        ) : (
          <span className="flex items-baseline gap-2">
            <span className="tnum text-[2.125rem] font-semibold leading-none tracking-[-0.01em]">
              {money(totalCents)}
            </span>
            <span className="text-base text-muted-foreground">{tc("birr")}</span>
          </span>
        )}
        <div className="grid grid-cols-3 gap-2">
          <Holding
            label={tc("gold")}
            value={balances.data ? grams(balances.data.xauMg) : null}
            unit={tc("g")}
          />
          <Holding
            label={tc("platinum")}
            value={balances.data ? grams(balances.data.xptMg) : null}
            unit={tc("g")}
          />
          <Holding
            label={tc("birr")}
            value={balances.data ? money(balances.data.etbCents) : null}
          />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3.5 lg:col-span-8 lg:grid-cols-2 lg:gap-5">
        <PriceCard
          asset="XAU"
          price={xau.data}
          selected={selected === "XAU"}
          onSelect={() => setSelected("XAU")}
        />
        <PriceCard
          asset="XPT"
          price={xpt.data}
          selected={selected === "XPT"}
          onSelect={() => setSelected("XPT")}
        />
      </div>

      <PriceChart
        asset={selected}
        className="lg:col-span-8 lg:h-[372px]"
        chartClassName="h-[150px] lg:h-auto"
      />

      <div className="flex flex-col gap-3.5 lg:col-span-4 lg:h-[372px] lg:gap-4">
        <TrustPanel asset={selected} className="lg:flex-1" />
        <Button size="cta" className="flex-none" onClick={() => trade(selected)}>
          {selected === "XAU" ? t("buyGoldCta") : t("buyPlatCta")}
        </Button>
      </div>

      <RecentActivity className="lg:col-span-12" desktop={isDesktop} />
    </div>
  );
}

function Holding({ label, value, unit }: { label: string; value: string | null; unit?: string }) {
  return (
    <div className="well flex flex-col gap-0.5 rounded-md px-2.5 py-2">
      <span className="text-[0.9375rem] leading-snug text-muted-foreground">{label}</span>
      {value === null ? (
        <Skeleton className="mt-1 h-4 w-14" />
      ) : (
        <span className="tnum text-[0.9375rem] font-semibold">
          {value}
          {unit && (
            <span className="ms-1 font-sans font-normal text-muted-foreground">{unit}</span>
          )}
        </span>
      )}
    </div>
  );
}

function PriceCard({
  asset,
  price,
  selected,
  onSelect,
}: {
  asset: MetalAsset;
  price: PriceLatestResponse | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const tc = useTranslations("common");
  const t = useTranslations("home");
  const locale = useLocale();
  const series = usePriceSeries(asset, "24h");
  const isGold = asset === "XAU";
  const pct = signedPct(series.changePct);
  const up = (series.changePct ?? 0) > 0;
  const down = (series.changePct ?? 0) < 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex flex-col justify-between gap-2.5 rounded-lg border px-4 py-3.5 text-start transition-colors lg:px-5 lg:py-4",
        selected
          ? cn("bg-popover", isGold ? "border-gold-500/45" : "border-platinum-400/45")
          : "border-border bg-card hover:border-input",
      )}
    >
      <span className="flex items-center gap-2.5 text-base font-semibold">
        <span
          className={cn("size-2.5 flex-none rounded-full", isGold ? "bg-gold-500" : "bg-platinum-400")}
        />
        {isGold ? tc("gold") : tc("platinum")}
        <span className="font-latin text-xs font-medium text-muted-foreground">{asset}</span>
      </span>

      {price ? (
        <span className="flex items-baseline gap-2.5">
          <span
            className={cn(
              "tnum text-2xl font-semibold lg:text-[1.75rem]",
              isGold ? "text-gold-400" : "text-platinum-400",
            )}
          >
            {money(price.etbCentsPerGram)}
          </span>
          <span className="text-[0.9375rem] text-muted-foreground">
            {tc("birr")} / {tc("g")}
          </span>
        </span>
      ) : (
        <Skeleton className="h-8 w-32" />
      )}

      <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {pct ? (
          <span
            className={cn(
              "tnum text-[0.9375rem] font-semibold",
              up ? "text-gain" : down ? "text-loss" : "text-muted-foreground",
            )}
          >
            {up ? "↑" : down ? "↓" : "·"} {pct}%
            <span className="ms-2 font-sans font-normal text-muted-foreground">{t("last24h")}</span>
          </span>
        ) : (
          <span />
        )}
        {price && (
          <span className="font-latin text-xs text-subtle">
            {timeOfDay(price.at, locale)} · {price.source}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * The last few orders, on the dashboard because a dealer checks "did it go
 * through" before anything else. A settled row links to its receipt; a refused
 * row says why, right here, without a tap.
 */
function RecentActivity({ className, desktop }: { className?: string; desktop: boolean }) {
  const t = useTranslations("home");
  const th = useTranslations("history");
  const tc = useTranslations("common");
  const tt = useTranslations("trade");
  const locale = useLocale();
  const { revision } = useTradeSheet();
  const { data, loading } = useResource<OrderListResponse>("/orders?limit=5", { revision });

  const orders = data?.orders ?? [];
  if (loading) return <Skeleton className={cn("h-32 rounded-lg", className)} />;
  if (orders.length === 0) return null;

  return (
    <section className={cn("rounded-lg border border-border bg-card px-4 pb-2 lg:px-5", className)}>
      <div className="flex items-center justify-between py-3">
        <h2 className="text-[1.125rem] font-semibold">{t("recentActivity")}</h2>
        <Link href="/history" className="text-[0.9375rem] text-gold-400 hover:text-gold-300">
          {t("viewAll")} →
        </Link>
      </div>

      {orders.map((o) => {
        const metal = o.asset === "XAU" ? tc("gold") : tc("platinum");
        const label = o.side === "buy" ? th("buyLabel", { metal }) : th("sellLabel", { metal });
        const reason =
          o.failureReason && KNOWN_ERRORS.has(o.failureReason)
            ? tt(`errors.${o.failureReason}` as never)
            : null;

        return (
          <div
            key={o.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border py-3"
          >
            <span className="flex flex-[1.4] items-center gap-2.5 text-base">
              <span
                className={cn(
                  "size-2 flex-none rounded-full",
                  o.asset === "XAU" ? "bg-gold-500" : "bg-platinum-400",
                )}
              />
              {label}
            </span>
            <span className="tnum flex-1 text-[0.9375rem] text-muted-foreground">
              {grams(o.gramsMg)} <span className="font-sans">{tc("g")}</span>
            </span>
            <span className="tnum flex-1 text-end text-base font-semibold">
              {money(o.totalCents)}
            </span>
            <span className="flex-1 text-end">
              <StatusChip status={o.status} />
            </span>
            {desktop && (
              <>
                <span className="font-latin flex-[0.7] text-end text-[0.8125rem] text-subtle">
                  {timeOfDay(o.createdAt, locale)}
                </span>
                <span className="flex-[0.7] text-end">
                  {o.status === "settled" && (
                    <Link
                      href={`/receipt/${o.id}`}
                      className="text-[0.9375rem] text-gold-400 hover:text-gold-300"
                    >
                      {t("receipt")}
                    </Link>
                  )}
                </span>
              </>
            )}
            {reason && (
              <span className="w-full text-[0.9375rem] text-muted-foreground">{reason}</span>
            )}
          </div>
        );
      })}
    </section>
  );
}

function StatusChip({ status }: { status: "created" | "review" | "settled" | "rejected" }) {
  const t = useTranslations("history");
  if (status === "settled")
    return <span className="text-[0.9375rem] text-gain">✓ {t("settled")}</span>;
  if (status === "review")
    return <span className="text-[0.9375rem] text-platinum-400">◑ {t("review")}</span>;
  if (status === "rejected")
    return <span className="text-[0.9375rem] text-loss">✕ {t("rejected")}</span>;
  return <span className="text-[0.9375rem] text-muted-foreground">{t("created")}</span>;
}
