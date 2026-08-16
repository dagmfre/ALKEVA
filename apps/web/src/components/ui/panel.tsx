import * as React from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The section shell every dashboard surface is built from.
 *
 * Before this existed each screen hand-rolled its own `rounded-lg border
 * border-border bg-card px-4 py-3.5 …` header, and they drifted: three
 * different title sizes, four different paddings, headers with and without a
 * rule. One shell means Home, Portfolio, History and the admin console read as
 * the same product — the consistency the product register asks for.
 *
 * Panels are surfaces, not cards-as-decoration: they exist where a real group
 * of information starts, and they never nest.
 */
function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="panel"
      className={cn(
        "flex min-w-0 flex-col rounded-lg border border-border bg-card",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Title on the left, one action on the right. `dot` marks the metal a panel
 * belongs to — the same two-colour vocabulary the ticker and chart use.
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
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pb-3 pt-3.5 lg:px-5",
        className,
      )}
    >
      <h2 className="flex min-w-0 items-center gap-2.5 text-[1.0625rem] font-semibold">
        {dot && (
          <span
            aria-hidden="true"
            className={cn(
              "size-2.5 flex-none rounded-full",
              dot === "gold" ? "bg-gold-500" : "bg-platinum-400",
            )}
          />
        )}
        <span className="truncate">{title}</span>
        {hint && (
          <span className="truncate text-[0.9375rem] font-normal text-muted-foreground">
            {hint}
          </span>
        )}
      </h2>
      {action}
      {children}
    </div>
  );
}

function PanelBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("min-w-0 px-4 pb-4 lg:px-5 lg:pb-5", className)} {...props} />
  );
}

/**
 * One figure with its label. The single stat vocabulary for the whole product:
 * balances, vault figures, 30-day admin totals, market open/high/low.
 *
 * `tone` tints only the value, never the surface — gold stays the signal for
 * "asset / action", and gain/loss always arrives with a sign somewhere in the
 * value string, never colour alone.
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
  surface?: "well" | "plain";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-0.5 rounded-md px-3.5 py-2.5",
        surface === "well" && "well",
        className,
      )}
    >
      <span className="truncate text-[0.875rem] leading-snug text-muted-foreground">
        {label}
      </span>
      {value === null ? (
        <Skeleton className="mt-1 h-5 w-20" />
      ) : (
        <span
          className={cn(
            "tnum truncate font-semibold",
            size === "sm" && "text-[0.9375rem]",
            size === "md" && "text-[1.0625rem]",
            size === "lg" && "text-[1.375rem]",
            tone === "gold" && "text-gold-400",
            tone === "platinum" && "text-platinum-400",
            tone === "gain" && "text-gain",
            tone === "loss" && "text-loss",
          )}
        >
          {value}
          {unit && (
            <span className="ms-1 font-sans text-[0.875rem] font-normal text-muted-foreground">
              {unit}
            </span>
          )}
        </span>
      )}
      {foot && <span className="truncate text-[0.8125rem] text-subtle">{foot}</span>}
    </div>
  );
}

export { Panel, PanelHeader, PanelBody, Stat };
