"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { OrderListItem, OrderListResponse } from "@alkeva/shared";

import { OrdersTable, type OrderGroup } from "@/components/orders/orders-table";
import { Button } from "@/components/ui/button";
import { Coin, Panel, PanelHeader, Stat, StatStrip } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";
import { dayKey, longDate, money } from "@/lib/format";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { useResource } from "@/lib/use-resource";

const FILTERS = ["all", "buys", "sells", "refused"] as const;
type Filter = (typeof FILTERS)[number];

const PAGE = 50;

/**
 * Every order, grouped by day, newest first — with the four figures a holder
 * actually asks of a statement above it.
 *
 * Rejected rows carry their reason inline: a user should be able to scroll
 * their history and understand every refusal without tapping into it. That is
 * how the platform teaches its own safety rules — and on the demo it is the
 * screen that proves the gates fired rather than the app swallowing them.
 */
export function HistoryScreen() {
  const t = useTranslations("history");
  const tc = useTranslations("common");
  const th = useTranslations("home");
  const locale = useLocale();
  const { open, revision } = useTradeSheet();
  const isDesktop = useIsDesktop();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const { data, loading } = useResource<OrderListResponse>(`/orders?limit=${PAGE}`, {
    revision,
  });

  const orders = useMemo(() => data?.orders ?? [], [data]);

  const shown = useMemo(
    () =>
      orders.filter((o) =>
        filter === "all"
          ? true
          : filter === "buys"
            ? o.side === "buy" && o.status !== "rejected"
            : filter === "sells"
              ? o.side === "sell" && o.status !== "rejected"
              : o.status === "rejected",
      ),
    [orders, filter],
  );

  /** Figures over the window that is actually loaded — the footnote says so. */
  const totals = useMemo(() => {
    let bought = 0n;
    let sold = 0n;
    let settled = 0;
    let refused = 0;
    for (const o of orders) {
      if (o.status === "rejected") refused += 1;
      if (o.status !== "settled") continue;
      settled += 1;
      if (o.side === "buy") bought += BigInt(o.totalCents);
      else sold += BigInt(o.totalCents);
    }
    return { bought, sold, settled, refused };
  }, [orders]);

  const groups = useMemo<OrderGroup[]>(() => {
    const out = new Map<string, OrderListItem[]>();
    for (const o of shown) {
      const key = dayKey(o.createdAt);
      const list = out.get(key);
      if (list) list.push(o);
      else out.set(key, [o]);
    }
    const todayKey = dayKey(new Date().toISOString());
    const yesterdayKey = dayKey(new Date(Date.now() - 86_400_000).toISOString());
    return [...out.entries()].map(([key, list]) => ({
      key,
      label:
        key === todayKey
          ? t("today")
          : key === yesterdayKey
            ? t("yesterday")
            : longDate(list[0]!.createdAt, locale),
      orders: list,
    }));
  }, [shown, t, locale]);

  const counts: Record<Filter, number> = {
    all: orders.length,
    buys: orders.filter((o) => o.side === "buy" && o.status !== "rejected").length,
    sells: orders.filter((o) => o.side === "sell" && o.status !== "rejected").length,
    refused: totals.refused,
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-[4.5rem] rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <Panel className="flex-1 items-center justify-center gap-3 p-8 text-center">
        <span className="flex gap-2">
          <Coin metal="XAU" size="lg" />
          <Coin metal="XPT" size="lg" />
        </span>
        <h2 className="text-[1.125rem] font-bold">{t("emptyTitle")}</h2>
        <p className="max-w-sm text-[0.875rem] text-muted-foreground">{t("emptyBody")}</p>
        <Button onClick={() => (isDesktop ? router.push("/trade") : open("XAU", "buy"))}>
          {th("buyGoldCta")}
        </Button>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <section data-panel="" aria-label={t("title")} className="overflow-hidden rounded-lg border border-border bg-card">
        <StatStrip className="lg:[&>*]:flex-auto">
          <Stat surface="strip" size="lg" label={t("statSettled")} value={String(totals.settled)} />
          <Stat surface="strip" size="lg" label={t("statBought")} value={money(totals.bought)} unit={tc("birr")} />
          <Stat surface="strip" size="lg" label={t("statSold")} value={money(totals.sold)} unit={tc("birr")} />
          <Stat
            surface="strip"
            size="lg"
            label={t("statRefused")}
            value={String(totals.refused)}
            tone={totals.refused > 0 ? "loss" : undefined}
          />
        </StatStrip>
      </section>

      <Panel aria-label={t("title")}>
        <PanelHeader
          title={t("title")}
          hint={t("scopeNote", { count: orders.length })}
          action={
            <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
              <Segmented
                value={filter}
                onValueChange={setFilter}
                aria-label={t("title")}
                options={FILTERS.map((f) => ({ value: f, label: t(`filter.${f}` as never), count: counts[f] }))}
              />
            </div>
          }
        />
        <div className="border-t border-border">
          {shown.length === 0 ? (
            <p className="px-4 py-10 text-center text-[0.875rem] text-muted-foreground">{t("filterEmpty")}</p>
          ) : (
            <OrdersTable groups={groups} showSerial />
          )}
        </div>
      </Panel>
    </div>
  );
}
