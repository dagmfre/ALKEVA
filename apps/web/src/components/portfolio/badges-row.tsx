"use client";

import { useTranslations } from "next-intl";
import type { BadgeDto } from "@alkeva/shared";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Achievement badges (Phase 3.5, computed on read — the API derives them
 * from settled orders and balances, nothing is stored). Earned = gold-text
 * chip; unearned = muted with the criterion in a tooltip, so the row also
 * teaches what the platform rewards.
 */
export function BadgesRow({ badges, className }: { badges: BadgeDto[]; className?: string }) {
  const t = useTranslations("portfolio");
  if (badges.length === 0) return null;

  return (
    <section className={cn("rounded-lg border border-border bg-card p-4 lg:p-5", className)}>
      <h2 className="text-[1.125rem] font-semibold">{t("badges.title")}</h2>
      <TooltipProvider delayDuration={200}>
        <div className="mt-3 flex flex-wrap gap-2">
          {badges.map((b) => (
            <Tooltip key={b.key}>
              <TooltipTrigger asChild>
                <span>
                  <Badge variant={b.earned ? "gold" : "muted"}>
                    {b.earned ? "◆" : "◇"} {t(`badges.names.${b.key}` as never)}
                  </Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent>{t(`badges.criteria.${b.key}` as never)}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </section>
  );
}
