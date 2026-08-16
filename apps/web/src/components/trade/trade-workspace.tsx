"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { MetalAsset, OrderSide } from "@alkeva/shared";

import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { CountdownRing } from "@/components/trade/countdown-ring";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";
import { useTradeForm } from "@/components/trade/use-trade-form";
import { OrdersTable } from "@/components/orders/orders-table";
import { PriceChart } from "@/components/market/price-chart";
import { SystemBanner } from "@/components/system/banner";
import { coverage, grams, money, timeOfDay } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";
import type { OrderListResponse, TreasurySummaryResponse } from "@alkeva/shared";

const QUICK_GRAMS = ["1", "5", "10"];

/**
 * The desktop trading workspace — the Tradeo composition: one compact order
 * ticket on the left (~1 part), the dominant market visualization on the
 * right (~2.5 parts), and a secondary card underneath the chart sharing its
 * exact width.
 *
 * It mounts the same `useTradeForm` state machine as the phone sheet, so the
 * proven Phase 2 behaviours (one idempotency key per quote, a countdown driven
 * by the server's own expiry, a Confirm that is deliberately never disabled
 * while in flight) exist exactly once in the codebase. Only the composition
 * differs: here the chart stays beside the ticket, which is the whole reason a
 * desk is worth more than a phone.
 */
