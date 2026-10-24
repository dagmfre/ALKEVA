"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { OrderSide } from "@alkeva/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { CountdownRing } from "@/components/trade/countdown-ring";
import type { AmountUnit, useTradeForm } from "@/components/trade/use-trade-form";
import { grams, money, timeOfDay } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The order ticket body: side, amount (grams or birr, 25/50/75/Max), then the
 * held quote with its countdown and every fee line, then Confirm. The desk
 * panel and the phone sheet both render exactly this, on the same hook.
 */
export function OrderTicket({
  form,
  onReceipt,
}: {
  form: ReturnType<typeof useTradeForm>;
  /** Called before following the receipt link (the sheet closes itself). */
  onReceipt?: () => void;
}) {
  const t = useTranslations("trade");
  const tc = useTranslations("common");
  const locale = useLocale();
  const {
    asset,
    side,
    setSide,
    stage,
    unit,
    setUnit,
    amountInput,
    setAmountInput,
    mg,
    quote,
    order,
    secondsLeft,
    quoteTtl,
    busy,
    expired,
    balances,
    tick,
    estimateCents,
    heldMg,
    requestQuote,
    confirm,
    setFraction,
    backToAmount,
  } = form;
  const [chip, setChip] = useState<25 | 50 | 75 | 100 | null>(null);
  const metal = asset === "XAU" ? tc("gold") : tc("platinum");

  if (stage === "done" && order) {
    return (
      <SettledBody
        orderId={order.id}
        status={order.status}
        side={order.side}
        gramsMg={order.gramsMg}
        metal={metal}
        onAgain={backToAmount}
        onReceipt={onReceipt}
      />
    );
  }

  return (
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 pb-4">
        <Segmented
          value={side}
          onValueChange={(s) => {
            setSide(s);
            setChip(null);
          }}
          size="lg"
          stretch
          aria-label={t("sideLabel")}
          options={[
            { value: "buy", label: t("buy"), tone: "gold" },
            { value: "sell", label: t("sell"), tone: "ink" },
          ]}
        />

        <div className="flex flex-col gap-2">
          <Row label={side === "buy" ? t("availableBirr") : t("heldMetal", { metal })}>
            {balances.data ? (
              side === "buy" ? (
                <>
                  {money(balances.data.etbCents)} <Unit>{tc("birr")}</Unit>
                </>
              ) : (
                <>
                  {grams(heldMg)} <Unit>{tc("g")}</Unit>
                </>
              )
            ) : (
              <Skeleton className="h-4 w-24" />
            )}
          </Row>
          <Row label={t("currentPrice")}>
            {tick ? (
              <span className={asset === "XAU" ? "text-gold-300" : "text-platinum-400"}>
                {money(tick.etbCentsPerGram)}
              </span>
            ) : (
              <Skeleton className="h-4 w-20" />
            )}
          </Row>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label htmlFor="trade-amount" className="data-label">
              {t("amount")}
            </label>
            <Segmented<AmountUnit>
              value={unit}
              onValueChange={(u) => {
                setUnit(u);
                setChip(null);
              }}
              size="sm"
              aria-label={t("amount")}
              options={[
                { value: "g", label: t("unitGrams") },
                { value: "etb", label: t("unitBirr") },
              ]}
            />
          </div>
          <div
            className={cn(
              "flex h-12 items-center gap-2.5 rounded-md border border-border bg-panel-2 px-3.5 transition-[border-color,box-shadow] duration-150",
              "focus-within:border-gold-500 focus-within:shadow-[0_0_0_3px_oklch(0.717_0.098_73.3/0.18)]",
              stage === "quote" && "opacity-60",
            )}
          >
            <input
              id="trade-amount"
              value={amountInput}
              onChange={(e) => {
                setAmountInput(e.target.value);
                setChip(null);
              }}
              disabled={stage === "quote"}
              inputMode="decimal"
              autoComplete="off"
              className="tnum w-full min-w-0 flex-1 border-0 bg-transparent text-[1.0625rem] font-medium outline-none"
            />
            <span className="tnum text-[0.875rem] text-muted-foreground">
              {unit === "g" ? tc("g") : tc("birr")}
            </span>
          </div>
          {stage !== "quote" && (
            <div className="grid grid-cols-4 gap-1.5">
              {([25, 50, 75, 100] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setFraction(p);
                    setChip(p);
                  }}
                  className={cn(
                    "tnum h-[1.875rem] rounded-full border text-[0.75rem] font-medium transition-colors",
                    chip === p
                      ? "border-gold-400/45 bg-gold-400/8 text-gold-300"
                      : "border-input text-muted-foreground hover:border-white/25 hover:text-foreground",
                  )}
                >
                  {p === 100 ? t("max") : `${p}%`}
                </button>
              ))}
            </div>
          )}
          {unit === "etb" && (
            <p className="text-[0.75rem] leading-snug text-subtle">
              {t("birrNote")}
              {mg !== null && (
                <span className="tnum ms-1 text-muted-foreground">
                  ≈ {grams(mg)} {tc("g")}
                </span>
              )}
            </p>
          )}
        </div>

        {stage === "quote" && quote ? (
          <>
            <div
              className={cn(
                "well flex flex-col gap-2 rounded-[0.75rem] p-3.5 transition-opacity",
                expired && "opacity-55",
              )}
            >
              <div className="mb-0.5 flex items-center justify-between">
                <span className="text-[0.8125rem] font-bold">{t("yourPrice")}</span>
                <span className="tnum flex items-center gap-2 text-[0.75rem] text-gold-300">
                  <CountdownRing seconds={secondsLeft} total={quoteTtl} size="sm" />
                  {expired ? t("expiredShort") : `${secondsLeft} s`}
                </span>
              </div>
              <Row label={t("pricePerGram")}>{money(quote.unitEtbCentsPerGram)}</Row>
              <Row label={t("grams")}>{grams(quote.gramsMg)}</Row>
              <Row label={t("subtotal")}>{money(quote.subtotalCents)}</Row>
              <Row label={t("commission")}>{money(quote.feeCents)}</Row>
              {quote.taxCents !== "0" && <Row label={t("tax")}>{money(quote.taxCents)}</Row>}
              {quote.reforestCents !== "0" && (
                <Row label={t("reforest")}>{money(quote.reforestCents)}</Row>
              )}
              <div className="my-0.5 h-px bg-border" />
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[0.875rem] font-bold">
                  {quote.side === "buy" ? t("youPay") : t("youReceive")}
                </span>
                <span className="tnum text-[1rem] font-semibold">
                  {money(quote.totalCents)} <Unit>{tc("birr")}</Unit>
                </span>
              </div>
            </div>

            <p className="text-[0.71875rem] leading-relaxed text-subtle">
              {t("provenance", {
                source: tick?.source ?? "—",
                time: timeOfDay(quote.priceAt, locale),
              })}
            </p>

            <div className="mt-auto flex flex-col gap-1.5">
              {expired ? (
                <Button size="cta" onClick={() => void requestQuote()} disabled={busy}>
                  {t("newQuote")}
                </Button>
              ) : (
                <Button
                  size="cta"
                  variant={quote.side === "buy" ? "default" : "ink"}
                  onClick={() => void confirm()}
                >
                  {busy
                    ? t("pending")
                    : t(quote.side === "buy" ? "confirmBuy" : "confirmSell", {
                        grams: grams(quote.gramsMg),
                        metal,
                      })}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={backToAmount}>
                {t("changeAmount")}
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* The same box the quote will fill, so the ticket never jumps and
                the reader sees what is fixed and what is not before asking. */}
            <div className="flex flex-col gap-2 rounded-[0.75rem] border border-dashed border-input p-3.5">
              <div className="mb-0.5 flex items-center justify-between">
                <span className="text-[0.8125rem] font-bold">{t("estimate")}</span>
                <span className="data-label">{t("liveNotHeld")}</span>
              </div>
              <Row label={t("pricePerGram")}>{tick ? money(tick.etbCentsPerGram) : "—"}</Row>
              <Row label={t("grams")}>{mg !== null ? grams(mg) : "—"}</Row>
              <Row label={t("metalValueRow")}>{estimateCents ? money(estimateCents) : "—"}</Row>
              <Row label={t("commission")}>
                <span className="font-sans text-subtle">{t("onTheQuote")}</span>
              </Row>
              <div className="my-0.5 h-px bg-border" />
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[0.875rem] font-bold">
                  {side === "buy" ? t("youPay") : t("youReceive")}
                </span>
                <span className="tnum text-[1rem] font-semibold text-muted-foreground">
                  {estimateCents ? `≈ ${money(estimateCents)}` : "—"} <Unit>{tc("birr")}</Unit>
                </span>
              </div>
            </div>
            <div className="mt-auto flex flex-col gap-2">
              <Button
                size="cta"
                variant={side === "buy" ? "default" : "ink"}
                onClick={() => void requestQuote()}
                disabled={busy || mg === null}
              >
                {t("getQuote")}
              </Button>
              <span className="data-label text-center">{t("heldFor")}</span>
            </div>
          </>
        )}
      </div>
  );
}

