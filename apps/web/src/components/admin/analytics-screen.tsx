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

import { FillChart } from "@/components/admin/ui";
import { CHART, ChartTooltip, RechartsTooltip } from "@/components/ui/chart";
import { Panel, PanelBody, PanelHeader, Stat, StatStrip } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

const RANGES = ["7", "30", "90"] as const;
type RangeDays = (typeof RANGES)[number];

/**
 * The platform's pulse over a chosen window, drawn from the same ledgered
 * records the audit trail proves:
 *
 *   window panel: range control + the five totals as one strip
 *   trade volume (buy vs sell)   │ money in vs out
 *   new users (full width)
 */
export function AdminAnalyticsScreen() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
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
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">{t("nav.analytics")}</h1>
      <Panel aria-label={t("nav.analytics")}>
        <PanelHeader
          title={t("nav.analytics")}
          action={
            <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
              <Segmented
                value={days}
                onValueChange={setDays}
                size="sm"
                aria-label={t("nav.analytics")}
                options={RANGES.map((r) => ({ value: r, label: t(`analytics.days${r}` as never) }))}
              />
            </div>
          }
        />
        <StatStrip className="min-h-[5.25rem] border-t border-border lg:[&>*]:flex-auto">
          <Stat
            surface="strip"
            size="lg"
            label={t("overview.tradeVolume30d")}
            value={totals ? money(totals.tradeCents) : null}
            unit={tc("birr")}
            tone="gold"
          />
          <Stat surface="strip" size="lg" label={t("overview.settledOrders30d")} value={totals ? String(totals.settledOrders) : null} />
          <Stat
            surface="strip"
            size="lg"
            label={t("overview.moneyIn30d")}
            value={totals ? money(totals.depositCents) : null}
            unit={tc("birr")}
          />
          <Stat
            surface="strip"
            size="lg"
            label={t("overview.moneyOut30d")}
            value={totals ? money(totals.payoutCents) : null}
            unit={tc("birr")}
          />
          <Stat surface="strip" size="lg" label={t("overview.newUsers30d")} value={totals ? String(totals.newUsers) : null} />
        </StatStrip>
      </Panel>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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
            <CartesianGrid stroke={CHART.grid} vertical={false} />
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
              cursor={{ fill: "var(--raised)", opacity: 0.5 }}
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
            <CartesianGrid stroke={CHART.grid} vertical={false} />
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
              cursor={{ fill: "var(--raised)", opacity: 0.5 }}
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
          min={180}
        >
          <LineChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
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
              content={<ChartTooltip formatter={(v) => String(v)} labelFormatter={shortDay} />}
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

      <p className="max-w-[640px] text-[0.8125rem] leading-relaxed text-subtle">{t("overview.note")}</p>
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

function ChartPanel({
  title,
  legend,
  loading,
  empty,
  emptyLabel,
  children,
  className,
  min = 240,
}: {
  title: string;
  legend?: { label: string; color: string }[];
  loading: boolean;
  empty: boolean;
  emptyLabel: string;
  children: React.ReactElement;
  className?: string;
  min?: number;
}) {
  return (
    <Panel aria-label={title} className={className}>
      <PanelHeader
        title={title}
        action={
          legend && (
            <span className="flex items-center gap-4">
              {legend.map((item) => (
                <span key={item.label} className="flex items-center gap-1.5 text-[0.75rem] text-muted-foreground">
                  <span className="size-2 rounded-full" style={{ background: item.color }} aria-hidden="true" />
                  {item.label}
                </span>
              ))}
            </span>
          )
        }
      />
      <PanelBody className="flex flex-col">
        {loading ? (
          <Skeleton className="rounded-md" style={{ height: min }} />
        ) : empty ? (
          <p className="py-10 text-center text-[0.875rem] text-muted-foreground">{emptyLabel}</p>
        ) : (
          <FillChart min={min} className="tnum">
            {children}
          </FillChart>
        )}
      </PanelBody>
    </Panel>
  );
}
