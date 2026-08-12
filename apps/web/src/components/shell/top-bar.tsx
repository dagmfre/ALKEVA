"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { BalancesResponse, MeResponse, MetalAsset } from "@alkeva/shared";

import { AssistantLink, NotificationsBell } from "@/components/shell/header-actions";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { usePageTitle } from "@/components/shell/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { eatStamp, money, signedPct } from "@/lib/format";
import { usePriceSeries } from "@/lib/use-price-series";
import { useResource } from "@/lib/use-resource";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";
import { cn } from "@/lib/utils";

/**
 * The desktop top bar (≥1024px): where am I, what is the market doing, what do
 * I hold, who am I.
 *
 * The ticker is the reason this bar exists — on a trading desk the price is
 * never more than one glance away, on every screen. Both metals and their real
 * 24-hour change are derived from stored ticks, so a quiet day shows a small
 * number rather than a decorative one.
 */
export function TopBar() {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const title = usePageTitle();
  const { revision } = useTradeSheet();

  const balances = useResource<BalancesResponse>("/ledger/balances", { revision });
  const me = useResource<MeResponse>("/auth/me");

  return (
    <header className="hidden min-h-[78px] items-center gap-6 border-b border-border px-8 lg:flex">
      <span className="flex flex-col">
        <span className="text-xl font-semibold leading-[1.4]">{title}</span>
        <Clock />
      </span>

      <span className="h-9 w-px bg-border" aria-hidden="true" />

      <Ticker asset="XAU" label={tc("gold")} />
      <Ticker asset="XPT" label={tc("platinum")} />

      <span className="ms-auto flex items-center gap-2.5">
        <AssistantLink />
        <NotificationsBell />
        <LocaleToggle />
        <span className="inline-flex min-h-10 items-center gap-2.5 rounded-full border border-input px-3.5 text-[0.9375rem]">
          <span className="text-muted-foreground">{tc("birr")}</span>
          {balances.data ? (
            <span className="tnum font-semibold">{money(balances.data.etbCents)}</span>
          ) : (
            <Skeleton className="h-4 w-20" />
          )}
        </span>
        <span className="inline-flex min-h-10 items-center gap-2.5 rounded-full border border-border py-1 pe-3 ps-1">
          <span className="grid size-8 place-items-center rounded-full border border-input bg-popover text-[0.9375rem] font-semibold">
            {me.data?.fullName?.trim().charAt(0) ?? "·"}
          </span>
          <span className="max-w-[9rem] truncate text-[0.9375rem]">
            {me.data?.fullName ?? ""}
          </span>
        </span>
      </span>
    </header>
  );
}

/**
 * Rendered only after mount: the server has no viewer clock, and stamping one
 * during SSR is a hydration mismatch waiting to happen. Ticks each minute.
 */
function Clock() {
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    const write = () => setNow(eatStamp(new Date()));
    write();
    const id = setInterval(write, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="font-latin whitespace-nowrap text-[0.71875rem] text-subtle">
      {now ?? " "}
    </span>
  );
}

function Ticker({ asset, label }: { asset: MetalAsset; label: string }) {
  const tc = useTranslations("common");
  const series = usePriceSeries(asset, "24h");
  const pct = signedPct(series.changePct);
  const up = (series.changePct ?? 0) > 0;
  const down = (series.changePct ?? 0) < 0;

  return (
    <span className="flex flex-col gap-px">
      <span className="text-[0.9375rem] leading-normal text-muted-foreground">
        {label} · {tc("perGram")}
      </span>
      {series.current ? (
        <span className="flex items-baseline gap-2">
          <span className="tnum text-base font-semibold">{money(series.current)}</span>
          {pct && (
            <span
              className={cn(
                "tnum text-[0.8125rem] font-semibold",
                up ? "text-gain" : down ? "text-loss" : "text-muted-foreground",
              )}
            >
              {up ? "↑" : down ? "↓" : "·"} {pct}%
            </span>
          )}
        </span>
      ) : (
        <Skeleton className="h-5 w-28" />
      )}
    </span>
  );
}