export function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
      <span className="text-muted-foreground">{label}</span>
      <span className="tnum text-end font-medium">{children}</span>
    </div>
  );
}

function Unit({ children }: { children: React.ReactNode }) {
  return <span className="font-sans text-[0.75rem] font-medium text-subtle">{children}</span>;
}

/** No confetti. A settled trade is a receipt, not a celebration. */
function SettledBody({
  orderId,
  status,
  side,
  gramsMg,
  metal,
  onAgain,
  onReceipt,
}: {
  orderId: string;
  status: string;
  side: OrderSide;
  gramsMg: string;
  metal: string;
  onAgain: () => void;
  onReceipt?: () => void;
}) {
  const t = useTranslations("trade");

  if (status !== "settled") {
    return (
      <div className="flex flex-1 flex-col gap-2 px-4 pb-4">
        <Badge variant="platinum" dot className="self-start">
          {t("reviewTitle")}
        </Badge>
        <p className="text-[0.875rem] leading-relaxed text-muted-foreground">{t("reviewBody")}</p>
        <Button variant="outline" size="cta" className="mt-auto" onClick={onAgain}>
          {t("done")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 px-4 pb-4">
      <span className="grid size-11 place-items-center rounded-full bg-gain/12 text-[1.25rem] text-gain" aria-hidden="true">
        ✓
      </span>
      <div>
        <h3 className="text-[1.0625rem] font-bold">{t("settledTitle")}</h3>
        <p className="mt-1 text-[0.875rem] leading-relaxed text-muted-foreground">
          {side === "buy"
            ? t("settledBuyBody", { grams: grams(gramsMg), metal })
            : t("settledSellBody", { grams: grams(gramsMg), metal })}
        </p>
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <Button size="cta" asChild>
          <Link href={`/receipt/${orderId}`} onClick={onReceipt}>
            {t("viewReceipt")}
          </Link>
        </Button>
        <Button variant="outline" onClick={onAgain}>
          {t("tradeAgain")}
        </Button>
      </div>
    </div>
  );
}
