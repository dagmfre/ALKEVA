"use client";

import { useTranslations } from "next-intl";
import type { AdminTreasuryResponse } from "@alkeva/shared";

import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader, Stat, StatStrip } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { coverage, grams, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/**
 * The dealer's own books:
 *
 *   gold reserve            │ platinum reserve      (vault vs issued, coverage)
 *   cash float + sell-backs │ Chapa merchant balance
 *
 * All read-only projections — there is nothing here that can edit a number.
 */
export function AdminTreasuryScreen() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const { data } = useResource<AdminTreasuryResponse>("/admin/treasury", {
    intervalMs: 60_000,
  });

  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }
  const { summary } = data;
  const used = BigInt(summary.float.sellbackUsedTodayCents);
  const ceiling = BigInt(summary.float.sellbackCeilingCents);
  const usedPct = ceiling > 0n ? Math.min(100, (Number(used) / Number(ceiling)) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">{t("nav.treasury")}</h1>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {summary.reserves.map((r) => {
          const physical = BigInt(r.physicalMg);
          const issuedPct = physical > 0n ? Math.min(100, (Number(BigInt(r.issuedMg)) / Number(physical)) * 100) : 0;
          const gold = r.asset === "XAU";
          return (
            <Panel key={r.asset} aria-label={gold ? tc("gold") : tc("platinum")}>
              <PanelHeader
                title={gold ? tc("gold") : tc("platinum")}
                dot={gold ? "gold" : "platinum"}
                action={
                  <Badge variant={gold ? "gold" : "platinum"} className="tnum">
                    {t("treasury.coverage")} {coverage(r.reserveRatioPctMilli) ?? "—"}
                  </Badge>
                }
              />
              <StatStrip className="border-t border-border lg:[&>*]:flex-auto">
                <Stat
                  surface="strip"
                  size="lg"
                  label={t("treasury.physical")}
                  value={grams(r.physicalMg)}
                  unit={tc("g")}
                />
                <Stat surface="strip" size="lg" label={t("treasury.issued")} value={grams(r.issuedMg)} unit={tc("g")} />
                <Stat
                  surface="strip"
                  size="lg"
                  label={t("treasury.available")}
                  value={grams(r.availableMg)}
                  unit={tc("g")}
                  tone={gold ? "gold" : "platinum"}
                />
              </StatStrip>
              {/* Issued against physical: how much of the vault is spoken for. */}
              <PanelBody className="flex flex-col justify-end gap-2 border-t border-border pt-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="data-label">
                    {t("treasury.issued")} / {t("treasury.physical")}
                  </span>
                  <span className="tnum text-[0.8125rem] font-semibold">{issuedPct.toFixed(1)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-panel-2" aria-hidden="true">
                  <div
                    className={cn("h-full rounded-full", gold ? "bg-gold-400" : "bg-platinum-400")}
                    style={{ width: `${issuedPct}%` }}
                  />
                </div>
              </PanelBody>
            </Panel>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <Panel aria-label={t("treasury.floatTitle")} className="lg:col-span-8">
          <PanelHeader title={t("treasury.floatTitle")} />
          <StatStrip className="min-h-[5.25rem] flex-1 border-t border-border lg:[&>*]:flex-auto">
            <Stat
              surface="strip"
              size="lg"
              label={t("treasury.cash")}
              value={money(summary.float.cashCents)}
              unit={tc("birr")}
              tone="gold"
            />
            <Stat
              surface="strip"
              size="lg"
              label={t("treasury.haltThreshold")}
              value={money(summary.float.haltThresholdCents)}
              unit={tc("birr")}
            />
            <Stat
              surface="strip"
              size="lg"
              label={t("treasury.sellHeadroom")}
              value={money(summary.float.sellHeadroomCents)}
              unit={tc("birr")}
            />
            {/* Today's sell-backs against the daily ceiling, with its meter. */}
            <Stat
              surface="strip"
              className="min-w-[15rem]"
              label={t("treasury.sellbackToday")}
              value={
                <>
                  {money(summary.float.sellbackUsedTodayCents)}
                  <span className="text-subtle"> / {money(summary.float.sellbackCeilingCents)}</span>
                </>
              }
              unit={tc("birr")}
              foot={
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-panel-2" aria-hidden="true">
                  <span className="block h-full rounded-full bg-gold-400" style={{ width: `${usedPct}%` }} />
                </span>
              }
            />
          </StatStrip>
        </Panel>

        <Panel aria-label={t("treasury.chapaTitle")} className="lg:col-span-4">
          <PanelHeader title={t("treasury.chapaTitle")} />
          {data.chapa === null ? (
            <p className="flex flex-1 items-center border-t border-border px-[1.125rem] py-3 text-[0.84375rem] leading-relaxed text-muted-foreground">
              {t("treasury.chapaUnavailable")}
            </p>
          ) : (
            <StatStrip className="min-h-[5.25rem] flex-1 border-t border-border [&>*]:flex-auto">
              {data.chapa.map((b) => (
                <Stat
                  key={b.currency}
                  surface="strip"
                  size="lg"
                  label={t("treasury.chapaAvailable", { currency: b.currency })}
                  value={b.availableBalance.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                  unit={b.currency}
                  tone="gold"
                />
              ))}
            </StatStrip>
          )}
        </Panel>
      </div>
    </div>
  );
}
