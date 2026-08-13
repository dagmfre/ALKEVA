"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BalancesResponse,
  MetalAsset,
  OrderResponse,
  OrderSide,
  QuoteResponse,
} from "@alkeva/shared";

import { useAssetPrice } from "@/components/market/price-provider";
import { api, ApiError } from "@/lib/api";
import { gramsToMg } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

/** Every machine-readable refusal the API can return (Phase 2, all verified). */
export const KNOWN_ERRORS = new Set([
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
  "kyc_required",
  "amount_too_small",
  "validation_failed",
  "conflict",
  "rate_limited",
]);

/** Refusals that describe a platform-wide state, not this user's mistake. */
export const PLATFORM_HALTS = new Set(["reserve_halt", "float_halt", "account_frozen"]);

export type TradeStage = "amount" | "quote" | "done";

/**
 * A localizable error key: a machine-readable API code from KNOWN_ERRORS, or
 * "generic". The UI renders it as t(`errors.${code}`). Storing the code (not
 * the translated string) keeps the state machine locale-independent and lets
 * callers branch on codes instead of comparing translated text.
 */
export type TradeErrorCode = string;

export interface UseTradeFormOptions {
  /** Whether the form is on screen — resources pause and state resets on activation. */
  active: boolean;
  initialAsset: MetalAsset;
  initialSide: OrderSide;
  /** Cache-busting revision from the trade context (bumps after settles). */
  revision: number;
  /** Called whenever an order attempt finished (success or refusal) or the faucet paid. */
  settled: () => void;
  /** UI hook for the faucet success toast. */
  onFaucetSuccess?: () => void;
}

/**
 * The trade state machine — everything about quoting and ordering that is not
 * presentation. Both trade surfaces mount this same hook: the mobile bottom
 * sheet and the desktop trading workspace. The proven Phase 2 behaviours live
 * here exactly once: the per-quote idempotency key, the countdown derived
 * from the server's own expiry, the confirm that is deliberately not disabled
 * while in flight, and settled() firing on refusals too (a rejection is also
 * a ledger event the screens behind must refetch).
 */
export function useTradeForm({
  active,
  initialAsset,
  initialSide,
  revision,
  settled,
  onFaucetSuccess,
}: UseTradeFormOptions) {
  const [asset, setAsset] = useState<MetalAsset>(initialAsset);
  const [side, setSide] = useState<OrderSide>(initialSide);
  const [stage, setStage] = useState<TradeStage>("amount");
  const [gramsInput, setGramsInput] = useState("1");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  /** The quote's full lifetime as the server issued it — the ring's denominator. */
  const [quoteTtl, setQuoteTtl] = useState(1);
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<TradeErrorCode | null>(null);

  /** One key per displayed quote — mashing Confirm must replay, not re-buy. */
  const idemKey = useRef<string | null>(null);

  const balances = useResource<BalancesResponse>(active ? "/ledger/balances" : null, { revision });
  // The shared store: the estimate row live-updates with the same tick the
  // ticker shows (previously this was a single fetch frozen at mount time).
  // The actual price is still set server-side by the quote — this is display.
  const livePrice = useAssetPrice(asset);

  useEffect(() => {
    if (!active) return;
    setAsset(initialAsset);
    setSide(initialSide);
    setStage("amount");
    setQuote(null);
    setOrder(null);
    setErrorCode(null);
  }, [active, initialAsset, initialSide]);

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

  const tick = livePrice;
  const unitCents = tick ? BigInt(tick.etbCentsPerGram) : null;

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

  function codeFor(err: unknown): TradeErrorCode {
    if (err instanceof ApiError && KNOWN_ERRORS.has(err.code)) return err.code;
    return "generic";
  }

  async function requestQuote() {
    setErrorCode(null);
    if (mg === null) {
      setErrorCode("amount_too_small");
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
      setErrorCode(codeFor(err));
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
    setErrorCode(null);
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
      setErrorCode(codeFor(err));
      settled();
    } finally {
      setBusy(false);
    }
  }

  async function faucet() {
    setErrorCode(null);
    setBusy(true);
    try {
      await api("/faucet", {
        method: "POST",
        body: JSON.stringify({ amountCents: "20000000" }),
      });
      onFaucetSuccess?.();
      balances.reload();
      settled();
    } catch (err) {
      setErrorCode(codeFor(err));
    } finally {
      setBusy(false);
    }
  }

  /** Fill the amount with the maximum the user can actually trade. */
  function setMax() {
    if (side === "sell") {
      setGramsInput((Number(BigInt(heldMg)) / 1000).toString());
    } else if (unitCents && balances.data) {
      const affordable = (BigInt(balances.data.etbCents) * 1000n) / unitCents;
      setGramsInput((Number(affordable) / 1000).toFixed(3));
    }
  }

  function backToAmount() {
    setStage("amount");
  }

  const expired = quote !== null && secondsLeft <= 0;
  const isPlatformHalt = errorCode !== null && PLATFORM_HALTS.has(errorCode);

  return {
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
    unitCents,
    estimateCents,
    heldMg,
    requestQuote,
    confirm,
    faucet,
    setMax,
    backToAmount,
  };
}
