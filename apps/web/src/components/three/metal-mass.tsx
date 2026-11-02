"use client";

import { createContext, useContext, useEffect, useState } from "react";
import dynamic from "next/dynamic";

import { massScale } from "@/components/three/mass-scale";
import { cn } from "@/lib/utils";

/**
 * The public 3D-mass component (spec F13, client Q63): a slowly rotating
 * ingot whose rendered volume is proportional to the user's actual held
 * grams, with the synced gram label rendered as HTML OUTSIDE the canvas from
 * the same PortfolioResponse value the holdings table shows — one source, so
 * the number and the mass cannot desync.
 *
 * three.js loads only in the dynamic chunk (ssr:false); reduced-motion users,
 * WebGL-less devices and a lost WebGL context get the static SVG ingot at the
 * same honest scale — and so does everyone while the chunk downloads.
 */

/** next/dynamic's `loading` gets no props; the ingot it draws comes from here. */
const IngotProps = createContext<{ asset: "XAU" | "XPT"; gramsMg: string } | null>(null);

function LoadingIngot() {
  const props = useContext(IngotProps);
  return props ? <StaticIngot {...props} /> : null;
}

const Scene = dynamic(() => import("./metal-mass-scene"), {
  ssr: false,
  loading: () => <LoadingIngot />,
});

/**
 * Phones and touch tablets get a lighter render (lower DPR, smaller shadow
 * map, fewer particles). Decided once on mount, in the same effect flush as
 * `useStaticFallback`, so the canvas is created with the right profile.
 */
export function useLowPowerProfile(): boolean {
  const [low, setLow] = useState(false);
  useEffect(() => {
    setLow(window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768);
  }, []);
  return low;
}

export function useStaticFallback(): boolean {
  const [fallback, setFallback] = useState(true);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let webgl = false;
    try {
      const canvas = document.createElement("canvas");
      const probe = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      webgl = Boolean(probe);
      // Release the probe at once: mobile browsers cap live WebGL contexts
      // (iOS Safari at a handful), and a leaked probe per 3D component can be
      // what stops the real canvas from getting one.
      probe?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webgl = false;
    }
    setFallback(reduced || !webgl);
  }, []);
  return fallback;
}

export function MetalMass({
  asset,
  gramsMg,
  label,
  compact,
  className,
}: {
  asset: "XAU" | "XPT";
  gramsMg: string;
  /**
   * Already-formatted gram string from the parent — the synced label.
   * Omitted where the ingot is the object rather than a measurement (the
   * landing hero), so no number is ever shown that isn't a real holding.
   */
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const fallback = useStaticFallback();
  const lowPower = useLowPowerProfile();
  const [lost, setLost] = useState(false);

  return (
    <figure className={cn("relative flex flex-col items-center", className)}>
      <div
        className={cn("relative w-full", compact ? "h-[104px]" : "aspect-[4/3] max-h-[280px]")}
      >
        {/* Contact shadow — a grounded object reads as a thing, a floating one
            reads as clip-art. CSS, so the SVG fallback gets it too. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[22%] bottom-[8%] h-[12%] rounded-[50%] bg-black/45 blur-md"
        />
        {fallback || lost ? (
          <StaticIngot asset={asset} gramsMg={gramsMg} />
        ) : (
          <IngotProps.Provider value={{ asset, gramsMg }}>
            <Scene
              asset={asset}
              gramsMg={gramsMg}
              lowPower={lowPower}
              onContextLost={() => setLost(true)}
            />
          </IngotProps.Provider>
        )}
      </div>
      {label && (
        <figcaption
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 text-center",
            compact ? "text-[0.8125rem]" : "text-[0.9375rem]",
          )}
        >
          <span className="tnum font-semibold">{label}</span>
        </figcaption>
      )}
    </figure>
  );
}

/** The no-WebGL / reduced-motion ingot — same cube-root scale, no animation. */
function StaticIngot({ asset, gramsMg }: { asset: "XAU" | "XPT"; gramsMg: string }) {
  const scale = massScale(gramsMg);
  const isGold = asset === "XAU";
  const face = isGold ? "#d4a017" : "#c5c9d0";
  const top = isGold ? "#f0c040" : "#e2e6ec";
  const side = isGold ? "#a37a10" : "#9aa0aa";

  return (
    <div className="grid h-full w-full place-items-center">
      <svg
        viewBox="0 0 200 120"
        aria-hidden="true"
        style={{ transform: `scale(${scale})`, width: "60%", maxWidth: 220 }}
      >
        {/* top face */}
        <polygon points="55,38 145,38 165,58 35,58" fill={top} />
        {/* front face */}
        <polygon points="35,58 165,58 158,96 42,96" fill={face} />
        {/* right shade */}
        <polygon points="145,38 165,58 158,96 150,90 142,44" fill={side} opacity="0.55" />
        {/* specular hairline */}
        <line x1="55" y1="41" x2="145" y2="41" stroke="#fff" strokeOpacity="0.5" strokeWidth="2" />
      </svg>
    </div>
  );
}
