"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminAnalyticsResponse } from "@alkeva/shared";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CHART, ChartContainer, ChartTooltip, RechartsTooltip } from "@/components/ui/chart";
import { money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

const RANGES = ["7", "30", "90"] as const;
type RangeDays = (typeof RANGES)[number];

/**
 * The platform's pulse over a chosen window — trade volume, money in vs out,
 * and user growth, drawn from the same ledgered records the audit trail
 * proves. Moved off the overview onto its own destination (the API always
 * accepted 7–365 days; the UI used to pin 30 and hide the rest).
 */
export function AdminAnalyticsScreen() {
  const t = useTranslations("admin");
  const [days, setDays] = useState<RangeDays>("30");
  const analytics = useResource<AdminAnalyticsResponse>(`/admin/analytics?days=${days}`, {
    intervalMs: 60_000,
  });

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("nav.analytics")}</h1>
        <Select value={days} onValueChange={(v) => setDays(v as RangeDays)}>
          <SelectTrigger className="w-[12rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r} value={r}>
                {t(`analytics.days${r}` as never)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Window totals — the numbers a visitor asks for first. */}
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
