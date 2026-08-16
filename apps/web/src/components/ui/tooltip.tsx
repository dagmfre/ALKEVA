"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * shadcn Tooltip, re-tokenised for ALKEVA.
 *
 * Changed from the shadcn default, deliberately:
 *  - No inverted "primary-filled" bubble and no arrow — the tooltip is a
 *    quiet popover surface (`bg-popover` + hairline + the one soft large
 *    shadow), consistent with every other floating surface.
 *  - 13px text is sanctioned here because a tooltip only ever carries
 *    non-essential, supplementary info — anything essential lives in the
 *    layout itself (touch users never see tooltips).
 *  - Sits at the toast z-step so it clears open dialogs and sheets.
 */
function TooltipProvider({
  delayDuration = 300,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-(--z-index-toast) max-w-72 origin-(--radix-tooltip-content-transform-origin) rounded-sm border border-border bg-popover px-2.5 py-1.5 text-[0.8125rem] text-foreground shadow-[0_20px_50px_rgba(0,0,0,0.35)]",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
