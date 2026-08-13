"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type {
  AdminAnalyticsResponse,
  AdminOverviewResponse,
  MeResponse,
} from "@alkeva/shared";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import { CHART, ChartContainer, ChartTooltip, RechartsTooltip } from "@/components/ui/chart";
import { money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/**
 * The control room's front page: the four "is anything waiting on a human?"
 * cards, then thirty days of the platform's pulse — trade volume, money in
 * vs out, and user growth — drawn from the same ledgered records the audit
 * trail proves. Administrator sees everything; compliance and finance see
 * their own queues.
 */
export function AdminOverviewScreen() {
  const t = useTranslations("admin");
  const me = useResource<MeResponse>("/auth/me");
  const { data } = useResource<AdminOverviewResponse>("/admin/overview", {
    intervalMs: 30_000,
  });
  const analytics = useResource<AdminAnalyticsResponse>("/admin/analytics?days=30", {
    intervalMs: 60_000,
  });
  const role = me.data?.role;
  const isAdmin = role === "administrator";

  const cards: { key: keyof AdminOverviewResponse; href: string; visible: boolean }[] = [
    { key: "pendingKyc", href: "/admin/kyc", visible: isAdmin || role === "compliance" },
    { key: "pendingPayouts", href: "/admin/payouts", visible: isAdmin || role === "finance" },
    { key: "openReviews", href: "/admin/reviews", visible: isAdmin || role === "compliance" },
    { key: "frozenUsers", href: "/admin/users", visible: role !== "finance" },
  ];

  const points = useMemo(
    () =>
      (analytics.data?.points ?? []).map((p) => ({
        day: p.day,
        buy: Number(BigInt(p.buyCents)) / 100,
        sell: Number(BigInt(p.sellCents)) / 100,
        deposits: Number(BigInt(p.depositCents)) / 100,
        payouts: Number(BigInt(p.payoutCents)) / 100,
        users: p.newUsers,
      })),
    [analytics.data],
  );
  const totals = analytics.data?.totals ?? null;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold">{t("nav.overview")}</h1>

      {/* Action cards — the queue counters, gold when someone is waiting. */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {cards.map((card) => {
          const value = data ? data[card.key] : null;
          const body = (
            <div
              className={cn(
                "flex flex-col gap-1 rounded-lg border border-border bg-card p-4",
                card.visible && "hover:border-input",
              )}
            >
              <span className="text-[0.875rem] text-muted-foreground">
                {t(`overview.${card.key}` as never)}
              </span>
              {value === null ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <span
                  className={cn(
                    "tnum text-[1.75rem] font-semibold",
                    value > 0 ? "text-gold-400" : "text-foreground",
                  )}
                >
                  {value}
                </span>
              )}
            </div>
          );
          return card.visible ? (
            <Link key={card.key} href={card.href}>
              {body}
            </Link>
          ) : (
            <div key={card.key}>{body}</div>
          );
        })}
      </div>

      {/* 30-day totals — the numbers a visitor asks for first. */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-5">
        <Stat label={t("overview.tradeVolume30d")} value={totals ? money(totals.tradeCents) : null} unit="ETB" gold />
        <Stat label={t("overview.settledOrders30d")} value={totals ? String(totals.settledOrders) : null} />
        <Stat label={t("overview.moneyIn30d")} value={totals ? money(totals.depositCents) : null} unit="ETB" />
        <Stat label={t("overview.moneyOut30d")} value={totals ? money(totals.payoutCents) : null} unit="ETB" />
        <Stat label={t("overview.newUsers30d")} value={totals ? String(totals.newUsers) : null} />
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2 lg:gap-5">
        {/* Trade volume: buy vs sell, stacked by day. */}
        <ChartPanel
          title={t("overview.chartTrade")}
          legend={[
            { label: t("overview.seriesBuy"), color: CHART.gold },
            { label: t("overview.seriesSell"), color: CHART.platinum },
          ]}
          loading={analytics.loading}
          empty={points.length === 0}
          emptyLabel={t("overview.noData")}
        >
          <BarChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid stroke={CHART.grid} strokeOpacity={0.6} vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={shortDay}
              tick={{ fill: CHART.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
            />
            <YAxis
              tickFormatter={(v: number) => v.toLocaleString("en-US")}
              tick={{ fill: CHART.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={72}
            />
            <RechartsTooltip
              cursor={{ fill: "var(--popover)", opacity: 0.5 }}
              content={<ChartTooltip formatter={etb} labelFormatter={shortDay} />}
            />
            <Bar dataKey="buy" name={t("overview.seriesBuy")} stackId="v" fill={CHART.gold} stroke="var(--card)" strokeWidth={1} />
            <Bar dataKey="sell" name={t("overview.seriesSell")} stackId="v" fill={CHART.platinum} stroke="var(--card)" strokeWidth={1} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartPanel>

        {/* Money in vs out, paired by day. */}
        <ChartPanel
          title={t("overview.chartMoney")}
          legend={[
            { label: t("overview.seriesIn"), color: CHART.gold },
            { label: t("overview.seriesOut"), color: CHART.platinum },
          ]}
          loading={analytics.loading}
          empty={points.length === 0}
          emptyLabel={t("overview.noData")}
        >
          <BarChart data={points} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid stroke={CHART.grid} strokeOpacity={0.6} vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={shortDay}
              tick={{ fill: CHART.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
            />
            <YAxis
              tickFormatter={(v: number) => v.toLocaleString("en-US")}
              tick={{ fill: CHART.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={72}
            />
            <RechartsTooltip
              cursor={{ fill: "var(--popover)", opacity: 0.5 }}
              content={<ChartTooltip formatter={etb} labelFormatter={shortDay} />}
            />
            <Bar dataKey="deposits" name={t("overview.seriesIn")} fill={CHART.gold} radius={[3, 3, 0, 0]} />
            <Bar dataKey="payouts" name={t("overview.seriesOut")} fill={CHART.platinum} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartPanel>

        {/* User growth — single series, the title carries identity. */}
        <ChartPanel
          title={t("overview.chartUsers")}
          loading={analytics.loading}
          empty={points.length === 0}
          emptyLabel={t("overview.noData")}
          className="lg:col-span-2"
          height={180}
        >
          <LineChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid stroke={CHART.grid} strokeOpacity={0.6} vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={shortDay}
              tick={{ fill: CHART.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: CHART.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <RechartsTooltip
              cursor={{ stroke: CHART.grid }}
              content={
                <ChartTooltip formatter={(v) => String(v)} labelFormatter={shortDay} />
              }
            />
            <Line
              type="monotone"
              dataKey="users"
              name={t("overview.chartUsers")}
              stroke={CHART.platinum}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ChartPanel>
      </div>

      <p className="max-w-[640px] text-[0.875rem] leading-relaxed text-subtle">
        {t("overview.note")}
      </p>
    </div>
  );
}

/** "2026-08-05" → "5 Aug" (Latin figures, like every other axis). */
function shortDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(d);
}

/** Tooltip money: full grouped ETB, never abbreviated. */
function etb(value: number): string {
  return `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;
}

function Stat({
  label,
  value,
  unit,
  gold,
}: {
  label: string;
  value: string | null;
  unit?: string;
  gold?: boolean;
}) {
  return (
    <div className="well flex flex-col gap-0.5 rounded-md px-3.5 py-3">
      <span className="text-[0.8125rem] leading-snug text-muted-foreground">{label}</span>
      {value === null ? (
        <Skeleton className="mt-1 h-5 w-20" />
      ) : (
        <span className={cn("tnum text-[1.0625rem] font-semibold", gold && "text-gold-400")}>
          {value}
          {unit && (
            <span className="ms-1 font-sans text-[0.8125rem] font-normal text-muted-foreground">
              {unit}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function ChartPanel({
  title,
  legend,
  loading,
  empty,
  emptyLabel,
  children,
  className,
  height = 220,
}: {
  title: string;
  legend?: { label: string; color: string }[];
  loading: boolean;
  empty: boolean;
  emptyLabel: string;
  children: React.ReactElement;
  className?: string;
  height?: number;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card p-4 lg:p-5", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[1.0625rem] font-semibold">{title}</h2>
        {legend && (
          <span className="flex items-center gap-4">
            {legend.map((item) => (
              <span
                key={item.label}
                className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground"
              >
                <span
                  className="size-2 rounded-full"
                  style={{ background: item.color }}
                  aria-hidden="true"
                />
                {item.label}
              </span>
            ))}
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="rounded-md" style={{ height }} />
      ) : empty ? (
        <p className="py-10 text-center text-[0.9375rem] text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ChartContainer height={height}>{children}</ChartContainer>
      )}
    </section>
  );
}
