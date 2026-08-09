import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * shadcn Button, re-tokenised for ALKEVA (`design/design.md` §5).
 *
 * Changed from the shadcn default, deliberately:
 *  - Minimum target 44px everywhere (`sm` is 44, default 48, `cta` 52). The
 *    stock 36px height fails a thumb on a phone held one-handed outdoors.
 *  - `destructive` carries dark ink, not white. White on our loss red is
 *    2.9:1 and fails; the dark ink is 5.5:1.
 *  - No shadows. Depth in this system is surface + hairline (§3).
 *  - `gold` text variant uses gold-400, never gold-500 — gold-as-text needs
 *    the lighter step to clear 4.5:1 on --card.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-colors duration-150 outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-gold-400 active:bg-gold-600 disabled:bg-gold-700",
        outline:
          "border border-input bg-transparent text-foreground hover:border-foreground",
        gold: "border border-input bg-transparent text-gold-400 hover:border-gold-400",
        secondary: "bg-secondary text-secondary-foreground hover:bg-popover/80",
        ghost: "bg-transparent text-muted-foreground hover:text-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:opacity-90",
        /** Demo-only affordances must look like scaffolding, never like a real
            money movement. Dashed border says "this is not a deposit". */
        demo: "border border-dashed border-input bg-transparent text-muted-foreground hover:text-foreground",
        link: "text-gold-400 underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-12 px-4 py-2 text-[0.9375rem]",
        sm: "min-h-11 px-3 text-[0.9375rem]",
        cta: "min-h-13 w-full px-4 text-base",
        pill: "min-h-11 rounded-full px-4 text-[0.9375rem]",
        icon: "size-11",
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
