/**
 * The ALKEVA mark — two interlocking rings, gold and platinum.
 *
 * The client's identity is "interconnected golden and silver shapes"
 * (Discovery Q60); no asset file has been delivered. This placeholder encodes
 * the relationship that matters and that the product depends on: the two
 * metals ALKEVA actually trades, in the exact colours the app uses for them.
 * A supplied logo drops in here without a re-layout.
 */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="12.5" cy="16" r="8.5" stroke="var(--gold-500)" strokeWidth="2.25" />
      <circle cx="19.5" cy="16" r="8.5" stroke="var(--platinum-400)" strokeWidth="2.25" />
    </svg>
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
