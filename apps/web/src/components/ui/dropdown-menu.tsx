"use client"

import * as React from "react"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * shadcn DropdownMenu, re-tokenised for ALKEVA.
 *
 * Changed from the shadcn default, deliberately:
 *  - Items are ≥44px tall (min-h-11) — the stock ~32px row fails the
 *    touch-target floor this app enforces everywhere interactive.
 *  - Highlight is `bg-control` (the interactive surface step), not the stock
 *    accent tint — the surface ladder does the work, never a colour wash.
 *  - The content sits on `bg-popover` with one soft large shadow; small hard
 *    shadows don't exist in this system (depth = surface + hairline).
 *  - Destructive items use `text-loss`, and their ink never changes on
 *    highlight — only the surface behind them does.
 *  - Checkbox/radio items, sub-menus and shortcuts are dropped until a
 *    screen needs them; unused primitives are dead weight in the bundle.
 */
function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  )
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  )
}

function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "z-(--z-index-dropdown) max-h-(--radix-dropdown-menu-content-available-height) min-w-[10rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border border-border bg-popover p-1.5 text-popover-foreground shadow-[0_20px_50px_rgba(0,0,0,0.35)]",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "relative flex min-h-11 cursor-default items-center gap-2 rounded-sm px-3 text-[0.9375rem] outline-hidden select-none focus:bg-control focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-9",
        // Destructive rows keep their loss ink on highlight — the surface
        // moves, the meaning doesn't.
        "data-[variant=destructive]:text-loss data-[variant=destructive]:focus:text-loss data-[variant=destructive]:[&_svg]:!text-loss",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        // Non-interactive, so it may sit below 44px. No uppercase — Ethiopic.
        "px-3 py-1.5 text-[0.8125rem] font-medium text-muted-foreground data-[inset]:pl-9",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1.5 my-1.5 h-px bg-border", className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
}
