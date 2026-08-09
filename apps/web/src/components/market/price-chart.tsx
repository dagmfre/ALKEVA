"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { MetalAsset, PriceHistoryResponse, PriceRange } from "@alkeva/shared";

import { Skeleton } from "@/components/ui/skeleton";
import { money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

const RANGES: PriceRange[] = ["24h", "7d", "30d", "1y"];
const W = 344;
const H = 150;

/**
 * One metal, one range, one line.
 *
 * No categorical palette: a chart that shows a single series does not need
 * five colours, and giving it them is how charts start looking generated.
 * Horizontal rules only, no axis borders, no vertical grid. The area fill is
 * the one gradient permitted anywhere in this design — it encodes magnitude
 * rather than decorating (`design/design.md` §1).
 */
export function PriceChart({ asset }: { asset: MetalAsset }) {
  const t = useTranslations("home");
  const [range, setRange] = useState<PriceRange>("24h");
  const history = useResource<PriceHistoryResponse>(
    `/prices/history?asset=${asset}&range=${range}`,
  );

  const stroke = asset === "XAU" ? "var(--gold-400)" : "var(--platinum-400)";
  const points = history.data?.points ?? [];

  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => Number(BigInt(p.etbCentsPerGram)));
    const min = Math.min(...values);
    const max = Math.max(...values);
    // A flat series would divide by zero; give it a centred band instead.
    const span = max - min || Math.max(1, max * 0.001);
    const x = (i: number) => (i / (points.length - 1)) * W;
    const y = (v: number) => H - 12 - ((v - min) / span) * (H - 28);

    const line = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" L");
    return {
      line: `M${line}`,
      area: `M${line} L${W},${H} L0,${H} Z`,
      lastX: x(values.length - 1),
      lastY: y(values[values.length - 1] ?? min),
      latest: points[points.length - 1]?.etbCentsPerGram ?? "0",
    };
  }, [points]);

  const gradientId = `fade-${asset}`;

  return (
    <section className="mb-3.5 rounded-lg border border-border bg-card py-3.5">
      <div className="flex gap-1 px-3 pb-2.5">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            aria-pressed={range === r}
            className={cn(
              "font-latin min-h-9 rounded-full px-3.5 text-[0.8125rem] font-medium transition-colors",
              range === r
                ? "bg-popover text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {r}
          </button>
        ))}
      </div>

      {history.loading ? (
        <Skeleton className="mx-3 h-[150px] rounded-md" />
      ) : geometry ? (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${asset} ${range}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[26, 72, 118].map((y) => (
            <line key={y} x1="0" y1={y} x2={W} y2={y} stroke="var(--border)" strokeOpacity="0.4" strokeWidth="1" />
          ))}
          <path d={geometry.area} fill={`url(#${gradientId})`} />
          <path
            d={geometry.line}
            fill="none"
            stroke={stroke}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={geometry.lastX} cy={geometry.lastY} r="3.5" fill={stroke} />
        </svg>
      ) : (
        <p className="px-4 py-10 text-center text-[0.9375rem] text-muted-foreground">
          {t("noChartData")}
        </p>
      )}

      <div className="flex items-baseline justify-between px-4 pt-2">
        <span className="text-[0.9375rem] text-muted-foreground">
          {t(`chart${range === "24h" ? "24h" : range === "7d" ? "7d" : range === "30d" ? "30d" : "1y"}` as never)}
        </span>
        {geometry && (
          <span className={cn("tnum text-[0.9375rem] font-semibold", asset === "XAU" ? "text-gold-400" : "text-platinum-400")}>
            {money(geometry.latest)}
          </span>
        )}
      </div>
    </section>
  );
}
