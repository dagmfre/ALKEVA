"use client";

import * as React from "react";
import { Slider as SliderPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * shadcn Slider, re-tokenised for ALKEVA.
 *
 * Changed from the shadcn default, deliberately:
 *  - The track is a `.well` — a sunk field, the same treatment every other
 *    input surface gets, rather than a floating muted bar.
 *  - The thumb is 20px with a 44px hit area via `before:`, so the touch target
 *    clears the floor without a control that looks like a button.
 *  - The filled range is gold: this control's whole job is expressing an
 *    allocation of the user's own metal, which is exactly what gold means here.
 */
function Slider({
  className,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        "relative flex w-full touch-none select-none items-center py-3",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="well relative h-2.5 w-full grow overflow-hidden rounded-full p-0"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute h-full bg-gold-500"
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        className={cn(
          "relative block size-5 shrink-0 rounded-full border-2 border-gold-500 bg-card transition-colors",
          "hover:bg-gold-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          // Hit area, not visual size: 44px of touchable slack around a 20px dot.
          "before:absolute before:-inset-3 before:content-['']",
        )}
      />
    </SliderPrimitive.Root>
  );
}

export { Slider };
