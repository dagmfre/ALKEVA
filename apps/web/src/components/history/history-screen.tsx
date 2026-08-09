"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { OrderListItem, OrderListResponse } from "@alkeva/shared";

import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";
import { dayKey, grams, longDate, money, timeOfDay } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

const KNOWN_ERRORS = new Set([
  "quote_expired",
  "quote_consumed",
  "account_frozen",
  "insufficient_balance",
  "insufficient_metal",
  "reserve_halt",
  "float_halt",
  "sellback_ceiling",
  "tier_txn_cap",
  "tier_daily_cap",
  "amount_too_small",
]);

/**
 * A divided list, not a stack of cards, grouped by day.
 *
 * Rejected rows carry their reason inline: a user should be able to scroll
 * their history and understand every refusal without tapping into it. That is
 * how the platform teaches its own safety rules.
 */
export function HistoryScreen() {
  const t = useTranslations("history");
  const tc = useTranslations("common");
  const tt = useTranslations("trade");
  const th = useTranslations("home");
  const locale = useLocale();
  const { open, revision } = useTradeSheet();
  const { data, loading } = useResource<OrderListResponse>("/orders?limit=50", { revision });

  const groups = useMemo(() => {
    const out = new Map<string, OrderListItem[]>();
    for (const o of data?.orders ?? []) {
      const key = dayKey(o.createdAt);
      const list = out.get(key);
      if (list) list.push(o);
      else out.set(key, [o]);
    }
    return [...out.entries()];
  }, [data]);

  if (loading) {
    return (
      <>
        <Skeleton className="mb-3.5 mt-1 h-8 w-28" />
        <Card className="p-4">
          <Skeleton className="mb-3 h-6 w-full" />
          <Skeleton className="mb-3 h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </Card>
      </>
    );
  }

  if (groups.length === 0) {
    return (
      <>
        <h1 className="mb-3.5 mt-1 text-2xl font-semibold">{t("title")}</h1>
        <Card className="p-5">
          <CardTitle className="mb-1">{t("emptyTitle")}</CardTitle>
          <p className="mb-3.5 text-[0.9375rem] text-muted-foreground">{t("emptyBody")}</p>
          <Button size="cta" onClick={() => open("XAU", "buy")}>
            {th("buyGoldCta")}
          </Button>
        </Card>
      </>
    );
  }

  const todayKey = dayKey(new Date().toISOString());
  const yesterdayKey = dayKey(new Date(Date.now() - 86_400_000).toISOString());

  return (
    <>
      <h1 className="mb-3.5 mt-1 text-2xl font-semibold">{t("title")}</h1>

      {groups.map(([key, orders]) => (
        <section key={key} className="mb-4">
          <h2 className="pb-1.5 text-[0.9375rem] font-normal text-muted-foreground">
            {key === todayKey
              ? t("today")
              : key === yesterdayKey
                ? t("yesterday")
                : longDate(orders[0]!.createdAt, locale)}
          </h2>
          <Card className="overflow-hidden">
            {orders.map((o, i) => {
              const metal = o.asset === "XAU" ? tc("gold") : tc("platinum");
              const label =
                o.side === "buy" ? t("buyLabel", { metal }) : t("sellLabel", { metal });
              const reason =
                o.failureReason && KNOWN_ERRORS.has(o.failureReason)
                  ? tt(`errors.${o.failureReason}` as never)
                  : null;

              const body = (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-base font-medium">
                      {label} · <span className="tnum">{grams(o.gramsMg)}</span> {tc("g")}
                    </span>
                    <span
                      className={cn(
                        "tnum text-base font-semibold",
                        o.status === "rejected" && "text-subtle",
                      )}
                    >
                      {money(o.totalCents)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-3">
                    <StatusLabel status={o.status} />
                    <span className="tnum text-[0.8125rem] text-subtle">
                      {timeOfDay(o.createdAt, locale)}
                    </span>
                  </div>
                  {reason && (
                    <p className="mt-1 text-[0.9375rem] text-muted-foreground">{reason}</p>
                  )}
                </>
              );

              const cls = cn(
                "block w-full px-4 py-3.5 text-start",
                i < orders.length - 1 && "border-b border-border",
              );

              return o.status === "settled" ? (
                <Link key={o.id} href={`/receipt/${o.id}`} className={cn(cls, "hover:bg-popover/50")}>
                  {body}
                </Link>
              ) : (
                <div key={o.id} className={cls}>
                  {body}
                </div>
              );
            })}
          </Card>
        </section>
      ))}
    </>
  );
}

function StatusLabel({ status }: { status: OrderListItem["status"] }) {
  const t = useTranslations("history");
  if (status === "settled")
    return <span className="text-[0.9375rem] text-gain">✓ {t("settled")}</span>;
  if (status === "review")
    return <span className="text-[0.9375rem] text-platinum-400">◑ {t("review")}</span>;
  if (status === "rejected")
    return <span className="text-[0.9375rem] text-loss">▲ {t("rejected")}</span>;
  return <span className="text-[0.9375rem] text-muted-foreground">{t("created")}</span>;
}
