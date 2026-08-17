"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminRevenueResponse } from "@alkeva/shared";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ArrowDown, Equal, Info, TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader, Stat } from "@/components/ui/panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CHART, ChartContainer, ChartTooltip, RechartsTooltip } from "@/components/ui/chart";
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

  const assetBars = useMemo(() => {
    const total = (d?.byAsset ?? []).reduce((acc, a) => acc + BigInt(a.feeCents), 0n);
    return (d?.byAsset ?? []).map((a) => ({
      ...a,
      sharePct: total === 0n ? 0 : (Number(BigInt(a.feeCents)) / Number(total)) * 100,
      label: a.asset === "XAU" ? c("gold") : c("platinum"),
      color: a.asset === "XAU" ? CHART.gold : CHART.platinum,
    }));
  }, [d, c]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{t("nav.revenue")}</h1>
            <p className="mt-0.5 text-[0.9375rem] text-muted-foreground">
              {t("revenue.subtitle")}
            </p>
          </div>
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

        {/* ── The headline: everything ever earned, and the trend behind it ── */}
        <Panel className="overflow-hidden">
          <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <div className="flex flex-col justify-center gap-1 border-b border-border bg-[linear-gradient(140deg,color-mix(in_oklch,var(--gold-500)_10%,transparent),transparent_70%)] px-5 py-6 lg:border-b-0 lg:border-e">
              <span className="text-[0.9375rem] text-muted-foreground">
                {t("revenue.allTime")}
              </span>
              {d ? (
                <p className="tnum text-[2.25rem] font-semibold leading-tight text-gold-400">
                  {money(d.earnings.allTimeCents)}
                  <span className="ms-2 font-sans text-[1rem] font-normal text-muted-foreground">
                    {c("birr")}
                  </span>
                </p>
              ) : (
                <Skeleton className="my-1 h-10 w-48" />
              )}
              <p className="text-[0.875rem] leading-relaxed text-subtle">
                {t("revenue.allTimeFoot")}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3.5 p-4 lg:grid-cols-4 lg:p-5">
              <Stat
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
                label={t("revenue.today")}
                value={d ? money(d.earnings.todayCents) : null}
                unit={c("birr")}
              />
              <Stat
                label={t("revenue.monthToDate")}
                value={d ? money(d.earnings.monthToDateCents) : null}
                unit={c("birr")}
              />
              {/* Volume carries the figure and the order count sits in the
                  foot: "on 1,776,926.71 ETB traded" was long enough to be
                  clipped by the stat column in every language. */}
              <Stat
                label={t("revenue.windowVolume")}
                value={d ? money(d.earnings.windowVolumeCents) : null}
                unit={c("birr")}
                foot={d ? t("revenue.ordersCount", { count: d.earnings.windowOrders }) : undefined}
              />
            </div>
          </div>
        </Panel>

        {/* ── Commission per day, split by the side that produced it ── */}
        <Panel>
          <PanelHeader
            title={t("revenue.chartTitle")}
            action={
              <span className="flex items-center gap-4">
                <LegendDot color={CHART.gold} label={t("overview.seriesBuy")} />
                <LegendDot color={CHART.platinum} label={t("overview.seriesSell")} />
              </span>
            }
          />
          <PanelBody>
            {!d ? (
              <Skeleton className="h-[240px] rounded-md" />
            ) : points.length === 0 ? (
              <Empty label={t("overview.noData")} />
            ) : (
              <ChartContainer height={240}>
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
              </ChartContainer>
            )}
          </PanelBody>
        </Panel>

        <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-12 lg:gap-5">
          {/* ── Which metal earns ── */}
          <Panel className="lg:col-span-5">
            <PanelHeader title={t("revenue.byMetal")} />
            <PanelBody className="flex flex-col gap-3">
              {!d ? (
                <Skeleton className="h-[160px] rounded-md" />
              ) : assetBars.length === 0 ? (
                <Empty label={t("overview.noData")} />
              ) : (
                assetBars.map((a) => (
                  <div key={a.asset} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex items-center gap-2 text-[0.9375rem]">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ background: a.color }}
                          aria-hidden="true"
                        />
                        {a.label}
                        <span className="text-[0.8125rem] text-subtle">
                          {t("revenue.ordersCount", { count: a.orders })}
                        </span>
                      </span>
                      <span className="tnum text-[0.9375rem] font-semibold">
                        {money(a.feeCents)}
                        <span className="ms-1 text-[0.8125rem] font-normal text-muted-foreground">
                          {c("birr")}
                        </span>
                      </span>
                    </div>
                    {/* Width carries the share; the number beside it carries the
                        identity, so the bar is never the only signal. */}
                    <div className="well h-2 overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(a.sharePct, 1.5)}%`, background: a.color }}
                      />
                    </div>
                    <span className="text-[0.8125rem] text-subtle">
                      {t("revenue.shareOfCommission", { pct: a.sharePct.toFixed(1) })}
                    </span>
                  </div>
                ))
              )}
            </PanelBody>
          </Panel>

          {/* ── The rate in force ── */}
          <Panel className="lg:col-span-7">
            <PanelHeader
              title={t("revenue.rateTitle")}
              action={
                d ? (
                  <Badge variant="gold" className="tnum">
                    {pctMilli(String(d.rate.commissionPctMilli))}%
                  </Badge>
                ) : undefined
              }
            />
            <PanelBody className="flex flex-col gap-3.5">
              <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3">
                <Stat
                  label={t("revenue.commissionRate")}
                  value={d ? `${pctMilli(String(d.rate.commissionPctMilli))}%` : null}
                  foot={t("revenue.perSide")}
                />
                <Stat
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
                  label={t("revenue.serviceFee")}
                  value={d ? money(d.rate.serviceFeeCents) : null}
                  unit={c("birr")}
                  foot={t("revenue.perOrder")}
                />
              </div>
              {/* Tax and reforestation are collected THROUGH the platform, not
                  earned BY it — kept visually and verbally separate. */}
              <div className="well flex flex-col gap-2 rounded-md px-3.5 py-3">
                <span className="flex items-center gap-1.5 text-[0.875rem] text-muted-foreground">
                  {t("revenue.collectedTitle")}
                  <InfoHint text={t("revenue.collectedNote")} />
                </span>
                <div className="flex flex-wrap gap-x-8 gap-y-1.5">
                  <KeyFigure
                    label={t("revenue.tax")}
                    value={d ? `${money(d.earnings.taxAllTimeCents)} ${c("birr")}` : null}
                  />
                  <KeyFigure
                    label={t("revenue.reforestation")}
                    value={d ? `${money(d.earnings.reforestAllTimeCents)} ${c("birr")}` : null}
                  />
                </div>
              </div>
            </PanelBody>
          </Panel>

          {/* ── What is actually withdrawable ── */}
          <Panel className="lg:col-span-7">
            <PanelHeader title={t("revenue.positionTitle")} />
            <PanelBody className="flex flex-col gap-3">
              {!d ? (
                <Skeleton className="h-[200px] rounded-md" />
              ) : (
                <>
                  <Line
                    label={t("revenue.chapaAvailable")}
                    value={
                      d.position.chapaAvailableCents === null
                        ? null
                        : `${money(d.position.chapaAvailableCents)} ${c("birr")}`
                    }
                    fallback={t("revenue.chapaUnavailable")}
                  />
                  <Line
                    label={t("revenue.customerLiability")}
                    value={`− ${money(d.position.userEtbLiabilityCents)} ${c("birr")}`}
                    hint={t("revenue.customerLiabilityHint")}
                    minus
                  />
                  <Line
                    label={t("revenue.payoutHold")}
                    value={`− ${money(d.position.payoutHoldCents)} ${c("birr")}`}
                    hint={t("revenue.payoutHoldHint")}
                    minus
                  />
                  <Line
                    label={t("revenue.haltBuffer")}
                    value={`− ${money(d.position.haltThresholdCents)} ${c("birr")}`}
                    hint={t("revenue.haltBufferHint")}
                    minus
                  />
                  <div className="mt-1 flex items-center justify-between gap-3 rounded-md border border-border bg-[color-mix(in_oklch,var(--gold-500)_8%,transparent)] px-3.5 py-3">
                    <span className="flex items-center gap-1.5 text-[0.9375rem] font-medium">
                      {t("revenue.safeToSweep")}
                      <InfoHint text={t("revenue.safeToSweepNote")} />
                    </span>
                    <span className="tnum text-[1.125rem] font-semibold text-gold-400">
                      {d.position.safeToSweepCents === null
                        ? "—"
                        : `${money(d.position.safeToSweepCents)} ${c("birr")}`}
                    </span>
                  </div>
                  <p className="text-[0.8125rem] leading-relaxed text-subtle">
                    {t("revenue.positionNote")}
                  </p>
                </>
              )}
            </PanelBody>
          </Panel>

          {/* ── The dealer's open position ── */}
          <Panel className="lg:col-span-5">
            <PanelHeader title={t("revenue.exposureTitle")} />
            <PanelBody className="flex flex-col gap-3">
              {!d ? (
                <Skeleton className="h-[160px] rounded-md" />
              ) : (
                <>
                  {d.exposure.map((e) => (
                    <div
                      key={e.asset}
                      className="well flex items-center justify-between gap-3 rounded-md px-3.5 py-3"
                    >
                      <span className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-2 text-[0.9375rem]">
                          <span
                            className={cn(
                              "size-2.5 rounded-full",
                              e.asset === "XAU" ? "bg-gold-500" : "bg-platinum-400",
                            )}
                            aria-hidden="true"
                          />
                          {e.asset === "XAU" ? c("gold") : c("platinum")}
                        </span>
                        <span className="tnum text-[0.8125rem] text-subtle">
                          {grams(e.issuedMg)} {c("g")} {t("revenue.issued")}
                        </span>
                      </span>
                      <span className="tnum text-end text-[0.9375rem] font-semibold">
                        {money(e.valueCents)}
                        <span className="ms-1 text-[0.8125rem] font-normal text-muted-foreground">
                          {c("birr")}
                        </span>
                      </span>
                    </div>
                  ))}
                  <p className="text-[0.8125rem] leading-relaxed text-subtle">
                    {t("revenue.exposureNote")}
                  </p>
                </>
              )}
            </PanelBody>
          </Panel>

          {/* ── Who is trading ── */}
          <Panel className="lg:col-span-12">
            <PanelHeader title={t("revenue.contributorsTitle")} />
            <PanelBody>
              {!d ? (
                <Skeleton className="h-[140px] rounded-md" />
              ) : d.topContributors.length === 0 ? (
                <Empty label={t("revenue.noContributors")} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("revenue.customer")}</TableHead>
                      <TableHead className="text-end">{t("revenue.ordersCol")}</TableHead>
                      <TableHead className="text-end">{t("revenue.commission")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.topContributors.map((row) => (
                      <TableRow key={row.userId}>
                        <TableCell>
                          <span className="flex flex-col">
                            <span className="font-medium">{row.fullName}</span>
                            <span className="text-[0.8125rem] text-subtle">{row.email}</span>
                          </span>
                        </TableCell>
                        <TableCell className="tnum text-end">{row.orders}</TableCell>
                        <TableCell className="tnum text-end font-semibold text-gold-400">
                          {money(row.feeCents)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </PanelBody>
          </Panel>
        </div>

        <p className="max-w-[720px] text-[0.875rem] leading-relaxed text-subtle">
          {t("revenue.footnote")}
        </p>
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
  fallback,
  hint,
  minus,
}: {
  label: string;
  value: string | null;
  fallback?: string;
  hint?: string;
  minus?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border pb-2.5 last:border-b-0">
      <span className="flex items-center gap-1.5 text-[0.9375rem] text-muted-foreground">
        {minus && <ArrowDown className="size-3.5 text-subtle" aria-hidden="true" />}
        {label}
        {hint && <InfoHint text={hint} />}
      </span>
      {value === null ? (
        <span className="text-[0.875rem] text-subtle">{fallback}</span>
      ) : (
        <span className="tnum text-[0.9375rem] font-medium">{value}</span>
      )}
    </div>
  );
}

function KeyFigure({ label, value }: { label: string; value: string | null }) {
  return (
    <span className="flex flex-col">
      <span className="text-[0.8125rem] text-subtle">{label}</span>
      {value === null ? (
        <Skeleton className="mt-1 h-4 w-24" />
      ) : (
        <span className="tnum text-[0.9375rem]">{value}</span>
      )}
    </span>
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
    <span className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
      <span className="size-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="py-10 text-center text-[0.9375rem] text-muted-foreground">{label}</p>;
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
