"use client";

import { useTranslations } from "next-intl";

import { useTickFlash } from "@/components/market/market-header";
import { Coin, DeltaChip } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { OrderTicket } from "@/components/trade/order-ticket";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";
import { useTradeForm } from "@/components/trade/use-trade-form";
import { SystemBanner } from "@/components/system/banner";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The contextual trade surface: a bottom sheet opened by a Buy or Sell button
 * on Markets or Portfolio, so the price or holding that prompted the trade
 * stays visible behind it. Same ticket and same hook as the terminal.
 */
export function TradeSheet() {
  const t = useTranslations("trade");
  const tc = useTranslations("common");
  const tm = useTranslations("market");
  const { isOpen, close, asset: initialAsset, side: initialSide, revision, settled } = useTradeSheet();

  const form = useTradeForm({ active: isOpen, initialAsset, initialSide, revision, settled });
  const { asset, setAsset, side, tick, errorCode, isPlatformHalt, stage } = form;
  const flash = useTickFlash(tick?.etbCentsPerGram ?? null);
  const metal = asset === "XAU" ? tc("gold") : tc("platinum");
  const error = errorCode ? t(`errors.${errorCode}` as never) : null;

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && close()}>
      <SheetContent side="bottom" className="gap-0 pt-2.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        <span aria-hidden="true" className="mx-auto mb-3 h-1 w-10 flex-none rounded-full bg-raised" />

        <div className="flex flex-col gap-3 px-4 pb-3.5">
          <div className="flex items-center gap-3 pe-8">
            <Coin metal={asset} size="lg" />
            <div className="min-w-0">
              <SheetTitle className="truncate">
                {side === "buy" ? t("buyTitleShort", { metal }) : t("sellTitleShort", { metal })}
              </SheetTitle>
              <SheetDescription className="flex items-center gap-2 text-[0.75rem]">
                {tick ? (
                  <span key={tick.etbCentsPerGram} className={cn("tnum text-foreground", flash)}>
                    {money(tick.etbCentsPerGram)}
                  </span>
                ) : null}
                <span>{tm("perGramShort")}</span>
                <DeltaChip pctMilli={tick?.change24hPctMilli} />
              </SheetDescription>
            </div>
          </div>
          {stage === "amount" && (
            <Segmented
              value={asset}
              onValueChange={setAsset}
              stretch
              aria-label={tm("selector")}
              options={(["XAU", "XPT"] as const).map((a) => ({
                value: a,
                label: (
                  <span className="flex items-center gap-2">
                    <Coin metal={a} size="sm" />
                    {a === "XAU" ? tc("gold") : tc("platinum")}
                  </span>
                ),
              }))}
            />
          )}
          {error && (
            <SystemBanner tone={isPlatformHalt ? "critical" : "caution"} className="mb-0">
              {error}
            </SystemBanner>
          )}
        </div>

        <OrderTicket form={form} onReceipt={close} />
      </SheetContent>
    </Sheet>
  );
}
