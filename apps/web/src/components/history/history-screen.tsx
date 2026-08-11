"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { OrderListItem, OrderListResponse } from "@alkeva/shared";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";
import { KNOWN_ERRORS } from "@/components/trade/use-trade-form";
import { dayKey, grams, longDate, money, timeOfDay } from "@/lib/format";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/**
 * Every order, grouped by day, newest first.
 *
 * Rejected rows carry their reason inline: a user should be able to scroll
 * their history and understand every refusal without tapping into it. That is
 * how the platform teaches its own safety rules — and on the demo it is the
 * screen that proves the gates fired rather than the app swallowing them.
 */
export function HistoryScreen() {
  const t = useTranslations("history");
  const th = useTranslations("home");
  const { open, revision } = useTradeSheet();
  const isDesktop = useIsDesktop();
  const router = useRouter();
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
      <div className="flex flex-col gap-3.5">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="mx-auto max-w-[36rem] rounded-lg border border-border bg-card p-5">
        <h2 className="text-[1.125rem] font-semibold">{t("emptyTitle")}</h2>
        <p className="mb-3.5 mt-1 text-[0.9375rem] text-muted-foreground">{t("emptyBody")}</p>
        <Button
          size="cta"
          onClick={() => (isDesktop ? router.push("/trade") : open("XAU", "buy"))}
        >
          {th("buyGoldCta")}
        </Button>
      </div>
    );
  }

  const todayKey = dayKey(new Date().toISOString());
  const yesterdayKey = dayKey(new Date(Date.now() - 86_400_000).toISOString());

  return (
    <div className="mx-auto flex max-w-[64rem] flex-col gap-4 lg:mx-0 lg:max-w-none">
      {groups.map(([key, orders]) => (
        <section key={key}>
          <h2 className="pb-1.5 text-[0.9375rem] font-normal text-muted-foreground">
            {key === todayKey
              ? t("today")
              : key === yesterdayKey
                ? t("yesterday")
                : longDate(orders[0]!.createdAt, "en")}
          </h2>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {orders.map((o, i) => (
              <OrderRow key={o.id} order={o} divided={i < orders.length - 1} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * One row, two compositions: a table line on a wide screen, a two-line block
 * on a phone. Same data in both — the phone never gets an abridged truth.
 */
export function OrderRow({ order: o, divided }: { order: OrderListItem; divided?: boolean }) {
  const t = useTranslations("history");
  const tc = useTranslations("common");
  const tt = useTranslations("trade");
  const locale = useLocale();

  const metal = o.asset === "XAU" ? tc("gold") : tc("platinum");
  const label = o.side === "buy" ? t("buyLabel", { metal }) : t("sellLabel", { metal });
  const reason =
    o.failureReason && KNOWN_ERRORS.has(o.failureReason)
      ? tt(`errors.${o.failureReason}` as never)
      : null;

  const inner = (
    <>
      <span className="flex items-center gap-2.5 text-base font-medium lg:flex-[1.4]">
        <span
          className={cn(
            "size-2 flex-none rounded-full",
            o.asset === "XAU" ? "bg-gold-500" : "bg-platinum-400",
          )}
        />
        {label}
      </span>

      <span className="tnum order-3 text-[0.9375rem] text-muted-foreground lg:order-none lg:flex-1">
        {grams(o.gramsMg)} <span className="font-sans">{tc("g")}</span>
      </span>

      <span
        className={cn(
          "tnum text-end text-base font-semibold lg:flex-1",
          o.status === "rejected" && "text-subtle",
        )}
      >
        {money(o.totalCents)}
      </span>

      <span className="order-4 lg:order-none lg:flex-1 lg:text-end">
        <StatusLabel status={o.status} />
      </span>

      <span className="font-latin order-5 text-end text-[0.8125rem] text-subtle lg:order-none lg:flex-[0.7]">
        {timeOfDay(o.createdAt, locale)}
      </span>

      <span className="hidden lg:block lg:flex-[0.7] lg:text-end">
        {o.receiptSerial && (
          <span className="text-[0.9375rem] text-gold-400">{t("receiptLink")}</span>
        )}
      </span>

      {reason && (
        <span className="order-6 w-full text-[0.9375rem] text-muted-foreground lg:order-none">
          {reason}
        </span>
      )}
    </>
  );

  const cls = cn(
    "grid grid-cols-2 items-center gap-x-4 gap-y-1 px-4 py-3.5 lg:flex lg:gap-4 lg:px-5",
    divided && "border-b border-border",
  );

  return o.status === "settled" ? (
    <Link href={`/receipt/${o.id}`} className={cn(cls, "transition-colors hover:bg-popover/50")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function StatusLabel({ status }: { status: OrderListItem["status"] }) {
  const t = useTranslations("history");
  if (status === "settled")
    return <span className="text-[0.9375rem] text-gain">✓ {t("settled")}</span>;
  if (status === "review")
    return <span className="text-[0.9375rem] text-platinum-400">◑ {t("review")}</span>;
  if (status === "rejected")
    return <span className="text-[0.9375rem] text-loss">✕ {t("rejected")}</span>;
  return <span className="text-[0.9375rem] text-muted-foreground">{t("created")}</span>;
}
