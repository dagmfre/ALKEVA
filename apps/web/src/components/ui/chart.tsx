"use client";

import { ResponsiveContainer, Tooltip } from "recharts";

import { cn } from "@/lib/utils";

/**
 * The chart frame for the admin console — recharts on the v2 tokens. Series
 * colours are the two metals: champagne for the money/asset series, platinum
 * for the counter-series. Identity is never colour-alone: every multi-series
 * chart renders a legend. Axis text is mono, like every number in the product.
 */

export const CHART = {
  gold: "var(--gold-400)",
  platinum: "var(--platinum-400)",
  grid: "oklch(1 0 0 / 0.05)",
  axis: "var(--subtle)",
} as const;

export function ChartContainer({
  className,
  children,
  height = 220,
}: {
  className?: string;
  children: React.ReactElement;
  height?: number;
}) {
  return (
    <div className={cn("tnum w-full text-[0.6875rem]", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

interface TooltipEntry {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
}

/**
 * Shared tooltip: popover surface, tnum values, series dot per row. Typed
 * loosely on purpose — recharts injects these props at runtime and its v3
 * `TooltipProps` no longer describes custom-content props accurately.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: unknown;
  formatter?: (value: number, name: string) => string;
  labelFormatter?: (label: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-[0.5rem] border border-input bg-popover px-3 py-2 shadow-(--shadow-pop)">
      {label !== undefined && (
        <p className="mb-1 text-[0.75rem] text-muted-foreground">
          {labelFormatter ? labelFormatter(String(label)) : String(label)}
        </p>
      )}
      {payload.map((entry) => (
        <p key={String(entry.dataKey)} className="flex items-center gap-2 text-[0.8125rem]">
          <span
            className="size-2 flex-none rounded-full"
            style={{ background: entry.color }}
            aria-hidden="true"
          />
          <span className="text-muted-foreground">{String(entry.name ?? "")}</span>
          <span className="tnum ms-auto ps-3 font-semibold text-foreground">
            {formatter ? formatter(Number(entry.value ?? 0), String(entry.name ?? "")) : String(entry.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

export { Tooltip as RechartsTooltip };
