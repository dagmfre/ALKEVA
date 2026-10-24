"use client";

import { useTranslations } from "next-intl";
import type { TreasurySummaryResponse } from "@alkeva/shared";

import { Badge } from "@/components/ui/badge";
import { Coin, Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { coverage, grams, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/**
 * Proof that the metal behind a balance exists — both metals, side by side.
 *
 * Coverage is a multiple ("14.6×"), not a 0–100% gauge: the vault is backed
 * many times over and a gauge would read as broken. Every figure is derived
 * inside the API from the ledger and the vault records; nothing here is
 * stored or editable. "Backed" is computed (physical ≥ issued for every
 * metal), not a badge someone typed.
 */
export function TrustPanel({ className }: { className?: string }) {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const { data, loading } = useResource<TreasurySummaryResponse>("/treasury/summary", {
    intervalMs: 60_000,
  });

  const reserves = data?.reserves ?? [];
  const backed =
    reserves.length > 0 &&
    reserves.every((r) => r.reserveRatioPctMilli === null || BigInt(r.reserveRatioPctMilli) >= 100_000n);

  return (
    <Panel className={className} aria-label={t("vaultTitle")}>
      <PanelHeader
        title={t("vaultTitle")}
        action={
          backed ? (
            <Badge variant="gain" dot>
              {t("backed")}
            </Badge>
          ) : null
        }
      />
      <div className="flex flex-1 flex-col gap-3.5 px-[1.125rem] pb-[1.125rem]">
        <p className="text-[0.84375rem] leading-relaxed text-muted-foreground">{t("vaultBody")}</p>

        {loading ? (
          <Skeleton className="h-28" />
        ) : (
          <div className="overflow-hidden rounded-[0.75rem] border border-border">
            <div className="tnum grid grid-cols-[1.2fr_1fr_1fr_0.8fr] gap-x-2 bg-white/[0.02] px-3 py-2 text-[0.6875rem] text-subtle">
              <span />
              <span className="text-end font-sans">{t("inVault")}</span>
              <span className="text-end font-sans">{t("issued")}</span>
              <span className="text-end font-sans">{t("coverage")}</span>
            </div>
            {reserves.map((r) => {
              const issuedPct =
                BigInt(r.physicalMg) > 0n
                  ? Math.min(100, (Number(BigInt(r.issuedMg)) / Number(BigInt(r.physicalMg))) * 100)
                  : 0;
              return (
                <div key={r.asset} className="border-t border-border bg-background px-3 py-2.5">
                  <div className="tnum grid grid-cols-[1.2fr_1fr_1fr_0.8fr] items-center gap-x-2 text-[0.8125rem]">
                    <span className="flex items-center gap-2 font-sans font-semibold">
                      <Coin metal={r.asset} size="sm" />
                      {r.asset === "XAU" ? tc("gold") : tc("platinum")}
                    </span>
                    <span className="text-end">{grams(r.physicalMg)}</span>
                    <span className="text-end text-muted-foreground">{grams(r.issuedMg)}</span>
                    <span className={cn("text-end font-semibold", r.asset === "XAU" ? "text-gold-300" : "text-platinum-400")}>
                      {coverage(r.reserveRatioPctMilli) ?? "∞"}
                    </span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                    <span
                      className={cn("block h-full rounded-full", r.asset === "XAU" ? "bg-gold-400" : "bg-platinum-400")}
                      style={{ width: `${Math.max(issuedPct, issuedPct > 0 ? 1 : 0)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {data && (
          <div className="flex flex-col gap-2 border-t border-border pt-3.5">
            <span className="text-[0.8125rem] font-bold">{t("floatTitle")}</span>
            <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
              <span className="text-muted-foreground">{t("floatCash")}</span>
              <span className="tnum font-medium">{money(data.float.cashCents)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
              <span className="text-muted-foreground">{t("floatHeadroom")}</span>
              <span className="tnum font-medium">{money(data.float.sellHeadroomCents)}</span>
            </div>
          </div>
        )}
        <p className="mt-auto text-[0.6875rem] leading-relaxed text-subtle">{t("vaultFoot")}</p>
      </div>
    </Panel>
  );
}
