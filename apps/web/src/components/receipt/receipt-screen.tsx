"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReceiptResponse } from "@alkeva/shared";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Mark } from "@/components/brand/mark";
import { grams, longDate, money, timeOfDay } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

/**
 * A document, not an app screen.
 *
 * This is the artefact a user screenshots and sends to their family, and the
 * one an investor asks to see: tighter type, ruled rows, a near-square corner
 * radius instead of the app's 14px, and the serial where an invoice number
 * belongs. The provenance block at the foot is what separates it from a note —
 * the price was not invented, it came from a named feed at a named moment.
 */
export function ReceiptScreen({ orderId }: { orderId: string }) {
  const t = useTranslations("receipt");
  const tc = useTranslations("common");
  const tt = useTranslations("trade");
  const locale = useLocale();
  const { data, error, loading } = useResource<ReceiptResponse>(`/orders/${orderId}/receipt`);

  return (
    <>
      <header className="-mx-4 mb-4 flex items-center gap-2.5 border-b border-border px-2 pb-3">
        <Link
          href="/history"
          aria-label={tc("back")}
          className="flex min-h-11 min-w-11 items-center justify-center text-foreground"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
            <path d="M14.5 5 8 12l6.5 7" />
          </svg>
        </Link>
        <h1 className="text-[1.0625rem] font-semibold">{t("title")}</h1>
      </header>

      {loading && <Skeleton className="h-96 w-full rounded-sm" />}

      {error && !loading && (
        <Card className="p-5 text-[0.9375rem] text-muted-foreground">{t("notAvailable")}</Card>
      )}

      {data && (
        <article className="rounded-sm border border-border bg-[oklch(0.222_0.004_95)] px-5 py-6">
          <div className="flex items-start justify-between gap-3.5 border-b border-border pb-4">
            <span className="flex items-center gap-2.5">
              <Mark size={24} />
              <span className="font-latin text-[0.9375rem] font-semibold tracking-[0.01em]">
                ALKEVA
              </span>
            </span>
            <div className="text-end">
              <div className="font-latin text-[0.6875rem] tracking-[0.06em] text-subtle">
                RECEIPT
              </div>
              <div className="tnum mt-0.5 text-base font-semibold text-gold-400">{data.serial}</div>
            </div>
          </div>

          <h2 className="mb-0.5 mt-4 text-[1.125rem] font-semibold">
            {data.side === "buy"
              ? t("buyTitle", { metal: data.asset === "XAU" ? tc("gold") : tc("platinum") })
              : t("sellTitle", { metal: data.asset === "XAU" ? tc("gold") : tc("platinum") })}
          </h2>
          <p className="mb-3.5 text-[0.9375rem] text-muted-foreground">
            {longDate(data.settledAt, locale)} · {timeOfDay(data.settledAt, locale)}
          </p>

          <dl className="border-t border-border">
            <Row label={t("metal")}>
              {data.asset === "XAU" ? tc("gold") : tc("platinum")} ({data.asset})
            </Row>
            <Row label={t("quantity")} tnum>
              {grams(data.gramsMg)} <span className="font-sans">{tc("g")}</span>
            </Row>
            <Row label={tt("pricePerGram")} tnum>
              {money(data.unitEtbCentsPerGram)}
            </Row>
            <Row label={tt("subtotal")} tnum>
              {money(data.subtotalCents)}
            </Row>
            <Row
              label={`${tt("commission")} (${(data.commissionPctMilli / 1000).toFixed(2)}%)`}
              tnum
            >
              {money(data.feeCents)}
            </Row>
            {data.taxCents !== "0" && (
              <Row label={tt("tax")} tnum>
                {money(data.taxCents)}
              </Row>
            )}
            {data.reforestCents !== "0" && (
              <Row label={tt("reforest")} tnum>
                {money(data.reforestCents)}
              </Row>
            )}
            <div className="flex items-baseline justify-between gap-3 border-b-2 border-input py-3.5">
              <dt className="text-base font-semibold">
                {data.side === "buy" ? t("totalPaid") : t("totalReceived")}
              </dt>
              <dd className="tnum text-xl font-semibold">
                {money(data.totalCents)}
                <span className="ms-1.5 font-sans text-sm font-medium text-muted-foreground">
                  {tc("birr")}
                </span>
              </dd>
            </div>
          </dl>

          <div className="mt-4">
            <div className="text-[0.9375rem] text-muted-foreground">{t("priceSource")}</div>
            <div className="tnum mt-0.5 text-[0.8125rem] leading-relaxed text-foreground">
              {data.price.source} · {new Date(data.price.at).toISOString().replace("T", " ").slice(0, 19)} UTC
              <br />
              USD/ETB {(Number(BigInt(data.price.etbRateMicro)) / 1_000_000).toFixed(4)} ·{" "}
              {data.price.fxSource}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3.5">
            <Reference label={t("orderId")} value={data.orderId} />
            {data.ledgerTransactionId && (
              <Reference label={t("ledgerId")} value={data.ledgerTransactionId} />
            )}
          </div>
        </article>
      )}
    </>
  );
}

function Row({
  label,
  children,
  tnum,
}: {
  label: string;
  children: React.ReactNode;
  tnum?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2.5">
      <dt className="text-[0.9375rem] text-muted-foreground">{label}</dt>
      <dd className={`text-[0.9375rem] font-medium ${tnum ? "tnum" : ""}`}>{children}</dd>
    </div>
  );
}

function Reference({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[0.9375rem] leading-snug text-subtle">{label}</div>
      <div className="font-latin break-all text-xs tracking-[0.01em] text-muted-foreground">
        {value}
      </div>
    </div>
  );
}
