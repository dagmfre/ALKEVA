"use client";

import { useTranslations } from "next-intl";
import type { MetalAsset, PriceLatestResponse } from "@alkeva/shared";

import { Skeleton } from "@/components/ui/skeleton";
import { money, pctMilli } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/**
 * The landing page's live price strip. `/prices/latest` is public, so the
 * signed-out visitor sees the same real feed the app trades on — the first
 * trust signal is that the marketing page quotes the actual market.
 */
export function PublicPriceStrip() {
  return (
    <div className="mt-10 grid w-full max-w-[38rem] grid-cols-1 gap-3 sm:grid-cols-2">
      <PriceCell asset="XAU" />
      <PriceCell asset="XPT" />
    </div>
  );
}

function PriceCell({ asset }: { asset: MetalAsset }) {
  const tc = useTranslations("common");
  const { data } = useResource<PriceLatestResponse>(`/prices/latest?asset=${asset}`, {
    intervalMs: 30_000,
  });
  const milli = data?.change24hPctMilli ?? null;
  const pct = pctMilli(milli);
  const up = milli !== null && BigInt(milli) > 0n;
  const down = milli !== null && BigInt(milli) < 0n;
  const isGold = asset === "XAU";

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3.5">
      <span className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={cn("size-2.5 rounded-full", isGold ? "bg-gold-500" : "bg-platinum-400")}
        />
        <span className="text-[0.9375rem] text-muted-foreground">
          {isGold ? tc("gold") : tc("platinum")} · {tc("perGram")}
        </span>
      </span>
      {data ? (
        <span className="flex items-baseline gap-2">
          <span className="tnum text-base font-semibold">{money(data.etbCentsPerGram)}</span>
          {pct && (
            <span
              className={cn(
                "tnum text-[0.8125rem] font-semibold",
                up ? "text-gain" : down ? "text-loss" : "text-muted-foreground",
              )}
            >
              {up ? "↑" : down ? "↓" : "·"} {pct}%
            </span>
          )}
        </span>
      ) : (
        <Skeleton className="h-5 w-24" />
      )}
    </div>
  );
}
