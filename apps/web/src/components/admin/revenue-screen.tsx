"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminRevenueResponse } from "@alkeva/shared";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ArrowDown, Equal, Info, TrendingDown, TrendingUp } from "lucide-react";

import { AdminStrip, AdminTable, FillChart, Td } from "@/components/admin/ui";
import { Coin, Panel, PanelBody, PanelHeader, Stat, StatStrip } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CHART, ChartTooltip, RechartsTooltip } from "@/components/ui/chart";
import { grams, money, pctMilli, signedPct } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

const RANGES = ["7", "30", "90"] as const;
type RangeDays = (typeof RANGES)[number];

/**
 * The owner's revenue view.
 *
 * Three questions, in the order an owner actually asks them: what have I
 * earned, where did it come from, and how much of the money in the account is
 * genuinely mine. The third is the one that needs a screen — the platform's
 * balance is mostly customer money, and a page that showed only "fees earned"
 * next to "merchant balance" would invite exactly the wrong conclusion.
 *
 *   headline: all-time commission │ window · today · month · volume strip
 *   rate strip: commission · effective · service fee · tax · reforestation
 *   commission per day (chart, elastic) │ what you can withdraw
 *   where it comes from                 │ open metal position
 *   top customers
 *
 * Every figure is server-computed from ledgered records; nothing here is a
 * client-side estimate, and nothing here can write.
 */
