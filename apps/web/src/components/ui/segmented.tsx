"use client";

import * as React from "react";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * The segmented control: a recessed track with a raised thumb that slides to
 * the selected option. Buy/Sell, grams/birr, chart ranges, table filters.
 *
 * An option may ask for a strong thumb: `gold` (Buy) or `ink` (Sell). It is
 * a single-select ToggleGroup underneath, so arrow keys move between options
 * and it can never be emptied by clicking the selected option again.
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Small mono count after the label: "Orders 12". */
  count?: React.ReactNode;
  tone?: "raised" | "gold" | "ink";
  disabled?: boolean;
}

function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  size = "md",
  stretch = false,
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  size?: "sm" | "md" | "lg";
  /** Fill the container, options sharing the width equally. */
  stretch?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const id = React.useId();
  const reduce = useReducedMotion();

  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v) onValueChange(v as T);
      }}
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex gap-0.5 rounded-[0.75rem] border border-border bg-panel-2 p-[3px]",
        stretch && "flex w-full",
        className,
      )}
    >
      {options.map((o) => {
        const on = o.value === value;
        const tone = o.tone ?? "raised";
        return (
          <ToggleGroupPrimitive.Item
            key={o.value}
            value={o.value}
            disabled={o.disabled}
            className={cn(
              "relative isolate inline-flex items-center justify-center gap-1.5 rounded-[0.5625rem] px-3 font-semibold whitespace-nowrap outline-none transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45",
              "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring",
              size === "sm" && "h-7 px-2.5 text-[0.75rem]",
              size === "md" && "h-8 text-[0.8125rem]",
              size === "lg" && "h-10 text-[0.875rem]",
              stretch && "flex-1",
              on
                ? tone === "gold"
                  ? "text-primary-foreground"
                  : tone === "ink"
                    ? "text-bone-foreground"
                    : "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                aria-hidden="true"
                transition={
                  reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40, mass: 0.7 }
                }
                className={cn(
                  "absolute inset-0 -z-10 rounded-[0.5625rem]",
                  tone === "raised" && "bg-raised shadow-(--shadow-thumb)",
                  tone === "gold" && "cta-gold",
                  tone === "ink" && "bg-bone shadow-[inset_0_1px_0_rgb(255_255_255/0.6)]",
                )}
              />
            )}
            {o.label}
            {o.count !== undefined && (
              <span
                className={cn(
                  "tnum text-[0.6875rem] font-semibold",
                  on && tone === "raised" ? "text-gold-400" : "opacity-70",
                )}
              >
                {o.count}
              </span>
            )}
          </ToggleGroupPrimitive.Item>
        );
      })}
    </ToggleGroupPrimitive.Root>
  );
}

export { Segmented };
