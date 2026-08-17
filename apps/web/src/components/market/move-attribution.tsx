"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { MetalAsset, PriceAttributionResponse, PriceRange } from "@alkeva/shared";

import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { ARROW, deltaClass, direction, eatStamp, pctMilli, SIGN } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

const RANGES: PriceRange[] = ["24h", "7d", "30d", "1y"];

/** 0.01% in milli-percent — below this the interaction term isn't worth a line. */
const NEGLIGIBLE_MILLI = 10;

function Pct({ milli }: { milli: string | null }) {
  if (milli === null) return <span className="text-muted-foreground">—</span>;
  const dir = direction(milli);
  return (
    <span className={cn("tnum font-semibold", deltaClass(dir))}>
      {SIGN[dir]}
      {pctMilli(milli)}%
    </span>
  );
}

/**
 * A price in birr per gram is the metal's dollar price times the birr's dollar
 * rate. So "gold went up" in Ethiopia is always two claims at once, and the one
 * people actually mean — did the metal gain, or did our money lose? — is the
 * one no single number answers.
 *
 * Both halves are stored on every price_tick, so the split is arithmetic on our
 * own data. The API computes it; nothing here recomputes a figure.
 */
export function MoveAttribution({ asset, className }: { asset: MetalAsset; className?: string }) {
  const t = useTranslations("attribution");
  const tc = useTranslations("common");
  const [range, setRange] = useState<PriceRange>("24h");
  const { data, loading } = useResource<PriceAttributionResponse>(
    `/prices/attribution?asset=${asset}&range=${range}`,
    { intervalMs: 60_000 },
  );

  const metalName = asset === "XAU" ? tc("gold") : tc("platinum");
  const total = data?.totalPctMilli ?? null;
  const metal = data?.metalPctMilli ?? null;
  const fx = data?.fxPctMilli ?? null;
  const cross = data?.crossPctMilli ?? null;

  // Segment widths are shares of the total *movement*, not of the price, so a
  // −2% metal move against a +1% birr move still reads two-thirds / one-third.
  const magnitude = Math.abs(Number(metal ?? 0)) + Math.abs(Number(fx ?? 0));
  const metalShare = magnitude > 0 ? (Math.abs(Number(metal ?? 0)) / magnitude) * 100 : 50;

  return (
    <Panel className={className}>
      <PanelHeader
        title={t("title")}
        hint={t("hint")}
        dot={asset === "XAU" ? "gold" : "platinum"}
        action={
          <span className="flex items-center gap-1">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                aria-pressed={range === r}
                className={cn(
                  "font-latin relative min-h-9 px-2.5 text-[0.8125rem] transition-colors",
                  range === r
                    ? "font-semibold text-foreground"
                    : "font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {r}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-x-2 bottom-0.5 h-0.5 rounded-full",
                    range === r ? "bg-gold-500" : "bg-transparent",
                  )}
                />
              </button>
            ))}
          </span>
        }
      />
      <PanelBody>
        {loading && !data ? (
          <Skeleton className="h-32 rounded-lg" />
        ) : total === null ? (
          <p className="py-6 text-[0.9375rem] text-muted-foreground">{t("notEnough")}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-[0.8125rem] text-muted-foreground">
                {t("totalLabel", { metal: metalName })}
              </span>
              <span className="text-[1.375rem]">
                <span aria-hidden="true" className={cn("mr-1", deltaClass(direction(total)))}>
                  {ARROW[direction(total)]}
                </span>
                <Pct milli={total} />
              </span>
            </div>

            {/* The split. Identity is never colour-alone: each segment is named
                with its own figure in the list underneath. */}
            <div
              className="flex h-2.5 overflow-hidden rounded-full bg-well"
              role="img"
              aria-label={`${t("metalLabel", { metal: metalName })} ${pctMilli(metal)}%, ${t("currencyLabel")} ${pctMilli(fx)}%`}
            >
              <span
                className={cn(
                  "h-full transition-[width] duration-200",
                  asset === "XAU" ? "bg-gold-500" : "bg-platinum-400",
                )}
                style={{ width: `${metalShare}%` }}
              />
              <span
                className="h-full bg-foreground/35 transition-[width] duration-200"
                style={{ width: `${100 - metalShare}%` }}
              />
            </div>

            <dl className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-[0.9375rem]">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2.5 flex-none rounded-full",
                      asset === "XAU" ? "bg-gold-500" : "bg-platinum-400",
                    )}
                  />
                  {t("metalLabel", { metal: metalName })}
                </dt>
                <dd>
                  <Pct milli={metal} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-[0.9375rem]">
                  <span
                    aria-hidden="true"
                    className="size-2.5 flex-none rounded-full bg-foreground/35"
                  />
                  {t("currencyLabel")}
                </dt>
                <dd>
                  <Pct milli={fx} />
                </dd>
              </div>
            </dl>

            <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
              {data?.dominant ? (
                <strong className="font-medium text-foreground">
                  {t(`dominant.${data.dominant}` as never)}{" "}
                </strong>
              ) : null}
              {fx !== null
                ? BigInt(fx) > 0n
                  ? t("birrWeaker")
                  : BigInt(fx) < 0n
                    ? t("birrStronger")
                    : t("birrFlat")
                : null}
              {cross !== null && Math.abs(Number(cross)) >= NEGLIGIBLE_MILLI ? (
                <>
                  {" "}
                  {t("interaction", {
                    value: `${SIGN[direction(cross)]}${pctMilli(cross)}%`,
                  })}
                </>
              ) : null}
            </p>

            {data ? (
              <p className="border-t border-border pt-3 text-[0.75rem] text-muted-foreground">
                {t("window", { from: eatStamp(data.from.at), to: eatStamp(data.to.at) })}
                {" · "}
                {t("sources", { metal: data.source, fx: data.fxSource })}
              </p>
            ) : null}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
