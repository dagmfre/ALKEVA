"use client";

import { useTranslations } from "next-intl";
import type { MetalAsset, TreasurySummaryResponse } from "@alkeva/shared";

import { Skeleton } from "@/components/ui/skeleton";
import { coverage, grams } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/**
 * The bank-facing component: proof that the metal behind a balance exists.
 *
 * Coverage is shown as a multiple ("38.9×"), not a 0–100% gauge — the demo
 * vault is backed tens of times over and a gauge would read as broken. All
 * three figures are derived inside the API from the ledger and the vault
 * records; nothing here is stored or editable. The "backed" chip is a computed
 * claim (physical ≥ issued), not a badge someone typed.
 */
export function TrustPanel({ asset, className }: { asset: MetalAsset; className?: string }) {
  const t = useTranslations("home");
  const { data, loading } = useResource<TreasurySummaryResponse>("/treasury/summary", {
    intervalMs: 60_000,
  });

  const reserve = data?.reserves.find((r) => r.asset === asset) ?? null;
  const backed =
    reserve !== null &&
    (reserve.reserveRatioPctMilli === null || BigInt(reserve.reserveRatioPctMilli) >= 100_000n);

  return (
    <section
      className={cn("flex flex-col rounded-lg border border-border bg-card p-4 lg:p-5", className)}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[1.125rem] font-semibold leading-normal">{t("vaultTitle")}</h2>
        {backed && (
          <span className="rounded-sm border border-gain/45 px-2.5 py-0.5 text-[0.9375rem] font-semibold text-gain">
            ✓ {t("backed")}
          </span>
        )}
      </div>

      <p className="mb-3.5 mt-1.5 text-[0.9375rem] leading-relaxed text-muted-foreground">
        {t("vaultBody")}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Figure label={t("inVault")} loading={loading} unit={t("gramUnit")}>
          {reserve ? grams(reserve.physicalMg) : "—"}
        </Figure>
        <Figure label={t("issued")} loading={loading} unit={t("gramUnit")}>
          {reserve ? grams(reserve.issuedMg) : "—"}
        </Figure>
      </div>

      <div className="well mt-2 flex items-center justify-between rounded-md px-3 py-3">
        <span className="text-[0.9375rem] text-muted-foreground">{t("coverage")}</span>
        {loading ? (
          <Skeleton className="h-6 w-16" />
        ) : (
          <span className="tnum text-[1.375rem] font-semibold text-gold-400">
            {reserve ? (coverage(reserve.reserveRatioPctMilli) ?? "∞") : "—"}
          </span>
        )}
      </div>
    </section>
  );
}

function Figure({
  label,
  children,
  loading,
  unit,
}: {
  label: string;
  children: React.ReactNode;
  loading: boolean;
  unit?: string;
}) {
  return (
    <div className="well flex flex-col gap-0.5 rounded-md px-3 py-2.5">
      <span className="text-[0.9375rem] leading-snug text-muted-foreground">{label}</span>
      {loading ? (
        <Skeleton className="mt-1 h-5 w-16" />
      ) : (
        <span className="tnum text-base font-semibold">
          {children}
          {unit && (
            <span className="ms-1 font-sans text-[0.9375rem] font-normal text-muted-foreground">
              {unit}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
