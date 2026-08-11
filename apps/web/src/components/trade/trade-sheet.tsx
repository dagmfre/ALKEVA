"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CountdownRing } from "@/components/trade/countdown-ring";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";
import { useTradeForm } from "@/components/trade/use-trade-form";
import { SystemBanner } from "@/components/system/banner";
import { grams, money, timeOfDay } from "@/lib/format";
import { cn } from "@/lib/utils";

const QUICK_GRAMS = ["1", "5", "10"];

/**
 * The phone trade surface: a bottom sheet over whatever screen prompted the
 * trade. All quoting/ordering behaviour lives in useTradeForm — this file is
 * presentation only, and the desktop workspace mounts the same hook.
 */
export function TradeSheet() {
  const t = useTranslations("trade");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { isOpen, close, asset: initialAsset, side: initialSide, revision, settled } = useTradeSheet();

  const form = useTradeForm({
    active: isOpen,
    initialAsset,
    initialSide,
    revision,
    settled,
    onFaucetSuccess: () => toast.success(t("faucetOk")),
  });
  const {
    asset,
    setAsset,
    side,
    setSide,
    stage,
    gramsInput,
    setGramsInput,
    quote,
    order,
    secondsLeft,
    quoteTtl,
    busy,
    errorCode,
    isPlatformHalt,
    expired,
    balances,
    tick,
    estimateCents,
    heldMg,
    requestQuote,
    confirm: confirmOrder,
    faucet,
    setMax,
    backToAmount,
  } = form;

  const metalLabel = asset === "XAU" ? tc("gold") : tc("platinum");
  const error = errorCode ? t(`errors.${errorCode}` as never) : null;

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && close()}>
      <SheetContent side="bottom" showCloseButton={false} className="gap-0 px-4 pb-6 pt-2.5">
        <div className="mx-auto mb-3.5 h-1 w-10 rounded-full bg-input" />

        {stage === "amount" && (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <SheetTitle className="text-[1.125rem] font-semibold">
                {side === "buy"
                  ? t("buyTitleShort", { metal: metalLabel })
                  : t("sellTitleShort", { metal: metalLabel })}
              </SheetTitle>
              {tick && (
                <span className="tnum text-[0.9375rem] text-muted-foreground">
                  {money(tick.etbCentsPerGram)}{" "}
                  <span className="font-sans">
                    {tc("birr")}/{tc("g")}
                  </span>
                </span>
              )}
            </div>

            {error && (
              <SystemBanner tone={isPlatformHalt ? "critical" : "caution"}>{error}</SystemBanner>
            )}

            <div className="mb-2.5 flex gap-1.5 rounded-full bg-well p-1">
              {(["XAU", "XPT"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAsset(a)}
                  aria-pressed={asset === a}
                  className={cn(
                    "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full text-[0.9375rem] transition-colors",
                    asset === a
                      ? "pill-active font-semibold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      a === "XAU" ? "bg-gold-500" : "bg-platinum-400",
                    )}
                  />
                  {a === "XAU" ? tc("gold") : tc("platinum")}
                </button>
              ))}
            </div>

            <div className="mb-3.5 flex gap-1.5 rounded-full bg-well p-1">
              {(["buy", "sell"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  aria-pressed={side === s}
                  className={cn(
                    "min-h-11 flex-1 rounded-full text-[0.9375rem] transition-colors",
                    side === s
                      ? "pill-active font-semibold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s === "buy" ? t("buy") : t("sell")}
                </button>
              ))}
            </div>

            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="grams" className="text-[0.9375rem] text-gold-400">
                {t("amount")}
              </label>
              <span className="text-[0.9375rem] text-muted-foreground">
                {side === "buy" ? t("availableBirr") : t("availableMetal")}{" "}
                <span className="tnum text-foreground">
                  {side === "buy"
                    ? money(balances.data?.etbCents ?? "0")
                    : `${grams(heldMg)} ${tc("g")}`}
                </span>
              </span>
            </div>

            <div className="well mb-2.5 flex min-h-[54px] items-center gap-2.5 rounded-md pe-2 ps-3.5">
              <input
                id="grams"
                value={gramsInput}
                onChange={(e) => setGramsInput(e.target.value)}
                inputMode="decimal"
                autoComplete="off"
                className="tnum w-full flex-1 border-0 bg-transparent text-[1.375rem] font-semibold outline-none"
              />
              <span className="text-[0.9375rem] text-muted-foreground">{tc("gram")}</span>
              <button
                type="button"
                onClick={setMax}
                className="font-latin inline-flex min-h-11 items-center rounded-full border border-input px-4 text-[0.8125rem] font-semibold text-gold-400"
              >
                MAX
              </button>
            </div>

            <div className="mb-3.5 flex gap-2">
              {QUICK_GRAMS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGramsInput(g)}
                  className={cn(
                    "tnum min-h-11 flex-1 rounded-full border text-[0.9375rem] transition-colors",
                    gramsInput === g
                      ? "border-gold-500 font-semibold text-gold-400"
                      : "border-input text-muted-foreground",
                  )}
                >
                  {g} {tc("g")}
                </button>
              ))}
              <button
                type="button"
                onClick={setMax}
                className="min-h-11 flex-1 rounded-full border border-input text-[0.9375rem] text-muted-foreground"
              >
                {t("max")}
              </button>
            </div>

            <p className="mb-3.5 text-[0.9375rem] text-muted-foreground">
              ≈{" "}
              <span className="tnum text-foreground">
                {estimateCents ? money(estimateCents) : "—"}
              </span>{" "}
              {t("atCurrentPrice")}
            </p>

            <Button variant="demo" size="cta" className="mb-2.5" onClick={() => void faucet()} disabled={busy}>
              {t("faucet")}
            </Button>

            <Button size="cta" onClick={() => void requestQuote()} disabled={busy}>
              {t("getQuote")}
            </Button>
          </>
        )}

        {stage === "quote" && quote && (
          <>
            <div className="mb-3.5 flex items-start justify-between gap-3.5">
              <div>
                <SheetTitle className="text-[1.125rem] font-semibold">
                  {side === "buy"
                    ? t("buyTitle", { metal: metalLabel, grams: grams(quote.gramsMg) })
                    : t("sellTitle", { metal: metalLabel, grams: grams(quote.gramsMg) })}
                </SheetTitle>
                <p
                  className={cn(
                    "text-[0.9375rem]",
                    expired ? "text-platinum-400" : secondsLeft <= 5 ? "text-loss" : "text-muted-foreground",
                  )}
                >
                  {expired ? t("expired") : t("expiresIn", { seconds: secondsLeft })}
                </p>
              </div>
              <CountdownRing seconds={secondsLeft} total={quoteTtl} />
            </div>

            {error && (
              <SystemBanner tone={isPlatformHalt ? "critical" : "caution"}>{error}</SystemBanner>
            )}
            {isPlatformHalt && (
              <p className="mb-3.5 text-[0.9375rem] text-muted-foreground">
                {errorCode === "reserve_halt"
                  ? t("reserveHaltExplain")
                  : errorCode === "float_halt"
                    ? t("floatHaltExplain")
                    : null}
              </p>
            )}

            {/* Every line always visible before the irreversible tap — no
                disclosure hides what the user is agreeing to pay. Zero-value
                lines are omitted rather than shown as 0.00. */}
            <div
              className={cn(
                "well mb-3.5 rounded-md px-4 pb-3 pt-1 transition-opacity",
                expired && "opacity-55",
              )}
            >
              <Row label={t("pricePerGram")} value={money(quote.unitEtbCentsPerGram)} />
              <Row label={t("grams")} value={grams(quote.gramsMg)} />
              <Row label={t("subtotal")} value={money(quote.subtotalCents)} />
              <Row label={t("commission")} value={money(quote.feeCents)} />
              {quote.taxCents !== "0" && <Row label={t("tax")} value={money(quote.taxCents)} />}
              {quote.reforestCents !== "0" && (
                <Row label={t("reforest")} value={money(quote.reforestCents)} />
              )}
              <div className="mt-1 flex items-baseline justify-between border-t border-input pt-3">
                <span className="text-base font-semibold">
                  {quote.side === "buy" ? t("youPay") : t("youReceive")}
                </span>
                <span className="tnum text-[1.375rem] font-semibold text-gold-400">
                  {money(quote.totalCents)}
                  <span className="ms-1.5 font-sans text-[0.9375rem] font-medium text-muted-foreground">
                    {tc("birr")}
                  </span>
                </span>
              </div>
            </div>

            {/* The line that makes this a quote and not a guess. */}
            <p className="mb-3.5 flex gap-2.5 text-[0.9375rem] text-subtle">
              <span aria-hidden="true" className="text-gold-400">
                ◆
              </span>
              <span>
                {t("provenance", {
                  source: tick?.source ?? "—",
                  time: timeOfDay(quote.priceAt, locale),
                })}
              </span>
            </p>

            {expired ? (
              <Button size="cta" className="mb-2" onClick={() => void requestQuote()} disabled={busy}>
                {t("newQuote")}
              </Button>
            ) : (
              <Button size="cta" className="mb-2" onClick={() => void confirmOrder()}>
                {busy ? t("pending") : t("confirm")}
              </Button>
            )}
            <Button variant="ghost" size="cta" onClick={backToAmount}>
              {t("cancel")}
            </Button>
          </>
        )}

        {stage === "done" && order && (
          <>
            {order.status === "settled" ? (
              <div className="mb-4 flex items-start gap-3">
                <span aria-hidden="true" className="text-[1.125rem] leading-normal text-gain">
                  ✓
                </span>
                <div>
                  <SheetTitle className="text-[1.125rem] font-semibold">{t("settledTitle")}</SheetTitle>
                  <p className="mt-0.5 text-[0.9375rem] text-muted-foreground">
                    {order.side === "buy"
                      ? t("settledBuyBody", { grams: grams(order.gramsMg), metal: metalLabel })
                      : t("settledSellBody", { grams: grams(order.gramsMg), metal: metalLabel })}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mb-4">
                <SheetTitle className="text-[1.125rem] font-semibold">{t("reviewTitle")}</SheetTitle>
                <p className="mt-1 text-[0.9375rem] text-muted-foreground">{t("reviewBody")}</p>
              </div>
            )}

            {order.status === "settled" && (
              /*
               * Navigate first, then close. As an <a> inside the sheet, Radix
               * unmounts the anchor during its close animation before Next's
               * client-side navigation commits — the sheet shuts and the user
               * never reaches the receipt.
               */
              <Button
                size="cta"
                className="mb-2"
                onClick={() => {
                  router.push(`/receipt/${order.id}`);
                  close();
                }}
              >
                {t("viewReceipt")}
              </Button>
            )}
            <Button variant="ghost" size="cta" onClick={close}>
              {t("done")}
            </Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-[0.9375rem] text-muted-foreground">{label}</span>
      <span className="tnum text-base font-medium">{value}</span>
    </div>
  );
}
