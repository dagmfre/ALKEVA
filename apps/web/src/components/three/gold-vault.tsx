"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

import { useLowPowerProfile, useStaticFallback } from "@/components/three/metal-mass";
import { cn } from "@/lib/utils";

/**
 * The gold box: click (or Enter/Space) and it unlatches, opens, and lifts the
 * user's bar out of the velvet; the held amount appears once the bar is up.
 *
 * The stage IS a <button> — keyboard, focus ring and aria-pressed come free,
 * and the canvas inside still receives pointer moves for the parallax. The
 * amount is HTML from the parent's already-formatted values (the same ones
 * the holdings table prints), so the number and the bar cannot disagree.
 *
 * three.js loads only in the dynamic chunk. Reduced-motion and WebGL-less
 * devices, a lost WebGL context, and everyone while that chunk is still
 * downloading get a static box that swaps to the amount without animation —
 * the stage is never empty.
 */

/** next/dynamic's `loading` gets no props; the box it draws reads the toggle here. */
const VaultOpen = createContext(false);

function LoadingBox() {
  return <StaticBox open={useContext(VaultOpen)} />;
}

const Scene = dynamic(() => import("./gold-vault-scene"), {
  ssr: false,
  loading: () => <LoadingBox />,
});

/** Stop the render loop while the box is scrolled out of view. */
function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(Boolean(e?.isIntersecting)), {
      rootMargin: "120px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, inView] as const;
}

export function GoldVault({
  gramsMg,
  gramsLabel,
  valueLabel,
  fill = false,
  className,
}: {
  gramsMg: string;
  /** e.g. "12.500 g" — formatted by the parent from the same holding row. */
  gramsLabel: string;
  /** e.g. "287,512.40 birr" — the live mark of that holding. */
  valueLabel: string;
  /** On a desk (lg+), fill the parent's height instead of keeping a 16:11 stage. */
  fill?: boolean;
  className?: string;
}) {
  const t = useTranslations("portfolio.vault");
  const fallback = useStaticFallback();
  const lowPower = useLowPowerProfile();
  const [lost, setLost] = useState(false);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [stageRef, inView] = useInView<HTMLButtonElement>();

  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const onRevealChange = useCallback((r: boolean) => setRevealed(r), []);
  // The 3D box mounts in whatever pose the static box was left in, so the
  // amount carries straight over instead of blinking out and back in.
  const onReady = useCallback(() => {
    setRevealed(openRef.current);
    setReady(true);
  }, []);
  const onContextLost = useCallback(() => setLost(true), []);

  const isStatic = fallback || lost;
  // A static box — or the 3D one still on its way — has no animation to wait for.
  const showAmount = isStatic || !ready ? open : revealed;

  return (
    <figure className={cn("relative", fill && "lg:flex lg:flex-col", className)}>
      <button
        ref={stageRef}
        type="button"
        aria-pressed={open}
        aria-label={open ? t("closeAria") : t("openAria")}
        onClick={() => {
          // After a close, no hover "peek" until the pointer leaves and comes
          // back — otherwise the lid cracks open again and reads as stuck.
          if (open) setHovered(false);
          setOpen(!open);
        }}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        className={cn(
          "group relative block min-h-[300px] w-full cursor-pointer overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          // A definite size at every width: an aspect-ratio stage on phones and
          // tablets (iOS WebKit can collapse a percentage height inside a
          // <button> to 0); only on a desk does `fill` stretch with the panel.
          "aspect-[16/11] max-h-[460px]",
          fill && "lg:aspect-auto lg:max-h-none lg:flex-1",
        )}
      >
        {/* Warm floor pool under the box — reads as a lit plinth on the dark card */}
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-[12%] bottom-[6%] h-[38%] rounded-[50%] bg-gold-400/10 blur-3xl transition-opacity duration-700",
            open ? "opacity-100" : "opacity-50",
          )}
        />
        {/* The drawing layer is inset absolutely, so the canvas always has the
            stage's exact size whatever the flex/aspect maths above resolves to. */}
        <span className="absolute inset-0 block">
          {isStatic ? (
            <StaticBox open={open} />
          ) : (
            <VaultOpen.Provider value={open}>
              <Scene
                gramsMg={gramsMg}
                open={open}
                hovered={hovered}
                active={inView}
                lowPower={lowPower}
                onRevealChange={onRevealChange}
                onReady={onReady}
                onContextLost={onContextLost}
              />
            </VaultOpen.Provider>
          )}
        </span>

        {/* The amount — fades up once the bar has actually risen */}
        <span
          aria-hidden={!showAmount}
          className={cn(
            "pointer-events-none absolute inset-x-0 top-[7%] flex flex-col items-center gap-1 text-center transition-all duration-500 ease-out",
            showAmount ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
          )}
        >
          <span className="text-[0.8125rem] text-muted-foreground">{t("yourGold")}</span>
          <span className="tnum text-[2rem] font-semibold leading-none lg:text-[2.5rem]">
            {gramsLabel}
          </span>
          <span className="tnum text-[0.9375rem] text-muted-foreground">{valueLabel}</span>
        </span>

        <span
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-[5%] text-center text-[0.8125rem] text-muted-foreground transition-opacity duration-300",
            !open && "animate-pulse group-hover:animate-none",
          )}
        >
          {open ? t("closeHint") : t("openHint")}
        </span>
      </button>

      {/* Screen readers hear the amount when the box opens */}
      <span className="sr-only" aria-live="polite">
        {showAmount ? `${t("yourGold")}: ${gramsLabel}, ${valueLabel}` : ""}
      </span>
    </figure>
  );
}

/** No-WebGL / reduced-motion / still-loading box: closed or open, no motion between. */
function StaticBox({ open }: { open: boolean }) {
  return (
    <span className="grid h-full w-full place-items-center">
      <svg viewBox="0 0 240 170" aria-hidden="true" className="w-[52%] max-w-[300px]">
        <defs>
          <linearGradient id="vault-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f6cf5c" />
            <stop offset="1" stopColor="#b8860b" />
          </linearGradient>
        </defs>
        <ellipse cx="120" cy="160" rx="92" ry="7" fill="#000" opacity="0.45" />
        {/* body */}
        <rect x="30" y="84" width="180" height="72" rx="6" fill="url(#vault-gold)" />
        <rect x="50" y="98" width="140" height="44" rx="3" fill="none" stroke="#fde8a0" strokeOpacity="0.5" />
        {open ? (
          <>
            {/* velvet interior + lid swung back */}
            <rect x="38" y="76" width="164" height="14" rx="3" fill="#3a0a13" />
            <polygon points="28,78 212,78 196,22 44,22" fill="url(#vault-gold)" opacity="0.85" />
            <polygon points="92,66 148,66 140,52 100,52" fill="#f0c040" />
          </>
        ) : (
          <>
            <rect x="26" y="64" width="188" height="24" rx="8" fill="url(#vault-gold)" />
            <circle cx="120" cy="64" r="9" fill="none" stroke="#fde8a0" strokeWidth="2.5" />
            <rect x="113" y="84" width="14" height="20" rx="2" fill="#f3c552" />
          </>
        )}
      </svg>
    </span>
  );
}
