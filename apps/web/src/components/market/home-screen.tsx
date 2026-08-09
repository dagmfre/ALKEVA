"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { BalancesResponse, MetalAsset, PriceLatestResponse } from "@alkeva/shared";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PriceChart } from "@/components/market/price-chart";
import { TrustPanel } from "@/components/market/trust-panel";
import { SystemBanner } from "@/components/system/banner";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";
import { grams, money, timeOfDay } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";
import { PRICE_TICK_MS } from "@/lib/constants";

export function HomeScreen() {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { open, revision } = useTradeSheet();
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

  return (
    <>
      {/* Prices stay visible when the feed is late — the last known price with
          an honest timestamp beats an empty screen. The API refuses to quote
          on a stale tick anyway, and says so in its own words. */}
      {stale && <SystemBanner tone="caution">{t("stale")}</SystemBanner>}

      <Card className="mb-3.5 p-4">
        <div className="text-[0.9375rem] text-muted-foreground">{t("totalLabel")}</div>
        {totalCents === null ? (
          <Skeleton className="my-1.5 h-9 w-48" />
        ) : (
          <div className="tnum my-0.5 mb-3 text-[2.25rem] font-semibold leading-[1.1] tracking-[-0.01em]">
            {money(totalCents)}
            <span className="ms-1.5 font-sans text-base font-medium tracking-normal text-muted-foreground">
              {tc("birr")}
            </span>
          </div>
        )}
        <div className="flex gap-6 border-t border-border pt-3">
          <Holding label={tc("gold")} value={balances.data ? `${grams(balances.data.xauMg)}` : null} unit={tc("g")} />
          <Holding label={tc("platinum")} value={balances.data ? `${grams(balances.data.xptMg)}` : null} unit={tc("g")} />
          <Holding label={tc("birr")} value={balances.data ? money(balances.data.etbCents) : null} />
        </div>
      </Card>

      <PriceCard
        asset="XAU"
        label={tc("gold")}
        price={xau.data}
        selected={selected === "XAU"}
        onSelect={() => setSelected("XAU")}
        locale={locale}
        perGram={tc("perGram")}
        updated={tc("updated")}
      />
      <PriceCard
        asset="XPT"
        label={tc("platinum")}
        price={xpt.data}
        selected={selected === "XPT"}
        onSelect={() => setSelected("XPT")}
        locale={locale}
        perGram={tc("perGram")}
        updated={tc("updated")}
      />

      <PriceChart asset={selected} />
      <TrustPanel asset={selected} />

      <Button size="cta" onClick={() => open(selected, "buy")}>
        {selected === "XAU" ? t("buyGoldCta") : t("buyPlatCta")}
      </Button>
    </>
  );
}

function Holding({ label, value, unit }: { label: string; value: string | null; unit?: string }) {
  return (
    <div>
      <div className="text-[0.9375rem] text-muted-foreground">{label}</div>
      {value === null ? (
        <Skeleton className="mt-1 h-5 w-16" />
      ) : (
        <div className="tnum text-[1.0625rem] font-semibold">
          {value}
          {unit && (
            <span className="ms-1 font-sans text-sm font-normal text-muted-foreground">{unit}</span>
          )}
        </div>
      )}
    </div>
  );
}

function PriceCard({
  asset,
  label,
  price,
  selected,
  onSelect,
  locale,
  perGram,
  updated,
}: {
  asset: MetalAsset;
  label: string;
  price: PriceLatestResponse | null;
  selected: boolean;
  onSelect: () => void;
  locale: string;
  perGram: string;
  updated: string;
}) {
  const accent = asset === "XAU" ? "text-gold-400" : "text-platinum-400";
  const dot = asset === "XAU" ? "bg-gold-500" : "bg-platinum-400";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "mb-2.5 block w-full rounded-lg border bg-card px-4 py-3.5 text-start transition-colors",
        selected ? "border-gold-500/55" : "border-border hover:border-input",
      )}
    >
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-2 text-base font-medium">
          <span className={cn("size-2 flex-none rounded-full", dot)} />
          {label}
        </span>
        {price ? (
          <span className={cn("tnum text-2xl font-semibold", accent)}>
            {money(price.etbCentsPerGram)}
          </span>
        ) : (
          <Skeleton className="h-7 w-28" />
        )}
      </div>
      <div className="mt-1 text-[0.9375rem] text-muted-foreground">{perGram}</div>
      {price && (
        <div className="mt-1 text-[0.9375rem] text-subtle">
          {updated} {timeOfDay(price.at, locale)} · {price.source}
        </div>
      )}
    </button>
  );
}
