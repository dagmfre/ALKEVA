"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { MetalAsset } from "@alkeva/shared";

import { useAssetPrice } from "@/components/market/price-provider";
import { useTickFlash } from "@/components/market/market-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { eatTime, eatTimeSec, money, usdPerOz } from "@/lib/format";
import { usePriceSeries } from "@/lib/use-price-series";
import { cn } from "@/lib/utils";

interface Tick {
  at: string;
  cents: string;
}

/**
 * Where an exchange shows its order book, a dealer has nothing honest to
 * show: the platform is the only counterparty, so there is no book. What
 * there is, is the price itself arriving — this tape lists the raw ticks
 * received while the screen is open, then the 24h chart's 5-minute averages,
 * each under its own label so a bucket is never passed off as a tick.
 */
export function TickTape({ asset, className }: { asset: MetalAsset; className?: string }) {
  const tm = useTranslations("market");
  const price = useAssetPrice(asset);
  const day = usePriceSeries(asset, "24h");
  const flash = useTickFlash(price?.etbCentsPerGram ?? null);

  const [session, setSession] = useState<Record<MetalAsset, Tick[]>>({ XAU: [], XPT: [] });
  useEffect(() => {
    if (!price) return;
    setSession((s) => {
      const list = s[asset];
      if (list[0]?.at === price.at) return s;
      return { ...s, [asset]: [{ at: price.at, cents: price.etbCentsPerGram }, ...list].slice(0, 60) };
    });
  }, [asset, price]);

  const ticks = session[asset];
  const buckets = useMemo(() => [...day.points].reverse().slice(1, 120), [day.points]);

  const lastDir = direction(ticks[0]?.cents, ticks[1]?.cents ?? buckets[0]?.etbCentsPerGram);
  const closed = worldMarketClosed(new Date());

  return (
    <Panel className={className} aria-label={tm("ticks")}>
      <PanelHeader title={tm("ticks")} hint="EAT" />

      <div className="flex-none border-b border-border px-[1.125rem] pb-3.5">
        {price ? (
          <div className="flex items-baseline gap-2">
            <span
              key={price.etbCentsPerGram}
              className={cn(
                "tnum text-[1.5rem] leading-tight font-semibold tracking-[-0.02em]",
                lastDir === "up" && "text-gain",
                lastDir === "down" && "text-loss",
                flash,
              )}
            >
              {money(price.etbCentsPerGram)}
            </span>
            {lastDir !== "flat" && (
              <span className={cn("tnum text-[0.875rem]", lastDir === "up" ? "text-gain" : "text-loss")}>
                {lastDir === "up" ? "↑" : "↓"}
              </span>
            )}
          </div>
        ) : (
          <Skeleton className="h-7 w-36" />
        )}
        <p className="tnum mt-1 text-[0.75rem] text-subtle">
          {price ? tm("approxSpot", { spot: usdPerOz(price.usdPerOzMicro) }) : " "}
        </p>
        {closed && (
          <p className="mt-2.5 flex items-start gap-2 text-[0.75rem] leading-snug text-muted-foreground">
            <span aria-hidden="true" className="mt-1.5 size-1.5 flex-none rounded-full bg-subtle" />
            {tm("weekend")}
          </p>
        )}
      </div>

      <div className="tnum grid flex-none grid-cols-[1fr_auto_auto] gap-x-3.5 px-[1.125rem] py-2 text-[0.6875rem] text-subtle">
        <span className="font-sans">{tm("tickTime")}</span>
        <span>{tm("tickPrice")}</span>
        <span className="min-w-14 text-end">Δ</span>
      </div>

      <div className="min-h-[12rem] flex-1 overflow-y-auto">
        <GroupLabel>{tm("sessionTicks")}</GroupLabel>
        {ticks.length === 0 ? (
          <p className="px-[1.125rem] py-2 text-[0.75rem] text-subtle">{tm("waitingTick")}</p>
        ) : (
          ticks.map((tk, i) => (
            <Row
              key={tk.at}
              time={eatTimeSec(tk.at)}
              cents={tk.cents}
              prev={ticks[i + 1]?.cents ?? buckets[0]?.etbCentsPerGram}
            />
          ))
        )}
        <GroupLabel>{tm("buckets")}</GroupLabel>
        {buckets.map((b, i) => (
          <Row
            key={b.at}
            time={eatTime(b.at)}
            cents={b.etbCentsPerGram}
            prev={buckets[i + 1]?.etbCentsPerGram}
          />
        ))}
      </div>
    </Panel>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="sticky top-0 z-[1] border-y border-border bg-card px-[1.125rem] py-1.5 text-[0.6875rem] font-semibold text-subtle first:border-t-0">
      {children}
    </p>
  );
}

function Row({ time, cents, prev }: { time: string; cents: string; prev?: string }) {
  const dir = direction(cents, prev);
  const delta = prev ? Number(BigInt(cents) - BigInt(prev)) : 0;
  return (
    <div className="tnum grid h-[1.875rem] grid-cols-[1fr_auto_auto] items-center gap-x-3.5 px-[1.125rem] text-[0.78125rem] transition-colors hover:bg-white/[0.025]">
      <span className="text-muted-foreground">{time}</span>
      <span className={cn(dir === "up" && "text-gain", dir === "down" && "text-loss")}>{money(cents)}</span>
      <span
        className={cn(
          "min-w-14 text-end",
          dir === "up" ? "text-gain" : dir === "down" ? "text-loss" : "text-subtle",
        )}
      >
        {dir === "flat" ? "0.00" : `${dir === "up" ? "+" : "−"}${money(BigInt(Math.abs(delta)))}`}
      </span>
    </div>
  );
}

function direction(a?: string, b?: string): "up" | "down" | "flat" {
  if (!a || !b) return "flat";
  const d = BigInt(a) - BigInt(b);
  return d > 0n ? "up" : d < 0n ? "down" : "flat";
}

/**
 * The world gold market (and so the birr price, apart from FX) pauses from
 * Friday evening to Sunday evening New York time — roughly Fri 21:00 to
 * Sun 22:00 UTC. Used only to explain a flat tape, never to block a trade.
 */
function worldMarketClosed(now: Date): boolean {
  const day = now.getUTCDay();
  const h = now.getUTCHours();
  return day === 6 || (day === 5 && h >= 21) || (day === 0 && h < 22);
}
