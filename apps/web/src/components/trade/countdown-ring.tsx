const RADIUS = 24;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // 150.8

/**
 * The one piece of expressive motion in the product, and it earns it: a real
 * 30-second deadline on a binding price, shown the most legible way there is.
 *
 * Under 5 seconds it crosses to destructive — the user is about to lose the
 * price. Reduced motion drops the sweep transition and leaves the numeral,
 * which carries the same information.
 *
 * `total` comes from the quote the server actually issued, never from a
 * client-side copy of the TTL: if the server's quote lifetime ever changes,
 * the ring follows it instead of lying about how much time is left.
 */
export function CountdownRing({
  seconds,
  total,
  size = "md",
}: {
  seconds: number;
  total: number;
  /** `sm`: a 20px ring with no numeral, for inline use beside a label. */
  size?: "sm" | "md";
}) {
  const fraction = Math.max(0, Math.min(1, seconds / Math.max(1, total)));
  if (size === "sm") {
    const c = 2 * Math.PI * 8;
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" role="timer" aria-hidden="true" className="flex-none">
        <circle cx="10" cy="10" r="8" fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="2.5" />
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke={seconds <= 5 ? "var(--loss)" : "var(--gold-400)"}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={c.toFixed(1)}
          strokeDashoffset={(c * (1 - fraction)).toFixed(1)}
          transform="rotate(-90 10 10)"
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-1000 motion-safe:ease-linear"
        />
      </svg>
    );
  }
  const offset = CIRCUMFERENCE * (1 - fraction);
  const urgent = seconds <= 5;
  const stroke = urgent ? "var(--loss)" : "var(--gold-400)";

  return (
    <div className="relative size-14 flex-none" role="timer" aria-live="off">
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r={RADIUS} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="3" />
        <circle
          cx="28"
          cy="28"
          r={RADIUS}
          fill="none"
          stroke={stroke}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE.toFixed(1)}
          strokeDashoffset={offset.toFixed(1)}
          transform="rotate(-90 28 28)"
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-1000 motion-safe:ease-linear"
        />
      </svg>
      <div
        className={`tnum absolute inset-0 flex items-center justify-center text-[1.125rem] font-semibold ${
          urgent ? "text-loss" : "text-gold-300"
        }`}
      >
        {seconds}
      </div>
    </div>
  );
}
