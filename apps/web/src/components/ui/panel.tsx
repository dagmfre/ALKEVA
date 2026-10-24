import * as React from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The section shell every screen is built from (design v2).
 *
 * The layout contract that kills dead space lives here:
 *  - A panel is a flex column. In a grid row it stretches to the row height
 *    (never put panels in an `items-start` grid).
 *  - `PanelBody` is the one elastic region: it takes whatever height is left,
 *    so a short panel beside a tall one grows its body, not a void under it.
 *  - Short facts belong in a `StatStrip` (one horizontal row), never in a
 *    tall grid cell of their own.
 *
 * `data-panel` is what the verification crawl measures for voids.
 */
function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="panel"
      data-panel=""
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Title on the left, one action on the right. `dot` marks the metal a panel
 * belongs to, the same coin colours the market selector uses.
 */
function PanelHeader({
  title,
  hint,
  action,
  dot,
  className,
  children,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  dot?: "gold" | "platinum";
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[3.625rem] flex-none flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5 ps-[1.125rem] pe-4",
        className,
      )}
    >
      <h2 className="flex min-w-0 items-center gap-2.5 text-[0.9375rem] font-bold">
        {dot && <Coin metal={dot === "gold" ? "XAU" : "XPT"} size="sm" />}
        <span className="truncate">{title}</span>
        {hint && (
          <span className="data-label truncate font-medium">{hint}</span>
        )}
      </h2>
      {action}
      {children}
    </div>
  );
}

/** The elastic region. Takes the panel's remaining height. */
function PanelBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("min-h-0 min-w-0 flex-1 px-4 pb-4 lg:px-[1.125rem]", className)}
      {...props}
    />
  );
}

/**
 * A metal token: a small radial-gradient coin. Gold is champagne, platinum is
 * cool silver; the letters are for screen readers and the colour-blind.
 */
function Coin({
  metal,
  size = "md",
  className,
}: {
  metal: "XAU" | "XPT";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid flex-none place-items-center rounded-full font-latin font-bold",
        metal === "XAU"
          ? "bg-[radial-gradient(circle_at_34%_28%,#f8e6c0,#cfa264_52%,#7a5730)] text-[#3a2610]"
          : "bg-[radial-gradient(circle_at_34%_28%,#ffffff,#bcc2cb_52%,#666c76)] text-[#2a2e34]",
        size === "sm" && "size-4 [font-size:0]",
        size === "md" && "size-6 text-[0.5625rem]",
        size === "lg" && "size-9 text-[0.75rem]",
        className,
      )}
    >
      {metal === "XAU" ? "Au" : "Pt"}
    </span>
  );
}

/**
 * One figure with its label: balances, vault figures, market high/low.
 *
 * `surface`:
 *  - `strip` — a cell in a StatStrip (hairline-divided, no box)
 *  - `well`  — a recessed read-out inside a panel
 *  - `plain` — bare, for custom compositions
 *
 * `tone` tints only the value. Gain/loss always carries a sign or arrow in
 * the value string, never colour alone.
 */
function Stat({
  label,
  value,
  unit,
  tone,
  foot,
  size = "md",
  surface = "well",
  className,
}: {
  label: React.ReactNode;
  /** null renders the skeleton — every figure in this app can be pending. */
  value: React.ReactNode | null;
  unit?: React.ReactNode;
  tone?: "gold" | "platinum" | "gain" | "loss";
  foot?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  surface?: "strip" | "well" | "plain";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col justify-center gap-1",
        surface === "well" && "well rounded-md px-3.5 py-3",
        surface === "strip" && "flex-none px-5 py-3 first:ps-[1.125rem] lg:px-6",
        className,
      )}
    >
      <span className="data-label truncate">{label}</span>
      {value === null ? (
        <Skeleton className="h-5 w-20" />
      ) : (
        <span
          className={cn(
            "tnum truncate font-semibold whitespace-nowrap",
            size === "sm" && "text-[0.875rem]",
            size === "md" && "text-[1.0625rem]",
            size === "lg" && "text-[1.375rem] tracking-[-0.02em]",
            tone === "gold" && "text-gold-300",
            tone === "platinum" && "text-platinum-400",
            tone === "gain" && "text-gain",
            tone === "loss" && "text-loss",
          )}
        >
          {value}
          {unit && (
            <span className="ms-1.5 font-sans text-[0.75rem] font-medium tracking-normal text-subtle">
              {unit}
            </span>
          )}
        </span>
      )}
      {foot && <span className="truncate text-[0.75rem] text-subtle">{foot}</span>}
    </div>
  );
}

/**
 * A row of Stats divided by hairlines. Stays one row on a desk and scrolls
 * sideways on a phone; it never stacks into a column of lonely figures.
 */
function StatStrip({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("stat-strip min-h-[4.5rem]", className)} {...props} />;
}

/** A small change chip: ↑ 0.42% on a gain/loss tint. */
function DeltaChip({
  pctMilli,
  className,
}: {
  /** milli-percent, signed (1962 = 1.96%); null renders nothing */
  pctMilli: string | number | null | undefined;
  className?: string;
}) {
  if (pctMilli === null || pctMilli === undefined) return null;
  const n = Number(pctMilli);
  const up = n >= 0;
  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-0.5 rounded-[0.375rem] px-1.5 py-0.5 text-[0.75rem] font-semibold whitespace-nowrap",
        up ? "bg-gain/12 text-gain" : "bg-loss/8 text-loss",
        className,
      )}
    >
      {up ? "↑" : "↓"} {(Math.abs(n) / 1000).toFixed(2)}%
    </span>
  );
}

export { Panel, PanelHeader, PanelBody, Stat, StatStrip, Coin, DeltaChip };
