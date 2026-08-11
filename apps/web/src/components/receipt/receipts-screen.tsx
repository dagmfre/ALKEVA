"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { OrderListResponse } from "@alkeva/shared";

import { Skeleton } from "@/components/ui/skeleton";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";
import { eatStamp, grams, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/**
 * Every receipt this account holds, by serial.
 *
 * Only settled orders appear here, because only settled orders have a serial —
 * the number is allocated at settle, so its presence is the answer to "is
 * there a receipt?" rather than a second flag that could disagree with the
 * ledger.
 */
export function ReceiptsScreen() {
  const t = useTranslations("receipt");
  const tc = useTranslations("common");
  const th = useTranslations("history");
  const { revision } = useTradeSheet();
  const { data, loading } = useResource<OrderListResponse>("/orders?limit=50", { revision });

  const receipts = (data?.orders ?? []).filter((o) => o.receiptSerial !== null);

  if (loading) {
    return (
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
    );
  }

  if (receipts.length === 0) {
    return (
      <div className="mx-auto max-w-[36rem] rounded-lg border border-border bg-card p-5">
        <h2 className="text-[1.125rem] font-semibold">{t("emptyTitle")}</h2>
        <p className="mt-1 text-[0.9375rem] text-muted-foreground">{t("emptyBody")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[64rem] overflow-hidden rounded-lg border border-border bg-card lg:mx-0 lg:max-w-none">
      {receipts.map((o, i) => {
        const metal = o.asset === "XAU" ? tc("gold") : tc("platinum");
        return (
          <Link
            key={o.id}
            href={`/receipt/${o.id}`}
            className={cn(
              "grid grid-cols-2 items-center gap-x-4 gap-y-1 px-4 py-3.5 transition-colors hover:bg-popover/50 lg:flex lg:gap-4 lg:px-5",
              i < receipts.length - 1 && "border-b border-border",
            )}
          >
            <span className="tnum text-base font-semibold lg:flex-1">{o.receiptSerial}</span>
            <span className="flex items-center gap-2.5 text-[0.9375rem] lg:flex-1">
              <span
                className={cn(
                  "size-2 flex-none rounded-full",
                  o.asset === "XAU" ? "bg-gold-500" : "bg-platinum-400",
                )}
              />
              {o.side === "buy" ? th("buyLabel", { metal }) : th("sellLabel", { metal })}
            </span>
            <span className="tnum text-[0.9375rem] text-muted-foreground lg:flex-1">
              {grams(o.gramsMg)} <span className="font-sans">{tc("g")}</span>
            </span>
            <span className="tnum text-end text-base font-semibold lg:flex-1">
              {money(o.totalCents)}
            </span>
            <span className="font-latin col-span-2 text-[0.8125rem] text-subtle lg:col-span-1 lg:flex-[1.2] lg:text-end">
              {o.settledAt ? eatStamp(o.settledAt) : ""}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