export function TradeWorkspace({
  initialAsset,
  initialSide,
}: {
  initialAsset: MetalAsset;
  initialSide: OrderSide;
}) {
  const t = useTranslations("trade");
  const tc = useTranslations("common");
  const th = useTranslations("home");
  const locale = useLocale();
  const { revision, settled } = useTradeSheet();

  const form = useTradeForm({
    active: true,
    initialAsset,
    initialSide,
    revision,
    settled,
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
    confirm,
    setMax,
    backToAmount,
  } = form;

  const treasury = useResource<TreasurySummaryResponse>("/treasury/summary", {
    intervalMs: 60_000,
  });
  const reserve = treasury.data?.reserves.find((r) => r.asset === asset) ?? null;

  const metalLabel = asset === "XAU" ? tc("gold") : tc("platinum");
  const error = errorCode ? t(`errors.${errorCode}` as never) : null;
  const isGold = asset === "XAU";

  return (
    <div className="flex flex-col gap-3.5 lg:gap-5">
      {error && (
        <SystemBanner tone={isPlatformHalt ? "critical" : "caution"} className="mb-0">
          {error}
        </SystemBanner>
      )}

      {/* 1 : ~2.5 — the ticket is compact, the chart dominates. */}
      <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[minmax(300px,340px)_1fr] lg:gap-5">
        {/* ── Order ticket ────────────────────────────────────────── */}
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 lg:min-h-[34rem]">
          {stage === "done" && order ? (
            <SettledPanel
              orderId={order.id}
              status={order.status}
              side={order.side}
              gramsMg={order.gramsMg}
              metal={metalLabel}
              onAgain={backToAmount}
            />
          ) : (
            <>
              {/* Panel header: which market. */}
              <div>
                <FieldLabel>{t("selectMetal")}</FieldLabel>
                <div className="flex gap-1.5 rounded-full bg-well p-1">
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
              </div>

              {/* Account section: what you can trade with. */}
              <div className="border-b border-border pb-1">
                <BalanceRow label={t("availableBirr")} divided>
                  {balances.data ? (
                    money(balances.data.etbCents)
                  ) : (
                    <Skeleton className="h-5 w-24" />
                  )}
                </BalanceRow>
                <BalanceRow label={t("heldMetal", { metal: metalLabel })}>
                  {balances.data ? (
                    <>
                      {grams(heldMg)}
                      <span className="ms-1 font-sans text-[0.9375rem] font-normal text-muted-foreground">
                        {tc("g")}
                      </span>
                    </>
                  ) : (
                    <Skeleton className="h-5 w-16" />
                  )}
                </BalanceRow>
              </div>

              {/* Buy / Sell mode selector. */}
              <div className="flex gap-1.5 rounded-full bg-well p-1">
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
                    {s === "buy" ? `↓ ${t("buy")}` : `↑ ${t("sell")}`}
                  </button>
                ))}
              </div>

              <div>
                <FieldLabel>{t("amount")}</FieldLabel>
                <div className="well flex min-h-[54px] items-center gap-2.5 rounded-md ps-3.5 pe-2">
                  <input
                    id="grams"
                    value={gramsInput}
                    onChange={(e) => setGramsInput(e.target.value)}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-label={t("amount")}
                    className="tnum w-full flex-1 border-0 bg-transparent text-[1.375rem] font-semibold outline-none"
                  />
                  <span className="text-[0.9375rem] text-muted-foreground">{tc("gram")}</span>
                  <button
                    type="button"
                    onClick={setMax}
                    className="font-latin inline-flex min-h-11 items-center rounded-full border border-input px-4 text-[0.8125rem] font-semibold text-gold-400 transition-colors hover:border-gold-400"
                  >
                    MAX
                  </button>
                </div>

                <div className="mt-2.5 flex gap-2">
                  {QUICK_GRAMS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGramsInput(g)}
                      className={cn(
                        "min-h-9 rounded-full border px-3.5 text-[0.9375rem] transition-colors",
                        gramsInput === g
                          ? "border-gold-500 font-semibold text-gold-400"
                          : "border-input text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {g} {tc("g")}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={setMax}
                    className="min-h-9 rounded-full border border-input px-3.5 text-[0.9375rem] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {t("max")}
                  </button>
                </div>
              </div>

              {stage === "quote" && quote ? (
                <>
                  <div className="flex items-center gap-3.5 rounded-md bg-popover px-3.5 py-3">
                    <CountdownRing seconds={secondsLeft} total={quoteTtl} />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-base font-semibold leading-normal">
                        {expired ? t("expired") : t("expiresIn", { seconds: secondsLeft })}
                      </span>
                      <span className="text-[0.9375rem] leading-relaxed text-muted-foreground">
                        {t("lockedExplain")}
                      </span>
                    </span>
                  </div>

                  {/* Every line always visible before the irreversible click —
                      no disclosure hides what the user is agreeing to pay.
                      Zero-value lines are omitted rather than shown as 0.00. */}
                  <div
                    className={cn(
                      "well rounded-md px-4 pb-3 pt-1 transition-opacity",
                      expired && "opacity-55",
                    )}
                  >
                    <QuoteRow label={t("pricePerGram")} value={money(quote.unitEtbCentsPerGram)} />
                    <QuoteRow label={t("grams")} value={grams(quote.gramsMg)} />
                    <QuoteRow label={t("subtotal")} value={money(quote.subtotalCents)} />
                    <QuoteRow label={t("commission")} value={money(quote.feeCents)} />
                    {quote.taxCents !== "0" && (
                      <QuoteRow label={t("tax")} value={money(quote.taxCents)} />
                    )}
                    {quote.reforestCents !== "0" && (
                      <QuoteRow label={t("reforest")} value={money(quote.reforestCents)} />
                    )}
                    <div className="mt-1 flex items-baseline justify-between border-t border-input pt-3">
                      <span className="text-base font-semibold">
                        {quote.side === "buy" ? t("youPay") : t("youReceive")}
                      </span>
                      <span className="tnum text-2xl font-semibold text-gold-400">
                        {money(quote.totalCents)}
                        <span className="ms-1.5 font-sans text-[0.9375rem] font-medium text-muted-foreground">
                          {tc("birr")}
                        </span>
                      </span>
                    </div>
                  </div>

                  {expired ? (
                    <Button size="cta" onClick={() => void requestQuote()} disabled={busy}>
                      {t("newQuote")}
                    </Button>
                  ) : (
                    <Button size="cta" onClick={() => void confirm()}>
                      {busy ? t("pending") : t("confirm")}
                    </Button>
                  )}

                  {/* The line that makes this a quote and not a guess. */}
                  <p className="flex gap-2.5 text-[0.9375rem] leading-relaxed text-subtle">
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

                  <Button variant="ghost" className="w-full" onClick={backToAmount}>
                    {t("cancel")}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-[0.9375rem] text-muted-foreground">
                    ≈{" "}
                    <span className="tnum text-foreground">
                      {estimateCents ? money(estimateCents) : "—"}
                    </span>{" "}
                    {t("atCurrentPrice")}
                  </p>
                  <Button size="cta" onClick={() => void requestQuote()} disabled={busy}>
                    {t("getQuote")}
                  </Button>
                </>
              )}

              {/* Panel foot: market context + the way money actually enters. */}
              <div className="mt-auto flex flex-col gap-3 border-t border-border pt-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[0.9375rem] text-muted-foreground">
                    {t("currentPrice")} · {tc("perGram")}
                  </span>
                  {tick ? (
                    <span
                      className={cn(
                        "tnum text-base font-semibold",
                        isGold ? "text-gold-400" : "text-platinum-400",
                      )}
                    >
                      {money(tick.etbCentsPerGram)}
                    </span>
                  ) : (
                    <Skeleton className="h-5 w-24" />
                  )}
                </div>
                {tick && (
                  <p className="text-[0.8125rem] leading-relaxed text-subtle">
                    {tc("updated")}{" "}
                    <span className="font-latin">
                      {timeOfDay(tick.at, locale)} · {tick.source}
                    </span>
                  </p>
                )}
                <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
                  {th("coverage")}{" "}
                  <span className="tnum font-semibold text-gold-400">
                    {reserve ? (coverage(reserve.reserveRatioPctMilli) ?? "∞") : "—"}
                  </span>{" "}
                  — {th("vaultShort")}
                </p>
                <Button variant="secondary" className="w-full" asChild>
                  <Link href="/deposit">{t("deposit")}</Link>
                </Button>
              </div>
            </>
          )}
        </section>

        {/* ── Market column: dominant chart + secondary card, same width ── */}
        <div className="flex min-w-0 flex-col gap-3.5 lg:gap-5">
          <PriceChart asset={asset} className="lg:h-[34rem]" chartClassName="h-[180px] lg:h-auto" />
          <RecentAssetOrders asset={asset} revision={revision} />
        </div>
      </div>
    </div>
  );
}