export function AdminRevenueScreen() {
  const t = useTranslations("admin");
  const c = useTranslations("common");
  const [days, setDays] = useState<RangeDays>("30");
  const revenue = useResource<AdminRevenueResponse>(`/admin/revenue?days=${days}`, {
    intervalMs: 60_000,
  });
  const d = revenue.data;

  const points = useMemo(
    () =>
      (d?.points ?? []).map((p) => ({
        day: p.day,
        buy: Number(BigInt(p.buyFeeCents)) / 100,
        sell: Number(BigInt(p.sellFeeCents)) / 100,
        total: Number(BigInt(p.buyFeeCents) + BigInt(p.sellFeeCents)) / 100,
      })),
    [d],
  );

  // Change against the previous equally-long window. A jump from zero has no
  // meaningful percentage, so it renders as "new" rather than a fake ∞.
  const delta = useMemo(() => {
    if (!d) return null;
    const now = BigInt(d.earnings.windowCents);
    const prev = BigInt(d.earnings.prevWindowCents);
    if (prev === 0n) return now === 0n ? 0 : null;
    return (Number(now - prev) / Number(prev)) * 100;
  }, [d]);

  // Both metals always get a row — a metal that earned nothing this window is
  // a real zero, and a missing row would leave its neighbour panel taller.
  const assetBars = useMemo(() => {
    const rows = d?.byAsset ?? [];
    const total = rows.reduce((acc, a) => acc + BigInt(a.feeCents), 0n);
    return (["XAU", "XPT"] as const).map((asset) => {
      const a = rows.find((r) => r.asset === asset);
      const feeCents = a?.feeCents ?? "0";
      return {
        asset,
        feeCents,
        orders: a?.orders ?? 0,
        sharePct: total === 0n ? 0 : (Number(BigInt(feeCents)) / Number(total)) * 100,
        label: asset === "XAU" ? c("gold") : c("platinum"),
        color: asset === "XAU" ? CHART.gold : CHART.platinum,
      };
    });
  }, [d, c]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-3">
        <h1 className="sr-only">{t("nav.revenue")}</h1>

        {/* ── The headline: everything ever earned, then the window ── */}
        <Panel aria-label={t("nav.revenue")}>
          <PanelHeader
            title={t("nav.revenue")}
            hint={<span className="hidden md:inline">{t("revenue.subtitle")}</span>}
            action={
              <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
                <Segmented
                  value={days}
                  onValueChange={setDays}
                  size="sm"
                  aria-label={t("nav.revenue")}
                  options={RANGES.map((r) => ({ value: r, label: t(`analytics.days${r}` as never) }))}
                />
              </div>
            }
          />
          <div className="grid grid-cols-1 border-t border-border lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
            <div className="flex flex-col justify-center gap-1.5 border-b border-border bg-[linear-gradient(140deg,color-mix(in_oklch,var(--gold-500)_10%,transparent),transparent_70%)] px-[1.125rem] py-5 lg:border-e lg:border-b-0">
              <span className="data-label">{t("revenue.allTime")}</span>
              {d ? (
                <p className="tnum text-[2.125rem] leading-tight font-semibold tracking-[-0.02em] text-gold-300">
                  {money(d.earnings.allTimeCents)}
                  <span className="ms-2 font-sans text-[0.875rem] font-medium tracking-normal text-subtle">
                    {c("birr")}
                  </span>
                </p>
              ) : (
                <Skeleton className="my-1 h-10 w-48" />
              )}
              <p className="text-[0.8125rem] leading-relaxed text-subtle">{t("revenue.allTimeFoot")}</p>
            </div>
            <StatStrip className="lg:[&>*]:flex-auto">
              <Stat
                surface="strip"
                size="lg"
                label={t("revenue.windowEarned")}
                value={d ? money(d.earnings.windowCents) : null}
                unit={c("birr")}
                tone="gold"
                foot={
                  d ? (
                    <DeltaFoot delta={delta} label={t("revenue.vsPrev")} newLabel={t("revenue.newActivity")} />
                  ) : undefined
                }
              />
              <Stat
                surface="strip"
                size="lg"
                label={t("revenue.today")}
                value={d ? money(d.earnings.todayCents) : null}
                unit={c("birr")}
              />
              <Stat
                surface="strip"
                size="lg"
                label={t("revenue.monthToDate")}
                value={d ? money(d.earnings.monthToDateCents) : null}
                unit={c("birr")}
              />
              {/* Volume carries the figure and the order count sits in the
                  foot — the long form was clipped in every language. */}
              <Stat
                surface="strip"
                size="lg"
                label={t("revenue.windowVolume")}
                value={d ? money(d.earnings.windowVolumeCents) : null}
                unit={c("birr")}
                foot={d ? t("revenue.ordersCount", { count: d.earnings.windowOrders }) : undefined}
              />
            </StatStrip>
          </div>
        </Panel>

        {/* ── The rate in force, and what is collected for others ── */}
        <AdminStrip label={t("revenue.rateTitle")}>
          <Stat
            surface="strip"
            label={t("revenue.commissionRate")}
            value={d ? `${pctMilli(String(d.rate.commissionPctMilli))}%` : null}
            tone="gold"
            foot={t("revenue.perSide")}
          />
          <Stat
            surface="strip"
            label={t("revenue.effectiveRate")}
            value={
              d
                ? d.earnings.effectiveRatePctMilli
                  ? `${pctMilli(d.earnings.effectiveRatePctMilli)}%`
                  : "—"
                : null
            }
            foot={t("revenue.effectiveFoot")}
          />
          <Stat
            surface="strip"
            label={t("revenue.serviceFee")}
            value={d ? money(d.rate.serviceFeeCents) : null}
            unit={c("birr")}
            foot={t("revenue.perOrder")}
          />
          {/* Tax and reforestation are collected THROUGH the platform, not
              earned BY it — kept visually and verbally separate. */}
          <Stat
            surface="strip"
            label={t("revenue.tax")}
            value={d ? money(d.earnings.taxAllTimeCents) : null}
            unit={c("birr")}
            foot={
              <span className="inline-flex items-center gap-1">
                {t("revenue.collectedTitle")}
                <InfoHint text={t("revenue.collectedNote")} />
              </span>
            }
          />
          <Stat
            surface="strip"
            label={t("revenue.reforestation")}
            value={d ? money(d.earnings.reforestAllTimeCents) : null}
            unit={c("birr")}
            foot={t("revenue.collectedTitle")}
          />
        </AdminStrip>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          {/* ── Commission per day, split by the side that produced it ── */}
          <Panel aria-label={t("revenue.chartTitle")} className="lg:col-span-8">
            <PanelHeader
              title={t("revenue.chartTitle")}
              action={
                <span className="flex items-center gap-4">
                  <LegendDot color={CHART.gold} label={t("overview.seriesBuy")} />
                  <LegendDot color={CHART.platinum} label={t("overview.seriesSell")} />
                </span>
              }
            />
            <PanelBody className="flex flex-col">
              {!d ? (
                <Skeleton className="h-[240px] rounded-md" />
              ) : points.length === 0 ? (
                <Empty label={t("overview.noData")} />
              ) : (
                <FillChart min={240} className="tnum">
                  <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                    <defs>
                      <linearGradient id="revBuy" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART.gold} stopOpacity={0.45} />
                        <stop offset="100%" stopColor={CHART.gold} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="revSell" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART.platinum} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={CHART.platinum} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
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
                      cursor={{ stroke: CHART.grid }}
                      content={<ChartTooltip formatter={etb} labelFormatter={shortDay} />}
                    />
                    <Area
                      type="linear"
                      dataKey="buy"
                      name={t("overview.seriesBuy")}
                      stackId="f"
                      stroke={CHART.gold}
                      strokeWidth={2}
                      fill="url(#revBuy)"
                    />
                    <Area
                      type="linear"
                      dataKey="sell"
                      name={t("overview.seriesSell")}
                      stackId="f"
                      stroke={CHART.platinum}
                      strokeWidth={2}
                      fill="url(#revSell)"
                    />
                  </AreaChart>
                </FillChart>
              )}
            </PanelBody>
          </Panel>

          {/* ── What is actually withdrawable ── */}
          <Panel aria-label={t("revenue.positionTitle")} className="lg:col-span-4">
            <PanelHeader title={t("revenue.positionTitle")} />
            <PanelBody className="flex flex-col gap-2.5">
              {!d ? (
                <Skeleton className="h-[200px] rounded-md" />
              ) : (
                <>
                  <Line
                    label={t("revenue.chapaAvailable")}
                    value={d.position.chapaAvailableCents === null ? null : money(d.position.chapaAvailableCents)}
                    unit={c("birr")}
                    fallback={t("revenue.chapaUnavailable")}
                  />
                  <Line
                    label={t("revenue.customerLiability")}
                    value={`− ${money(d.position.userEtbLiabilityCents)}`}
                    unit={c("birr")}
                    hint={t("revenue.customerLiabilityHint")}
                    minus
                  />
                  <Line
                    label={t("revenue.payoutHold")}
                    value={`− ${money(d.position.payoutHoldCents)}`}
                    unit={c("birr")}
                    hint={t("revenue.payoutHoldHint")}
                    minus
                  />
                  <Line
                    label={t("revenue.haltBuffer")}
                    value={`− ${money(d.position.haltThresholdCents)}`}
                    unit={c("birr")}
                    hint={t("revenue.haltBufferHint")}
                    minus
                  />
                  <div className="mt-1 flex items-center justify-between gap-3 rounded-md border border-gold-400/25 bg-gold-400/8 px-3.5 py-3">
                    <span className="flex items-center gap-1.5 text-[0.875rem] font-semibold">
                      {t("revenue.safeToSweep")}
                      <InfoHint text={t("revenue.safeToSweepNote")} />
                    </span>
                    <span className="tnum text-[1.125rem] font-semibold whitespace-nowrap text-gold-300">
                      {d.position.safeToSweepCents === null ? "—" : money(d.position.safeToSweepCents)}
                      <span className="ms-1.5 font-sans text-[0.75rem] font-medium text-subtle">{c("birr")}</span>
                    </span>
                  </div>
                  <p className="mt-auto pt-1 text-[0.78125rem] leading-relaxed text-subtle">
                    {t("revenue.positionNote")}
                  </p>
                </>
              )}
            </PanelBody>
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {/* ── Which metal earns ── */}
          <Panel aria-label={t("revenue.byMetal")}>
            <PanelHeader title={t("revenue.byMetal")} hint={t(`analytics.days${days}` as never)} />
            <PanelBody className="flex flex-col gap-2.5">
              {!d ? (
                <Skeleton className="h-[160px] rounded-md" />
              ) : (
                assetBars.map((a) => (
                  <div key={a.asset} className="well flex flex-1 flex-col justify-center gap-2 rounded-md px-3.5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex items-center gap-2 text-[0.875rem] font-semibold">
                        <Coin metal={a.asset} size="sm" />
                        {a.label}
                        <span className="tnum text-[0.75rem] font-normal text-subtle">
                          {t("revenue.ordersCount", { count: a.orders })}
                        </span>
                      </span>
                      <span className="tnum text-[0.9375rem] font-semibold whitespace-nowrap">
                        {money(a.feeCents)}
                        <span className="ms-1.5 font-sans text-[0.75rem] font-medium text-subtle">{c("birr")}</span>
                      </span>
                    </div>
                    {/* Width carries the share; the number beside it carries the
                        identity, so the bar is never the only signal. */}
                    <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${a.sharePct === 0 ? 0 : Math.max(a.sharePct, 1.5)}%`, background: a.color }}
                      />
                    </div>
                    <span className="tnum text-[0.75rem] text-subtle">
                      {t("revenue.shareOfCommission", { pct: a.sharePct.toFixed(1) })}
                    </span>
                  </div>
                ))
              )}
            </PanelBody>
          </Panel>

          {/* ── The dealer's open position ── */}
          <Panel aria-label={t("revenue.exposureTitle")}>
            <PanelHeader title={t("revenue.exposureTitle")} />
            <PanelBody className="flex flex-col gap-2.5">
              {!d ? (
                <Skeleton className="h-[160px] rounded-md" />
              ) : (
                <>
                  {d.exposure.map((e) => (
                    <div key={e.asset} className="well flex items-center justify-between gap-3 rounded-md px-3.5 py-3">
                      <span className="flex flex-col gap-1">
                        <span className="flex items-center gap-2 text-[0.875rem] font-semibold">
                          <Coin metal={e.asset} size="sm" />
                          {e.asset === "XAU" ? c("gold") : c("platinum")}
                        </span>
                        <span className="tnum text-[0.75rem] text-subtle">
                          {grams(e.issuedMg)} {c("g")} {t("revenue.issued")}
                        </span>
                      </span>
                      <span className="tnum text-end text-[0.9375rem] font-semibold whitespace-nowrap">
                        {money(e.valueCents)}
                        <span className="ms-1.5 font-sans text-[0.75rem] font-medium text-subtle">{c("birr")}</span>
                      </span>
                    </div>
                  ))}
                  <p className="mt-auto pt-1 text-[0.78125rem] leading-relaxed text-subtle">
                    {t("revenue.exposureNote")}
                  </p>
                </>
              )}
            </PanelBody>
          </Panel>
        </div>

        {/* ── Who is trading ── */}
        <AdminTable
          title={t("revenue.contributorsTitle")}
          hint={t(`analytics.days${days}` as never)}
          loading={!d}
          empty={d && d.topContributors.length === 0 ? t("revenue.noContributors") : null}
          minWidth={480}
          headers={[
            t("revenue.customer"),
            { label: t("revenue.ordersCol"), end: true },
            { label: t("revenue.commission"), end: true },
          ]}
        >
          {d?.topContributors.map((row) => (
            <tr key={row.userId}>
              <Td>
                <span className="flex flex-col">
                  <span className="font-semibold">{row.fullName}</span>
                  <span className="text-[0.78125rem] text-subtle">{row.email}</span>
                </span>
              </Td>
              <Td className="tnum text-end">{row.orders}</Td>
              <Td className="tnum text-end font-semibold text-gold-300">{money(row.feeCents)}</Td>
            </tr>
          ))}
        </AdminTable>

        <p className="max-w-[720px] text-[0.8125rem] leading-relaxed text-subtle">{t("revenue.footnote")}</p>
      </div>
    </TooltipProvider>
  );
}

/* ── small parts ────────────────────────────────────────────────── */

function DeltaFoot({
  delta,
  label,
  newLabel,
}: {
  delta: number | null;
  label: string;
  newLabel: string;
}) {
  if (delta === null) {
    return <span className="text-gain">{newLabel}</span>;
  }
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Equal;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        delta > 0 ? "text-gain" : delta < 0 ? "text-loss" : "text-subtle",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span className="tnum">{signedPct(delta)}%</span>
      <span className="text-subtle">{label}</span>
    </span>
  );
}

function Line({
  label,
  value,
  unit,
  fallback,
  hint,
  minus,
}: {
  label: string;
  value: string | null;
  unit?: string;
  fallback?: string;
  hint?: string;
  minus?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border pb-2.5">
      <span className="flex min-w-0 items-center gap-1.5 text-[0.84375rem] text-muted-foreground">
        {minus && <ArrowDown className="size-3.5 flex-none text-subtle" aria-hidden="true" />}
        {label}
        {hint && <InfoHint text={hint} />}
      </span>
      {value === null ? (
        <span className="text-[0.8125rem] text-subtle">{fallback}</span>
      ) : (
        <span className="tnum text-[0.875rem] font-medium whitespace-nowrap">
          {value}
          {unit && <span className="ms-1.5 font-sans text-[0.75rem] text-subtle">{unit}</span>}
        </span>
      )}
    </div>
  );
}

function InfoHint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="text-subtle hover:text-foreground" aria-label={text}>
          <Info className="size-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[18rem] leading-relaxed">{text}</TooltipContent>
    </Tooltip>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[0.75rem] text-muted-foreground">
      <span className="size-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="py-10 text-center text-[0.875rem] text-muted-foreground">{label}</p>;
}

/** "2026-08-05" → "5 Aug" — Latin figures, like every other axis. */
function shortDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(d);
}

function etb(value: number): string {
  return `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;
}
