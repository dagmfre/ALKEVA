"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { ReceiptResponse } from "@alkeva/shared";

import { ArrowLeft, Printer, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Mark } from "@/components/brand/mark";
import { ProofPanel } from "@/components/receipt/proof-panel";
import { eatStamp, grams, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/**
 * A document, not an app screen.
 *
 * This is the artefact a user screenshots and sends to their family, and the
 * one an investor asks to see: a fixed-width document with ruled rows and the
 * serial where an invoice number belongs. On a desk the ledger proof stands
 * beside it at the same height, so the claim and its evidence read together. The
 * provenance block is what separates it from a note — the price was not
 * invented, it came from a named feed at a named instant, and the FX rate that
 * turned an ounce in dollars into a gram in birr is printed beside it.
 *
 * It prints: everything that is chrome carries data-print="hide", and the
 * document itself flips to ink on paper (`globals.css` @media print).
 */
export function ReceiptScreen({ orderId }: { orderId: string }) {
  const t = useTranslations("receipt");
  const tc = useTranslations("common");
  const { data, error, loading } = useResource<ReceiptResponse>(`/orders/${orderId}/receipt`);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: data?.serial ?? "ALKEVA", url });
        return;
      } catch {
        /* user dismissed the share sheet — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("linkCopied"));
    } catch {
      toast.error(tc("somethingWrong"));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[78rem] flex-col gap-3">
      <div className="flex items-center gap-2" data-print="hide">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/receipts">
            <ArrowLeft />
            {t("title")}
          </Link>
        </Button>
        <span className="ms-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer />
            {t("print")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void share()}>
            <Share2 />
            {t("share")}
          </Button>
        </span>
      </div>

      {loading && <Skeleton className="h-[32rem] w-full max-w-[42rem] rounded-lg" />}

      {error && !loading && (
        <p className="max-w-[42rem] rounded-lg border border-border bg-card p-5 text-[0.9375rem] text-muted-foreground">
          {t("notAvailable")}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,42rem)_minmax(0,1fr)]">
      {data && <ReceiptDocument data={data} />}

      {data && <ProofPanel orderId={orderId} />}
      </div>
    </div>
  );
}

/** The receipt document itself — used by the receipt page and the Receipts preview. */
export function ReceiptDocument({ data, className }: { data: ReceiptResponse; className?: string }) {
  const t = useTranslations("receipt");
  const tc = useTranslations("common");
  const tt = useTranslations("trade");
  const th = useTranslations("history");
  const metal = data.asset === "XAU" ? tc("gold") : tc("platinum");

  return (
        <article
          data-print="document"
          className={cn("w-full rounded-xl border border-input bg-card px-5 py-6 lg:px-9 lg:py-8", className)}
        >
          <header className="flex items-start justify-between gap-4 border-b border-input pb-5">
            <span className="flex items-center gap-2.5">
              <Mark size={30} />
              <span className="flex flex-col leading-tight">
                <span className="font-latin text-[1rem] font-extrabold tracking-[0.22em]">
                  ALKEVA
                </span>
                <span className="text-[0.9375rem] leading-snug text-muted-foreground">
                  {t("documentTitle")}
                </span>
              </span>
            </span>
            <span className="flex flex-col items-end gap-0.5">
              <span className="text-[0.9375rem] leading-snug text-muted-foreground">
                {t("serialLabel")}
              </span>
              <span className="tnum text-[1.1875rem] font-semibold text-gold-300">
                {data.serial}
              </span>
            </span>
          </header>

          <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 border-b border-border py-4 sm:grid-cols-2">
            <Meta label={t("dateTime")} value={eatStamp(data.settledAt)} tnum />
            <Meta label={t("status")} value={`✓ ${th("settled")}`} tone="gain" />
            <Meta
              label={t("transaction")}
              value={`${data.side === "buy" ? tt("buy") : tt("sell")} · ${metal} (${data.asset})`}
            />
            <Meta label={t("quantity")} value={`${grams(data.gramsMg)} ${tc("gram")}`} tnum />
          </div>

          <dl className="pt-1">
            <Row label={tt("pricePerGram")} value={money(data.unitEtbCentsPerGram)} />
            <Row label={tt("grams")} value={grams(data.gramsMg)} />
            <Row label={tt("subtotal")} value={money(data.subtotalCents)} />
            <Row
              label={`${tt("commission")} ${(data.commissionPctMilli / 1000).toFixed(2)}%`}
              value={money(data.feeCents)}
              strong
            />
            {data.taxCents !== "0" && <Row label={tt("tax")} value={money(data.taxCents)} />}
            {data.reforestCents !== "0" && (
              <Row label={tt("reforest")} value={money(data.reforestCents)} />
            )}
            <div className="flex items-baseline justify-between gap-3 pb-1 pt-4">
              <dt className="text-[1.0625rem] font-semibold">
                {data.side === "buy" ? t("totalPaid") : t("totalReceived")}
              </dt>
              <dd className="tnum text-[1.625rem] font-semibold tracking-[-0.02em] text-gold-300">
                {money(data.totalCents)}
                <span className="ms-1.5 font-sans text-[0.9375rem] font-medium text-muted-foreground">
                  {tc("birr")}
                </span>
              </dd>
            </div>
          </dl>

          <div className="well mt-4 rounded-md px-4 py-3.5">
            <div className="mb-2 text-[0.9375rem] font-semibold leading-normal">
              {t("priceSource")}
            </div>
            <SourceLine label={t("source")} value={data.price.source} />
            <SourceLine label={t("priceTime")} value={eatStamp(data.price.at)} />
            <SourceLine
              label={t("fxRate")}
              value={`${(Number(BigInt(data.price.etbRateMicro)) / 1_000_000).toFixed(2)} ${tc(
                "birr",
              )} / USD · ${data.price.fxSource}`}
            />
          </div>

          <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted-foreground">
            {t("custodyNote", { grams: grams(data.gramsMg), metal })}
          </p>

          <footer className="mt-5 flex flex-wrap gap-x-7 gap-y-2 border-t border-border pt-5">
            <Reference label="ORDER ID" value={data.orderId} />
            {data.ledgerTransactionId && (
              <Reference label="LEDGER TX" value={data.ledgerTransactionId} />
            )}
          </footer>
        </article>
  );
}

function Meta({
  label,
  value,
  tnum,
  tone,
}: {
  label: string;
  value: string;
  tnum?: boolean;
  tone?: "gain";
}) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="data-label">{label}</span>
      <span
        className={`text-[0.9375rem] font-semibold ${tnum ? "tnum font-medium" : ""} ${
          tone === "gain" ? "text-gain" : ""
        }`}
      >
        {value}
      </span>
    </span>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 border-b py-3 ${
        strong ? "border-input" : "border-border"
      }`}
    >
      <dt className="text-[0.875rem] text-muted-foreground">{label}</dt>
      <dd className="tnum text-[0.9375rem] font-medium">{value}</dd>
    </div>
  );
}

function SourceLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 py-0.5">
      <span className="text-[0.8125rem] text-muted-foreground">{label}</span>
      <span className="tnum text-[0.8125rem]">{value}</span>
    </div>
  );
}

function Reference({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="data-label text-[0.6875rem]">{label}</span>
      <span className="tnum break-all text-[0.75rem] text-muted-foreground">
        {value}
      </span>
    </span>
  );
}
