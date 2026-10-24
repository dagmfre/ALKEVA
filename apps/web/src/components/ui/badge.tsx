import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Badges, design v2: a soft tint of the meaning colour with ink of the same
 * hue. Status badges lead with a small dot (`dot`); the word is always there
 * too, so state never rests on colour alone.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-[0.1875rem] text-[0.75rem] font-semibold whitespace-nowrap [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: "bg-white/6 text-foreground",
        gold: "bg-gold-400/12 text-gold-300",
        platinum: "bg-platinum-400/12 text-platinum-400",
        gain: "bg-gain/12 text-gain",
        loss: "bg-loss/8 text-loss",
        muted: "border-border bg-transparent text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

function Badge({
  className,
  variant = "default",
  dot = false,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    >
      {dot && <i aria-hidden="true" className="size-1.5 flex-none rounded-full bg-current" />}
      {children}
    </span>
  )
}

export { Badge, badgeVariants }
