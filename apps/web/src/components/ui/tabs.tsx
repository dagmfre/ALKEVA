"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * shadcn Tabs, re-tokenised for ALKEVA.
 *
 * Changed from the shadcn default, deliberately:
 *  - The boxed-pill TabsList is gone. Tabs here are a compact underline strip
 *    sitting on a hairline — the selected tab carries a 2px gold underline,
 *    the one signal meaning "current selection" in this system.
 *  - Triggers are ≥44px tall (min-h-11); the stock 36px pill fails the
 *    touch-target floor.
 *  - Active state is `font-semibold text-foreground`, never a filled chip —
 *    gold stays reserved for the underline so the strip never competes with
 *    the primary action.
 */
function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("flex gap-1 border-b border-border", className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex min-h-11 items-center justify-center px-3.5 text-[0.9375rem] text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=active]:font-semibold data-[state=active]:text-foreground",
        // The 2px gold underline — inset from the edges so adjacent tabs
        // never read as one continuous bar.
        "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-gold-500",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
