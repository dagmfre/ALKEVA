import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-md border border-border bg-panel-2 px-3.5 text-[0.9375rem] text-foreground transition-[border-color,box-shadow] duration-150 outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-subtle disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "hover:border-input focus-visible:border-gold-500 focus-visible:shadow-[0_0_0_3px_oklch(0.717_0.098_73.3/0.18)] focus-visible:outline-none",
        "aria-invalid:border-loss aria-invalid:shadow-[0_0_0_3px_oklch(0.679_0.175_18/0.16)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
