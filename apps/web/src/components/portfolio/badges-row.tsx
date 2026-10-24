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
 * Achievement badges, computed on read by the API (nothing is stored).
 * Earned ones are champagne; unearned ones stay quiet with the criterion in a
 * tooltip, so the row also teaches what the platform rewards. Rendered as a
 * section inside a panel, not a panel of its own.
 */
export function BadgesRow({ badges, className }: { badges: BadgeDto[]; className?: string }) {
  const t = useTranslations("portfolio");
  if (badges.length === 0) return null;
  const earned = badges.filter((b) => b.earned).length;

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[0.8125rem] font-bold">{t("badges.title")}</span>
        <span className="data-label">{t("badges.earned", { n: earned, total: badges.length })}</span>
      </div>
      <TooltipProvider delayDuration={200}>
        <div className="flex flex-wrap gap-1.5">
          {badges.map((b) => (
            <Tooltip key={b.key}>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="rounded-full outline-none focus-visible:outline-2 focus-visible:outline-ring">
                  <Badge variant={b.earned ? "gold" : "muted"}>
                    <span aria-hidden="true">{b.earned ? "◆" : "◇"}</span>
                    {t(`badges.names.${b.key}` as never)}
                  </Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent>{t(`badges.criteria.${b.key}` as never)}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
}
