import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * shadcn Badge, re-tokenised for ALKEVA.
 *
 * Changed from the shadcn default, deliberately:
 *  - The filled colour variants are gone. Badges here are outlined chips —
 *    identity comes from the ink + rim, never a solid wash competing with
 *    the primary action.
 *  - `gold` is border + gold-400 TEXT, never a gold fill: white-on-gold is
 *    2.4:1 and banned, and a gold-filled chip would read as a button.
 *  - Metal/state variants (gold, platinum, gain, loss) exist because tier
 *    chips, asset tags and P/L markers are the app's main badge uses.
 *  - Badges are non-interactive, so they're exempt from the 44px target
 *    floor; 13px text is fine on a label.
 *  - No uppercase, no tracking — Ethiopic.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.8125rem] font-medium whitespace-nowrap [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: "border-border bg-control text-foreground",
        gold: "border-gold-600 bg-transparent text-gold-400",
        platinum: "border-platinum-500/40 bg-transparent text-platinum-400",
        gain: "border-gain/40 bg-transparent text-gain",
        loss: "border-loss/40 bg-transparent text-loss",
        muted: "border-border bg-transparent text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
