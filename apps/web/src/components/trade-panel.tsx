"use client";

/**
 * Phase 2 throwaway trade UI — two buttons and numbers, by design
 * (Phase-Plan ground rule: no UI investment until the money core works).
 * Phase 3 replaces this with the real buy/sell screens.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { MetalAsset, OrderResponse, OrderSide, QuoteResponse } from "@alkeva/shared";
import { api, ApiError } from "@/lib/api";

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

function formatEtb(cents: string): string {
  const birr = Number(BigInt(cents)) / 100;
  return new Intl.NumberFormat("en-ET", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(birr);
}

export function TradePanel({ onSettled }: { onSettled: () => void }) {
  const t = useTranslations("trade");
  const [asset, setAsset] = useState<MetalAsset>("XAU");
  const [grams, setGrams] = useState("1");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  // One idempotency key per displayed quote: mashing Confirm demos replay.
  const idemKey = useRef<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!quote) return;
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(quote.expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [quote]);

  function errorMessage(err: unknown): string {
    if (err instanceof ApiError && KNOWN_ERRORS.has(err.code)) {
      return t(`errors.${err.code}`);
    }
    return t("errors.generic");
  }

  async function getQuote(side: OrderSide) {
    setError(null);
    setNotice(null);
    const parsed = Number.parseFloat(grams);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError(t("errors.amount_too_small"));
      return;
    }
    const gramsMg = BigInt(Math.round(parsed * 1000));
    setBusy(true);
    try {
      const q = await api<QuoteResponse>("/quotes", {
        method: "POST",
        body: JSON.stringify({ side, asset, gramsMg: gramsMg.toString() }),
      });
      idemKey.current = crypto.randomUUID();
      setQuote(q);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Deliberately NOT disabled while in flight — double-submits must return
  // the same order (idempotency is the API's job, and the demo shows it).
  async function confirm() {
    if (!quote || !idemKey.current) return;
    setError(null);
    try {
      const order = await api<OrderResponse>("/orders", {
        method: "POST",
        body: JSON.stringify({ quoteId: quote.id, idempotencyKey: idemKey.current }),
      });
      setQuote(null);
      setNotice(order.status === "review" ? t("review") : t("settled"));
      onSettled();
    } catch (err) {
      setQuote(null);
      setError(errorMessage(err));
      onSettled();
    }
  }

  async function faucet() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await api("/faucet", {
        method: "POST",
        body: JSON.stringify({ amountCents: "20000000" }),
      });
      setNotice(t("faucetOk"));
      onSettled();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 outline-none focus:border-gold-500";
  const btnCls =
    "rounded-lg bg-gold-500 px-4 py-2.5 font-semibold text-neutral-950 disabled:opacity-50";

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
      <h2 className="text-lg font-semibold">{t("title")}</h2>

      <div className="flex gap-2">
        {(["XAU", "XPT"] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAsset(a)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              asset === a ? "bg-gold-500 text-neutral-950" : "bg-neutral-800 text-neutral-300"
            }`}
          >
            {a === "XAU" ? t("gold") : t("platinum")}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1 text-sm text-neutral-400">
        {t("grams")}
        <input
          value={grams}
          onChange={(e) => setGrams(e.target.value)}
          inputMode="decimal"
          className={inputCls}
        />
      </label>

      <div className="flex gap-3">
        <button onClick={() => void getQuote("buy")} disabled={busy} className={btnCls}>
          {t("buy")}
        </button>
        <button
          onClick={() => void getQuote("sell")}
          disabled={busy}
          className="rounded-lg border border-gold-500 px-4 py-2.5 font-semibold text-gold-500 disabled:opacity-50"
        >
          {t("sell")}
        </button>
        <button
          onClick={() => void faucet()}
          disabled={busy}
          className="ml-auto rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-300 disabled:opacity-50"
        >
          {t("faucet")}
        </button>
      </div>

      {quote && (
        <div className="flex flex-col gap-1 rounded-xl border border-neutral-700 bg-neutral-950 p-4 text-sm tabular-nums">
          <Row label={`${t("unitPrice")} (${quote.asset})`} value={formatEtb(quote.unitEtbCentsPerGram)} />
          <Row label={t("grams")} value={(Number(quote.gramsMg) / 1000).toString()} />
          <Row label={t("subtotal")} value={formatEtb(quote.subtotalCents)} />
          <Row label={t("fee")} value={formatEtb(quote.feeCents)} />
          {quote.taxCents !== "0" && <Row label={t("tax")} value={formatEtb(quote.taxCents)} />}
          {quote.reforestCents !== "0" && (
            <Row label={t("reforest")} value={formatEtb(quote.reforestCents)} />
          )}
          <div className="my-1 border-t border-neutral-800" />
          <Row
            label={quote.side === "buy" ? t("youPay") : t("youReceive")}
            value={`${formatEtb(quote.totalCents)} ETB`}
            strong
          />
          <div className={`mt-2 text-xs ${secondsLeft > 0 ? "text-neutral-400" : "text-amber-400"}`}>
            {secondsLeft > 0 ? t("expiresIn", { seconds: secondsLeft }) : t("expired")}
          </div>
          <div className="mt-2 flex gap-3">
            <button onClick={() => void confirm()} className={btnCls}>
              {t("confirm")}
            </button>
            <button
              onClick={() => setQuote(null)}
              className="rounded-lg border border-neutral-700 px-4 py-2.5 text-neutral-300"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div className="rounded-lg bg-emerald-950 px-3 py-2 text-sm text-emerald-300">{notice}</div>
      )}
      {error && (
        <div className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-300">{error}</div>
      )}
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold text-gold-500" : ""}`}>
      <span className="text-neutral-400">{label}</span>
      <span>{value}</span>
    </div>
  );
}
