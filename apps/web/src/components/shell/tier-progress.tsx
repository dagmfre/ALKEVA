"use client";

import { useTranslations } from "next-intl";
import { Check, Coins, Gem, Lock, Repeat, Rocket, ShoppingBag } from "lucide-react";
import type { BadgeDto, BadgeKey, ProgressResponse } from "@alkeva/shared";

import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The holding tier shown as a game level. One tier system, not two: these are
 * the same bands that set trading limits and delivery eligibility. Each tier
 * has its own gem SHAPE (and colour) so it is told apart without colour —
 * coin, trillion, round brilliant, oval, emerald cut.
 */
const TIER_STYLE: Record<string, { color: string; ring: string }> = {
  Gold: { color: "var(--gold-400)", ring: "ring-gold-400/60" },
  Tanzanite: { color: "#8f7cf7", ring: "ring-[#8f7cf7]/60" },
  Ruby: { color: "#f0616b", ring: "ring-[#f0616b]/60" },
  Sapphire: { color: "#5b9bf8", ring: "ring-[#5b9bf8]/60" },
  Emerald: { color: "#38c98a", ring: "ring-[#38c98a]/60" },
};

export function tierRing(name: string | null | undefined): string {
  return (name && TIER_STYLE[name]?.ring) || "ring-border";
}

export function TierGem({ name, className }: { name: string | null | undefined; className?: string }) {
  const color = (name && TIER_STYLE[name]?.color) || "var(--subtle)";
  const common = { fill: color, fillOpacity: 0.22, stroke: color, strokeWidth: 1.6, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4", className)} aria-hidden="true">
      {name === "Tanzanite" ? (
        <>
          <path d="M12 3 21 19H3Z" {...common} />
          <path d="M12 3v16M7.5 11h9" stroke={color} strokeWidth={1.1} fill="none" />
        </>
      ) : name === "Ruby" ? (
        <>
          <path d="M8 3h8l5 5v8l-5 5H8l-5-5V8Z" {...common} />
          <path d="M8 3l4 9 4-9M3 8l9 4 9-4M3 16l9-4 9 4M8 21l4-9 4 9" stroke={color} strokeWidth={0.9} fill="none" />
        </>
      ) : name === "Sapphire" ? (
        <>
          <ellipse cx="12" cy="12" rx="7.5" ry="9.5" {...common} />
          <ellipse cx="12" cy="12" rx="3.5" ry="5" stroke={color} strokeWidth={1.1} fill="none" />
        </>
      ) : name === "Emerald" ? (
        <>
          <path d="M7 3h10l4 4v10l-4 4H7l-4-4V7Z" {...common} />
          <path d="M9 7h6l2 2v6l-2 2H9l-2-2V9Z" stroke={color} strokeWidth={1.1} fill="none" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" {...common} />
          <circle cx="12" cy="12" r="5.5" stroke={color} strokeWidth={1.1} fill="none" />
        </>
      )}
    </svg>
  );
}

const BADGE_ICON: Record<BadgeKey, typeof ShoppingBag> = {
  first_purchase: ShoppingBag,
  ten_trades: Repeat,
  gold_holder: Coins,
  platinum_holder: Gem,
  early_adopter: Rocket,
};

/** Tier card: name, "tier 3 of 5", progress to the next tier, what it unlocks. */
export function TierCard({ progress, compact = false }: { progress: ProgressResponse; compact?: boolean }) {
  const t = useTranslations("tier");
  const tg = useTranslations("game");
  const { tier, next, totalTiers } = progress;
  const pct = tier.progressPctMilli ? Math.min(100, Number(tier.progressPctMilli) / 1000) : tier.nextName ? 0 : 100;
  const tierName = tier.name ? t(`names.${tier.name}` as never) : tg("noTier");

  return (
    <div className={cn("flex flex-col gap-3", compact ? "" : "rounded-lg border border-border bg-panel-2 p-4")}>
      <div className="flex items-center gap-3">
        <span className={cn("grid size-10 place-items-center rounded-full bg-raised ring-2", tierRing(tier.name))}>
          <TierGem name={tier.name} className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[0.9375rem] font-bold">{tierName}</div>
          {tier.rank !== null && (
            <div className="tnum text-[0.75rem] text-subtle">{tg("rankOf", { rank: tier.rank, total: totalTiers })}</div>
          )}
        </div>
      </div>
      {tier.nextName ? (
        <div className="flex flex-col gap-1.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-gold-400" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center justify-between text-[0.75rem]">
            <span className="text-muted-foreground">
              {tg("towards", { name: t(`names.${tier.nextName}` as never) })}
            </span>
            <span className="tnum text-foreground">{Math.floor(pct)}%</span>
          </div>
        </div>
      ) : (
        <p className="text-[0.75rem] text-muted-foreground">{t("topUnlock")}</p>
      )}
      {next && (
        <div className="flex flex-col gap-1 border-t border-border pt-2.5 text-[0.75rem]">
          <span className="data-label">{tg("unlocksNext")}</span>
          <span className="text-muted-foreground">
            {t("perTxnCap")}: <b className="tnum font-semibold text-foreground">{next.perTxnCapCents ? `${money(next.perTxnCapCents)}` : t("noLimit")}</b>
            {" · "}
            {t("dailyCap")}: <b className="tnum font-semibold text-foreground">{next.dailyCapCents ? `${money(next.dailyCapCents)}` : t("noLimit")}</b>
          </span>
          {next.deliveryEligible && !tier.deliveryEligible && (
            <span className="text-gold-300">{tg("unlocksDelivery")}</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Achievements: earned ones lit with a check, locked ones say how to earn them. */
export function Achievements({ badges, dense = false }: { badges: BadgeDto[]; dense?: boolean }) {
  const t = useTranslations("portfolio.badges");
  const earned = badges.filter((b) => b.earned).length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="data-label">{t("title")}</span>
        <span className="tnum text-[0.75rem] text-subtle">{t("earned", { n: earned, total: badges.length })}</span>
      </div>
      <ul className={cn("flex flex-col", dense ? "gap-1.5" : "gap-2")}>
        {badges.map((b) => {
          const Icon = BADGE_ICON[b.key];
          return (
            <li key={b.key} className="flex items-center gap-2.5">
              <span
                className={cn(
                  "grid size-7 flex-none place-items-center rounded-lg",
                  b.earned ? "bg-gold-400/15 text-gold-400" : "bg-raised text-subtle",
                )}
              >
                <Icon className="size-3.5" strokeWidth={1.9} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className={cn("truncate text-[0.8125rem] font-semibold", !b.earned && "text-muted-foreground")}>
                  {t(`names.${b.key}` as never)}
                </div>
                {!b.earned && <div className="truncate text-[0.6875rem] text-subtle">{t(`criteria.${b.key}` as never)}</div>}
              </div>
              {b.earned ? (
                <Check className="size-4 flex-none text-gain" aria-label="✓" />
              ) : (
                <Lock className="size-3.5 flex-none text-subtle" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