/**
 * The secondary content card under the chart — the user's latest orders in
 * the selected market, sharing the chart's exact width. Reuses History's row
 * renderer so the phone and the desk never disagree about an order.
 */
function RecentAssetOrders({ asset, revision }: { asset: MetalAsset; revision: number }) {
  const t = useTranslations("trade");
  const { data, loading } = useResource<OrderListResponse>("/orders?limit=25", { revision });

  const rows = useMemo(
    () => (data?.orders ?? []).filter((o) => o.asset === asset).slice(0, 5),
    [data, asset],
  );

  if (loading) return <Skeleton className="hidden h-40 rounded-lg lg:block" />;
  if (rows.length === 0) return null;

  return (
    <Panel className="hidden overflow-hidden lg:block">
      <PanelHeader
        title={t("recentOrders")}
        action={
          <Link href="/history" className="text-[0.9375rem] text-gold-400 hover:underline">
            {t("allOrders")} →
          </Link>
        }
      />
      <OrdersTable groups={[{ key: asset, orders: rows }]} />
    </Panel>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[0.9375rem] leading-relaxed text-gold-400">{children}</p>
  );
}

function BalanceRow({
  label,
  children,
  divided,
}: {
  label: string;
  children: React.ReactNode;
  divided?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 py-2.5",
        divided && "border-b border-border",
      )}
    >
      <span className="text-[0.9375rem] text-muted-foreground">{label}</span>
      <span className="tnum text-base font-semibold">{children}</span>
    </div>
  );
}

function QuoteRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-[0.9375rem] text-muted-foreground">{label}</span>
      <span className="tnum text-base font-medium">{value}</span>
    </div>
  );
}

/** No confetti. A settled trade is a receipt, not a celebration. */
function SettledPanel({
  orderId,
  status,
  side,
  gramsMg,
  metal,
  onAgain,
}: {
  orderId: string;
  status: string;
  side: OrderSide;
  gramsMg: string;
  metal: string;
  onAgain: () => void;
}) {
  const t = useTranslations("trade");

  if (status !== "settled") {
    return (
      <div className="flex flex-1 flex-col">
        <h2 className="text-[1.125rem] font-semibold">{t("reviewTitle")}</h2>
        <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted-foreground">
          {t("reviewBody")}
        </p>
        <Button variant="outline" size="cta" className="mt-auto" onClick={onAgain}>
          {t("done")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="text-[1.125rem] leading-normal text-gain">
          ✓
        </span>
        <div>
          <h2 className="text-[1.125rem] font-semibold">{t("settledTitle")}</h2>
          <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted-foreground">
            {side === "buy"
              ? t("settledBuyBody", { grams: grams(gramsMg), metal })
              : t("settledSellBody", { grams: grams(gramsMg), metal })}
          </p>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <Button size="cta" asChild>
          <Link href={`/receipt/${orderId}`}>{t("viewReceipt")}</Link>
        </Button>
        <Button variant="outline" size="cta" onClick={onAgain}>
          {t("tradeAgain")}
        </Button>
      </div>
    </div>
  );
}
