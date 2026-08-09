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
export function CountdownRing({ seconds, total }: { seconds: number; total: number }) {
  const fraction = Math.max(0, Math.min(1, seconds / Math.max(1, total)));
  const offset = CIRCUMFERENCE * (1 - fraction);
  const urgent = seconds <= 5;
  const stroke = urgent ? "var(--loss)" : "var(--gold-500)";

  return (
    <div className="relative size-14 flex-none" role="timer" aria-live="off">
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r={RADIUS} fill="none" stroke="var(--border)" strokeWidth="3" />
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
          urgent ? "text-loss" : "text-gold-400"
        }`}
      >
        {seconds}
      </div>
    </div>
  );
}
