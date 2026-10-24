"use client";

import { useTranslations } from "next-intl";
import type { TierDto } from "@alkeva/shared";

import { usd } from "@/lib/format";

/** Localized gemstone tier name; falls back to the configured key. */
export function useTierName() {
  const t = useTranslations("tier");
  return (name: string | null) =>
    name ? (t.has(`names.${name}` as never) ? t(`names.${name}` as never) : name) : null;
}

/**
 * The tier gauge (RabbitX's margin gauge, translated): a half-ring showing
 * progress through the current gemstone band, the USD reference the bands
 * use, and what the next band is. At the top tier the ring is full.
 */
export function TierGauge({ tier, size = 92 }: { tier: TierDto; size?: number }) {
  const t = useTranslations("tier");
  const name = useTierName();
  const progress =
    tier.progressPctMilli !== null ? Math.min(100, Number(tier.progressPctMilli) / 1000) : 100;

  const r = 38;
  const len = Math.PI * r;
  const h = Math.round(size * (54 / 92));

  return (
    <div className="flex items-center gap-3.5">
      <svg width={size} height={h} viewBox="0 0 92 54" aria-hidden="true" className="flex-none">
        <path d="M8 48a38 38 0 0 1 76 0" fill="none" stroke="var(--raised)" strokeWidth="7" strokeLinecap="round" />
        <path
          d="M8 48a38 38 0 0 1 76 0"
          fill="none"
          stroke="var(--gold-400)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={len.toFixed(1)}
          strokeDashoffset={(len * (1 - progress / 100)).toFixed(1)}
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700"
        />
        <text
          x="46"
          y="46"
          textAnchor="middle"
          className="fill-foreground font-mono text-[13px] font-semibold"
        >
          {Math.round(progress)}%
        </text>
      </svg>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="tnum text-[0.9375rem] font-semibold">
          ${usd(tier.holdingUsdCents)}
          {tier.nextThresholdUsd !== null && (
            <span className="ms-1 text-[0.75rem] font-medium text-subtle">
              / ${tier.nextThresholdUsd.toLocaleString("en-US")}
            </span>
          )}
        </span>
        <span className="text-[0.78125rem] leading-snug text-muted-foreground">
          {tier.nextName ? t("nextShort", { name: name(tier.nextName) ?? "" }) : t("topUnlock")}
        </span>
      </div>
    </div>
  );
}
