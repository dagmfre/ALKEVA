"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { BadgeCheck, Banknote, ScanSearch, Snowflake } from "lucide-react";
import type {
  AdminAnalyticsResponse,
  AdminAuditItem,
  AdminOverviewResponse,
  MeResponse,
} from "@alkeva/shared";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { AdminTable, Td } from "@/components/admin/ui";
import { CHART, ChartContainer, ChartTooltip, RechartsTooltip } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { eatStamp, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/**
 * The control room's front page: the four "is anything waiting on a human?"
 * cards and the 30-day totals. The charts moved to their own Analytics
 * destination (with a real date-range control) — the overview answers "does
 * anything need me right now?", not "how was the month?".
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
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold">{t("nav.overview")}</h1>

      {/* Action cards — the queue counters, gold when someone is waiting. */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {cards.map((card) => {
          const value = data ? data[card.key] : null;
          const Icon = card.icon;
          const body = (
            <div
              className={cn(
                "flex flex-col gap-1 rounded-lg border border-border bg-card p-4",
                card.visible && "hover:border-input",
              )}
            >
              <span className="flex items-center gap-2 text-[0.875rem] text-muted-foreground">
                <Icon className="size-4 flex-none" aria-hidden="true" />
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

      {/* 30-day totals — the numbers a visitor asks for first. Full curves
          with a range control live on /admin/analytics. */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-5">
        <Stat label={t("overview.tradeVolume30d")} value={totals ? money(totals.tradeCents) : null} unit="ETB" gold />
        <Stat label={t("overview.settledOrders30d")} value={totals ? String(totals.settledOrders) : null} />
        <Stat label={t("overview.moneyIn30d")} value={totals ? money(totals.depositCents) : null} unit="ETB" />
        <Stat label={t("overview.moneyOut30d")} value={totals ? money(totals.payoutCents) : null} unit="ETB" />
        <Stat label={t("overview.newUsers30d")} value={totals ? String(totals.newUsers) : null} />
      </div>

      {/* The month at a glance — the same ledgered figures the analytics
          destination draws in full, small enough to read on the way past. */}
      <section className="rounded-lg border border-border bg-card px-4 pb-4 pt-3.5 lg:px-5">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-[1.0625rem] font-semibold">{t("overview.chartTrade")}</h2>
          <Link href="/admin/analytics" className="text-[0.875rem] text-gold-400 hover:underline">
            {t("overview.openAnalytics")} →
          </Link>
        </div>
        {analytics.loading ? (
          <Skeleton className="h-[140px] rounded-md" />
        ) : trend.length === 0 ? (
          <p className="py-10 text-center text-[0.9375rem] text-muted-foreground">
            {t("overview.noData")}
          </p>
        ) : (
          <ChartContainer height={140}>
            <BarChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <CartesianGrid stroke={CHART.grid} strokeOpacity={0.6} vertical={false} />
              <XAxis
                dataKey="day"
                tickFormatter={(d: string) => d.slice(5)}
                tick={{ fill: CHART.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={40}
              />
              <RechartsTooltip
                cursor={{ fill: "var(--popover)", opacity: 0.5 }}
                content={
                  <ChartTooltip
                    formatter={(v: number) => `${v.toLocaleString("en-US")} ETB`}
                    labelFormatter={(d: string) => d}
                  />
                }
              />
              <Bar
                dataKey="volume"
                name={t("overview.tradeVolume30d")}
                fill={CHART.gold}
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        )}
      </section>

      {/* Recent activity — the audit log's newest rows, so the front page
          shows WHO did WHAT, not just how much is queued. */}
      {seesAudit && (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[1.0625rem] font-semibold">{t("overview.recentActivity")}</h2>
            <Link href="/admin/audit" className="text-[0.875rem] text-gold-400 hover:underline">
              {t("overview.openAudit")} →
            </Link>
          </div>
          {audit.loading ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : (
            <AdminTable
              headers={[t("audit.actor"), t("audit.action"), t("audit.target"), t("orders.when")]}
            >
              {(audit.data?.entries ?? []).slice(0, 8).map((e) => (
                <tr key={e.id}>
                  <Td className="font-latin text-[0.875rem]">{e.actorLabel}</Td>
                  <Td className="font-latin">{e.action}</Td>
                  <Td className="font-latin text-[0.8125rem] text-subtle">
                    {e.targetType ? `${e.targetType} ${e.targetId ?? ""}` : "—"}
                  </Td>
                  <Td className="font-latin text-[0.8125rem] text-subtle">
                    {eatStamp(e.createdAt)}
                  </Td>
                </tr>
              ))}
            </AdminTable>
          )}
        </section>
      )}

      <p className="max-w-[640px] text-[0.875rem] leading-relaxed text-subtle">
        {t("overview.note")}
      </p>
    </div>
  );
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
