"use client";

import { useTranslations } from "next-intl";
import type { MetalAsset, TreasurySummaryResponse } from "@alkeva/shared";

import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { coverage, grams } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

/**
 * The bank-facing component: proof that the metal behind a balance exists.
 *
 * Coverage is shown as a multiple ("38.9×"), not a 0–100% gauge — the demo
 * vault is backed tens of times over and a gauge would read as broken. All
 * three figures are derived inside the API from the ledger and the vault
 * records; nothing here is stored or editable.
 */
export function TrustPanel({ asset }: { asset: MetalAsset }) {
  const t = useTranslations("home");
  const { data, loading } = useResource<TreasurySummaryResponse>("/treasury/summary", {
    intervalMs: 60_000,
  });

  const reserve = data?.reserves.find((r) => r.asset === asset) ?? null;

  return (
    <Card className="mb-3.5 p-4">
      <CardTitle className="mb-1">{t("vaultTitle")}</CardTitle>
      <p className="mb-3.5 text-[0.9375rem] text-muted-foreground">{t("vaultBody")}</p>

      <div className="flex gap-2">
        <Figure label={t("inVault")} loading={loading}>
          {reserve ? grams(reserve.physicalMg) : "—"}
        </Figure>
        <Figure label={t("issued")} loading={loading}>
          {reserve ? grams(reserve.issuedMg) : "—"}
        </Figure>
        <Figure label={t("coverage")} loading={loading} gold>
          {reserve ? (coverage(reserve.reserveRatioPctMilli) ?? "∞") : "—"}
        </Figure>
      </div>
    </Card>
  );
}

function Figure({
  label,
  children,
  loading,
  gold,
}: {
  label: string;
  children: React.ReactNode;
  loading: boolean;
  gold?: boolean;
}) {
  return (
    <div className="flex-1 rounded-md border border-border bg-background px-3 py-2.5">
      <div className="text-[0.9375rem] leading-snug text-muted-foreground">{label}</div>
      {loading ? (
        <Skeleton className="mt-1.5 h-5 w-16" />
      ) : (
        <div className={`tnum mt-0.5 text-[1.125rem] font-semibold ${gold ? "text-gold-400" : ""}`}>
          {children}
        </div>
      )}
    </div>
  );
}
