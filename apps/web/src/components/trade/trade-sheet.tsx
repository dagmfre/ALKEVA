"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type {
  BalancesResponse,
  MetalAsset,
  OrderResponse,
  OrderSide,
  PriceLatestResponse,
  QuoteResponse,
} from "@alkeva/shared";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CountdownRing } from "@/components/trade/countdown-ring";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";
import { SystemBanner } from "@/components/system/banner";
import { api, ApiError } from "@/lib/api";
import { grams, gramsToMg, money, timeOfDay } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/** Every machine-readable refusal the API can return (Phase 2, all verified). */
const KNOWN_ERRORS = new Set([
  "stale_price",
  "no_price_data",
  "quote_not_found",
  "quote_expired",
  "quote_consumed",
  "account_frozen",
  "insufficient_balance",
  "insufficient_metal",
  "reserve_halt",
  "float_halt",
  "sellback_ceiling",
  "tier_txn_cap",
  "tier_daily_cap",
  "faucet_limit",
  "amount_too_small",
  "validation_failed",
  "conflict",
]);

/** Refusals that describe a platform-wide state, not this user's mistake. */
const PLATFORM_HALTS = new Set(["reserve_halt", "float_halt", "account_frozen"]);

type Stage = "amount" | "quote" | "done";

export function TradeSheet() {
  const t = useTranslations("trade");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { isOpen, close, asset: initialAsset, side: initialSide, revision, settled } = useTradeSheet();

  const [asset, setAsset] = useState<MetalAsset>(initialAsset);
  const [side, setSide] = useState<OrderSide>(initialSide);
  const [stage, setStage] = useState<Stage>("amount");
  const [gramsInput, setGramsInput] = useState("1");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  /** The quote's full lifetime as the server issued it — the ring's denominator. */
  const [quoteTtl, setQuoteTtl] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** One key per displayed quote — mashing Confirm must replay, not re-buy. */
  const idemKey = useRef<string | null>(null);

  const balances = useResource<BalancesResponse>(isOpen ? "/ledger/balances" : null, { revision });
  const prices = useResource<PriceLatestResponse>(
    isOpen ? `/prices/latest?asset=${asset}` : null,
    { revision },
  );

  useEffect(() => {
    if (!isOpen) return;
    setAsset(initialAsset);
    setSide(initialSide);
    setStage("amount");
    setQuote(null);
    setOrder(null);
    setError(null);
  }, [isOpen, initialAsset, initialSide]);

  useEffect(() => {
    if (!quote) return;
    const tick = () => {
      const left = Math.max(
        0,
        Math.floor((new Date(quote.expiresAt).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [quote]);

  const tick = prices.data;
  const unitCents = tick ? BigInt(tick.etbCentsPerGram) : null;
  const metalLabel = asset === "XAU" ? tc("gold") : tc("platinum");

  const mg = gramsToMg(gramsInput);
  const estimateCents = useMemo(() => {
    if (!unitCents || mg === null) return null;
    return ((unitCents * mg) / 1000n).toString();
  }, [unitCents, mg]);

  const heldMg = balances.data
    ? asset === "XAU"
      ? balances.data.xauMg
      : balances.data.xptMg
    : "0";

  function messageFor(err: unknown): string {
    if (err instanceof ApiError && KNOWN_ERRORS.has(err.code)) {
      return t(`errors.${err.code}` as never);
    }
    return t("errors.generic");
  }

  async function requestQuote() {
    setError(null);
    if (mg === null) {
      setError(t("errors.amount_too_small"));
      return;
    }
    setBusy(true);
    try {
      const q = await api<QuoteResponse>("/quotes", {
        method: "POST",
        body: JSON.stringify({ side, asset, gramsMg: mg.toString() }),
      });
      idemKey.current = crypto.randomUUID();
      setQuoteTtl(
        Math.max(1, Math.round((new Date(q.expiresAt).getTime() - Date.now()) / 1000)),
      );
      setQuote(q);
      setStage("quote");
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Deliberately NOT disabled while in flight. The API is idempotent per
   * quote, and a user who double-taps must get one order — proving that is
   * part of the demo. The label changes so a second tap feels harmless.
   */
  async function confirm() {
    if (!quote || !idemKey.current) return;
    setError(null);
    setBusy(true);
    try {
      const placed = await api<OrderResponse>("/orders", {
        method: "POST",
        body: JSON.stringify({ quoteId: quote.id, idempotencyKey: idemKey.current }),
      });
      setOrder(placed);
      setStage("done");
      settled();
    } catch (err) {
      setError(messageFor(err));
      settled();
    } finally {
      setBusy(false);
    }
  }

  async function faucet() {
    setError(null);
    setBusy(true);
    try {
      await api("/faucet", {
        method: "POST",
        body: JSON.stringify({ amountCents: "20000000" }),
      });
      toast.success(t("faucetOk"));
      balances.reload();
      settled();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  const expired = quote !== null && secondsLeft <= 0;
  const isPlatformHalt = error !== null && [...PLATFORM_HALTS].some((c) => error === t(`errors.${c}` as never));

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && close()}>
      <SheetContent side="bottom" showCloseButton={false} className="gap-0 px-4 pb-6 pt-2.5">
        <div className="mx-auto mb-3.5 h-1 w-9 rounded-full bg-input" />

        {stage === "amount" && (
          <>
            <SheetTitle className="sr-only">{t("title")}</SheetTitle>

            {error && (
              <SystemBanner tone={isPlatformHalt ? "critical" : "caution"}>{error}</SystemBanner>
            )}

            <div className="mb-2.5 flex gap-1.5 rounded-full border border-border bg-background p-1">
              {(["XAU", "XPT"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAsset(a)}
                  className={cn(
                    "min-h-11 flex-1 rounded-full text-[0.9375rem] font-semibold transition-colors",
                    asset === a && a === "XAU" && "bg-gold-500 text-primary-foreground",
                    asset === a && a === "XPT" && "bg-platinum-500 text-primary-foreground",
                    asset !== a && "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {a === "XAU" ? tc("gold") : tc("platinum")}
                </button>
              ))}
            </div>

            <div className="mb-4 flex gap-1.5">
              {(["buy", "sell"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  className={cn(
                    "min-h-11 flex-1 rounded-md border text-[0.9375rem] font-semibold transition-colors",
                    side === s
                      ? "border-gold-400 text-gold-400"
                      : "border-input text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s === "buy" ? t("buy") : t("sell")}
                </button>
              ))}
            </div>

            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="grams" className="text-[0.9375rem] font-medium">
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

            <div className="mb-2.5 flex min-h-15 items-center rounded-md border border-input bg-background px-3.5">
              <input
                id="grams"
                value={gramsInput}
                onChange={(e) => setGramsInput(e.target.value)}
                inputMode="decimal"
                autoComplete="off"
                className="tnum w-full flex-1 border-0 bg-transparent text-[1.75rem] font-semibold outline-none"
              />
              <span className="ms-2 text-base text-muted-foreground">{tc("gram")}</span>
            </div>

            <div className="mb-3.5 flex gap-2">
              {["1", "5", "10"].map((g) => (
                <Button
                  key={g}
                  variant="outline"
                  size="pill"
                  className="tnum flex-1 font-medium"
                  onClick={() => setGramsInput(g)}
                >
                  {g} {tc("g")}
                </Button>
              ))}
              <Button
                variant="outline"
                size="pill"
                className="flex-1 font-medium"
                onClick={() => {
                  if (side === "sell") {
                    setGramsInput((Number(BigInt(heldMg)) / 1000).toString());
                  } else if (unitCents && balances.data) {
                    const affordable = (BigInt(balances.data.etbCents) * 1000n) / unitCents;
                    setGramsInput((Number(affordable) / 1000).toFixed(3));
                  }
                }}
              >
                {t("max")}
              </Button>
            </div>

            <p className="mb-4 text-[0.9375rem] text-muted-foreground">
              ≈ <span className="tnum text-foreground">{estimateCents ? money(estimateCents) : "—"}</span>{" "}
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
            <div className="mb-4 flex items-start justify-between gap-3.5">
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
                {error === t("errors.reserve_halt")
                  ? t("reserveHaltExplain")
                  : error === t("errors.float_halt")
                    ? t("floatHaltExplain")
                    : null}
              </p>
            )}

            {/* Every line always visible before the irreversible tap — no
                disclosure hides what the user is agreeing to pay. Zero-value
                lines are omitted rather than shown as 0.00. */}
            <div
              className={cn(
                "mb-3.5 rounded-lg border border-border bg-background px-4 transition-opacity",
                expired && "opacity-55",
              )}
            >
              <Row label={t("pricePerGram")} value={money(quote.unitEtbCentsPerGram)} divided />
              <Row label={t("grams")} value={grams(quote.gramsMg)} divided />
              <Row label={t("subtotal")} value={money(quote.subtotalCents)} divided />
              <Row label={t("commission")} value={money(quote.feeCents)} divided />
              {quote.taxCents !== "0" && <Row label={t("tax")} value={money(quote.taxCents)} divided />}
              {quote.reforestCents !== "0" && (
                <Row label={t("reforest")} value={money(quote.reforestCents)} divided />
              )}
              <div className="flex items-baseline justify-between py-3.5">
                <span className="text-base font-semibold">
                  {quote.side === "buy" ? t("youPay") : t("youReceive")}
                </span>
                <span className="tnum text-2xl font-semibold">
                  {money(quote.totalCents)}
                  <span className="ms-1.5 font-sans text-[0.9375rem] font-medium text-muted-foreground">
                    {tc("birr")}
                  </span>
                </span>
              </div>
            </div>

            {/* The line that makes this a quote and not a guess. */}
            <p className="mb-4 flex gap-2.5 text-[0.9375rem] text-muted-foreground">
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
              <Button size="cta" className="mb-2" onClick={() => void confirm()}>
                {busy ? t("pending") : t("confirm")}
              </Button>
            )}
            <Button variant="ghost" size="cta" onClick={() => setStage("amount")}>
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
                variant="gold"
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

function Row({ label, value, divided }: { label: string; value: string; divided?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 py-2.5",
        divided && "border-b border-border",
      )}
    >
      <span className="text-[0.9375rem] text-muted-foreground">{label}</span>
      <span className="tnum text-base font-medium">{value}</span>
    </div>
  );
}
