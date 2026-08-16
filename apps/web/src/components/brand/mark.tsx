import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The ALKEVA mark — the client-supplied interlocked gold/platinum knot
 * (`design/logo.jpg`, actually a PNG with alpha).
 *
 * The PNGs under `/brand` are generated from that source by
 * `scripts/build-logo-assets.mjs`, which splits the delivered lockup into the
 * mark and the wordmark and emits the three sizes referenced here. The mark
 * sits in a 26–30px header slot, so it is served from the 128px asset and the
 * larger ones exist for retina and for the landing hero.
 *
 * The mark is decorative wherever it appears next to the ALKEVA wordmark, so
 * it carries an empty alt — the name is already in the accessibility tree as
 * text, and announcing "ALKEVA logo ALKEVA" would be noise.
 */
export function Mark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/mark-256.png"
      alt=""
      width={size}
      height={size}
      priority
      className={cn("shrink-0 select-none", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <Mark size={size} />
      <span className="font-latin text-base font-semibold tracking-[0.01em]">ALKEVA</span>
    </span>
  );
}

/**
 * The delivered lockup as one image — mark over wordmark, the client's own
 * letterforms. Used where the brand is the subject of the composition (the
 * landing hero) rather than a label on a chrome bar.
 */
export function Lockup({ width = 220, className }: { width?: number; className?: string }) {
  return (
    <Image
      src="/brand/lockup.png"
      alt="ALKEVA"
      width={width}
      height={Math.round(width * 0.94)}
      priority
      className={cn("h-auto select-none", className)}
      style={{ width }}
    />
  );
}
