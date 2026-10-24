"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, BadgeCheck, Banknote, ScanSearch, Snowflake } from "lucide-react";
import type {
  AdminAnalyticsResponse,
  AdminAuditItem,
  AdminOverviewResponse,
  MeResponse,
} from "@alkeva/shared";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { AdminStrip, AdminTable, FillChart, Td } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { CHART, ChartTooltip, RechartsTooltip } from "@/components/ui/chart";
import { Panel, PanelBody, PanelHeader, Stat } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { eatStamp, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

/**
 * The control room's front page, top to bottom:
 *
 *   queue strip — the four "is anything waiting on a human?" counters
 *   30-day totals strip
 *   trade volume by day (full width)
 *   recent activity (the audit log's newest rows)
 *
 * Full curves with a range control live on Analytics — the overview answers
 * "does anything need me right now?", not "how was the month?".
 */
export function AdminOverviewScreen() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const me = useResource<MeResponse>("/auth/me");
  const { data } = useResource<AdminOverviewResponse>("/admin/overview", {
    intervalMs: 30_000,
  });
  const analytics = useResource<AdminAnalyticsResponse>("/admin/analytics?days=30", {
    intervalMs: 60_000,
  });
  const role = me.data?.role;
  const isAdmin = role === "administrator";
  const seesAudit = isAdmin || role === "compliance";
  // The audit feed is compliance-scoped server-side — never even ask as finance.
  const audit = useResource<{ entries: AdminAuditItem[] }>(
    seesAudit ? "/admin/audit" : null,
    { intervalMs: 60_000 },
  );

  const cards: {
    key: keyof AdminOverviewResponse;
    href: string;
    visible: boolean;
    icon: typeof BadgeCheck;
  }[] = [
    { key: "pendingKyc", href: "/admin/kyc", visible: isAdmin || role === "compliance", icon: BadgeCheck },
    { key: "pendingPayouts", href: "/admin/payouts", visible: isAdmin || role === "finance", icon: Banknote },
    { key: "openReviews", href: "/admin/reviews", visible: isAdmin || role === "compliance", icon: ScanSearch },
    { key: "frozenUsers", href: "/admin/users", visible: role !== "finance", icon: Snowflake },
  ];

  const totals = analytics.data?.totals ?? null;
  const trend = (analytics.data?.points ?? []).map((p) => ({
    day: p.day,
    volume: Number(BigInt(p.buyCents) + BigInt(p.sellCents)) / 100,
  }));

  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">{t("nav.overview")}</h1>

      {/* Queue counters — gold when someone is waiting; each opens its queue. */}
      <AdminStrip label={t("nav.overview")}>
        {cards.map((card) => {
          const value = data ? data[card.key] : null;
          const Icon = card.icon;
          const cell = (
            <Stat
              surface="strip"
              size="lg"
              className="flex-1"
              label={
                <span className="inline-flex items-center gap-1.5">
                  <Icon className="size-3.5 flex-none" aria-hidden="true" />
                  {t(`overview.${card.key}` as never)}
                </span>
              }
              value={value === null ? null : String(value)}
              tone={value !== null && value > 0 ? "gold" : undefined}
            />
          );
          return card.visible ? (
            <Link
              key={card.key}
              href={card.href}
              className="group flex min-w-[11rem] items-stretch outline-none transition-colors hover:bg-white/[0.025] focus-visible:bg-white/[0.04]"
            >
              {cell}
              <ArrowRight
                className="me-4 size-4 flex-none self-center text-subtle transition-colors group-hover:text-gold-400"
                aria-hidden="true"
              />
            </Link>
          ) : (
            <div key={card.key} className="flex min-w-[11rem]">
              {cell}
            </div>
          );
        })}
      </AdminStrip>

      {/* 30-day totals — the numbers a visitor asks for first. */}
      <AdminStrip label={t("overview.chartTrade")}>
        <Stat
          surface="strip"
          label={t("overview.tradeVolume30d")}
          value={totals ? money(totals.tradeCents) : null}
          unit={tc("birr")}
          tone="gold"
        />
        <Stat surface="strip" label={t("overview.settledOrders30d")} value={totals ? String(totals.settledOrders) : null} />
        <Stat
          surface="strip"
          label={t("overview.moneyIn30d")}
          value={totals ? money(totals.depositCents) : null}
          unit={tc("birr")}
        />
        <Stat
          surface="strip"
          label={t("overview.moneyOut30d")}
          value={totals ? money(totals.payoutCents) : null}
          unit={tc("birr")}
        />
        <Stat surface="strip" label={t("overview.newUsers30d")} value={totals ? String(totals.newUsers) : null} />
      </AdminStrip>

      {/* The month at a glance — the same ledgered figures Analytics draws in
          full, small enough to read on the way past. */}
      <Panel aria-label={t("overview.chartTrade")}>
        <PanelHeader
          title={t("overview.chartTrade")}
          hint={t("analytics.days30")}
          action={
            <Button variant="link" size="sm" asChild>
              <Link href="/admin/analytics">
                {t("overview.openAnalytics")}
                <ArrowRight />
              </Link>
            </Button>
          }
        />
        <PanelBody className="flex flex-col">
          {analytics.loading ? (
            <Skeleton className="h-[200px] rounded-md" />
          ) : trend.length === 0 ? (
            <p className="py-10 text-center text-[0.875rem] text-muted-foreground">{t("overview.noData")}</p>
          ) : (
            <FillChart min={200} className="tnum">
              <BarChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={(d: string) => d.slice(5)}
                  tick={{ fill: CHART.axis, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={40}
                />
                <RechartsTooltip
                  cursor={{ fill: "var(--raised)", opacity: 0.5 }}
                  content={
                    <ChartTooltip
                      formatter={(v: number) => `${v.toLocaleString("en-US")} ETB`}
                      labelFormatter={(d: string) => d}
                    />
                  }
                />
                <Bar dataKey="volume" name={t("overview.tradeVolume30d")} fill={CHART.gold} radius={[3, 3, 0, 0]} />
              </BarChart>
            </FillChart>
          )}
        </PanelBody>
      </Panel>

      {/* Recent activity — WHO did WHAT, not just how much is queued. */}
      {seesAudit && (
        <AdminTable
          title={t("overview.recentActivity")}
          action={
            <Button variant="link" size="sm" asChild>
              <Link href="/admin/audit">
                {t("overview.openAudit")}
                <ArrowRight />
              </Link>
            </Button>
          }
          loading={audit.loading}
          headers={[t("audit.actor"), t("audit.action"), t("audit.target"), { label: t("orders.when"), end: true }]}
        >
          {(audit.data?.entries ?? []).slice(0, 8).map((e) => (
            <tr key={e.id}>
              <Td className="tnum text-[0.8125rem]">{e.actorLabel}</Td>
              <Td>
                <span className="tnum inline-block rounded-[0.375rem] bg-panel-2 px-1.5 py-0.5 text-[0.75rem] leading-tight">{e.action}</span>
              </Td>
              <Td className="tnum text-[0.75rem] text-subtle">
                {e.targetType ? `${e.targetType} ${e.targetId ?? ""}` : "—"}
              </Td>
              <Td className="tnum text-end text-[0.75rem] whitespace-nowrap text-subtle">{eatStamp(e.createdAt)}</Td>
            </tr>
          ))}
        </AdminTable>
      )}

      <p className="max-w-[640px] text-[0.8125rem] leading-relaxed text-subtle">{t("overview.note")}</p>
    </div>
  );
}
