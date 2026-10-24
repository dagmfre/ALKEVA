import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Buttons, design v2.
 *
 * Two strong actions and neither is red or green: `default` is the champagne
 * gradient (Buy, the primary call), `ink` is bone (Sell, the counter-action).
 * `outline` is the FBS "Try demo" hairline that warms to gold on hover.
 * Everything else is quiet. Dark ink on gold, never white.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent font-semibold outline-none transition-[background-color,border-color,color,filter] duration-150 ease-(--ease-out) disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "cta-gold hover:brightness-[1.06]",
        /** Bone: Sell, and the strong action on a gold surface. */
        ink: "bg-bone text-bone-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.6)] hover:bg-white",
        /** Flat champagne — compact chips where a gradient would be noise. */
        flat: "bg-gold-500 text-primary-foreground hover:bg-gold-400 active:bg-gold-600",
        /** Raised thumb: a selected or secondary control on a panel. */
        soft: "bg-raised text-foreground shadow-(--shadow-thumb) hover:bg-[oklch(0.3_0.004_75)]",
        outline:
          "border-input bg-transparent text-foreground hover:border-gold-400/50 hover:bg-gold-400/6",
        gold: "border-gold-400/40 bg-gold-400/8 text-gold-300 hover:border-gold-400/70 hover:bg-gold-400/12",
        secondary: "bg-panel-2 text-foreground hover:bg-raised",
        ghost: "bg-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground",
        destructive:
          "bg-loss/8 text-loss hover:bg-loss/14",
        link: "h-auto! px-0! text-gold-400 underline-offset-4 hover:text-gold-300 hover:underline",
      },
      size: {
        default: "h-11 px-[1.125rem] text-[0.875rem]",
        sm: "h-9 rounded-[0.5625rem] px-3 text-[0.8125rem]",
        cta: "h-[3.125rem] w-full px-5 text-[0.9375rem]",
        pill: "h-9 rounded-full px-4 text-[0.8125rem]",
        icon: "size-10",
        "icon-sm": "size-8 rounded-[0.5625rem]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
