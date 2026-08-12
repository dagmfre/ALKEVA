"use client";

import { useTranslations } from "next-intl";
import type { AdminTreasuryResponse } from "@alkeva/shared";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { coverage, grams, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

/**
 * The dealer's own books: vault vs issued per metal, the cash float against
 * its halt line, today's sell-back usage, and the Chapa merchant balance.
 * All read-only projections — there is nothing here that can edit a number.
 */
export function AdminTreasuryScreen() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const { data } = useResource<AdminTreasuryResponse>("/admin/treasury", {
    intervalMs: 60_000,
  });

  if (!data) return <Skeleton className="h-64 rounded-lg" />;
  const { summary } = data;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("nav.treasury")}</h1>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        {summary.reserves.map((r) => (
          <Card key={r.asset} className="flex flex-col gap-2.5 p-4">
            <h2 className="text-base font-semibold">
              {r.asset === "XAU" ? tc("gold") : tc("platinum")}
            </h2>
            <Row label={t("treasury.physical")} value={`${grams(r.physicalMg)} ${tc("g")}`} />
            <Row label={t("treasury.issued")} value={`${grams(r.issuedMg)} ${tc("g")}`} />
            <Row label={t("treasury.available")} value={`${grams(r.availableMg)} ${tc("g")}`} />
            <Row
              label={t("treasury.coverage")}
              value={coverage(r.reserveRatioPctMilli) ?? "—"}
              strong
            />
          </Card>
        ))}
      </div>

      <Card className="flex flex-col gap-2.5 p-4">
        <h2 className="text-base font-semibold">{t("treasury.floatTitle")}</h2>
        <Row label={t("treasury.cash")} value={`${money(summary.float.cashCents)} ${tc("birr")}`} strong />
        <Row
          label={t("treasury.haltThreshold")}
          value={`${money(summary.float.haltThresholdCents)} ${tc("birr")}`}
        />
        <Row
          label={t("treasury.sellHeadroom")}
          value={`${money(summary.float.sellHeadroomCents)} ${tc("birr")}`}
        />
        <Row
          label={t("treasury.sellbackToday")}
          value={`${money(summary.float.sellbackUsedTodayCents)} / ${money(summary.float.sellbackCeilingCents)} ${tc("birr")}`}
        />
      </Card>

      <Card className="flex flex-col gap-2.5 p-4">
        <h2 className="text-base font-semibold">{t("treasury.chapaTitle")}</h2>
        {data.chapa === null ? (
          <p className="text-[0.9375rem] text-muted-foreground">{t("treasury.chapaUnavailable")}</p>
        ) : (
          data.chapa.map((b) => (
            <Row
              key={b.currency}
              label={t("treasury.chapaAvailable", { currency: b.currency })}
              value={b.availableBalance.toFixed(2)}
              strong
            />
          ))
        )}
      </Card>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[0.9375rem] text-muted-foreground">{label}</span>
      <span className={strong ? "tnum text-base font-semibold text-gold-400" : "tnum text-[0.9375rem]"}>
        {value}
      </span>
    </div>
  );
}
