"use client";

import { useTranslations } from "next-intl";
import type { AlertsResponse } from "@alkeva/shared";

import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { eatStamp, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/** The user's price alerts — armed ones can be removed, fired ones are records. */
export function AlertsList({ className }: { className?: string }) {
  const t = useTranslations("alerts");
  const tc = useTranslations("common");
  const { data, reload } = useResource<AlertsResponse>("/alerts");

  const alerts = (data?.alerts ?? []).filter((a) => a.active || a.triggeredAt);
  if (alerts.length === 0) return null;

  async function remove(id: string) {
    try {
      await api(`/alerts/${id}`, { method: "DELETE" });
    } finally {
      reload();
    }
  }

  return (
    <Card className={cn("px-4 pb-1 pt-3", className)}>
      <h2 className="mb-1 text-base font-semibold">{t("listTitle")}</h2>
      {alerts.map((a) => (
        <div
          key={a.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-border py-2.5 first:border-t-0"
        >
          <span className="flex-1 text-[0.9375rem]">
            {a.asset === "XAU" ? tc("gold") : tc("platinum")} {t(a.direction)}{" "}
            <span className="tnum font-semibold">{money(a.thresholdCentsPerGram)}</span>
          </span>
          <span
            className={cn(
              "text-[0.875rem]",
              a.triggeredAt ? "text-gold-400" : "text-muted-foreground",
            )}
          >
            {a.triggeredAt ? `✓ ${t("fired")}` : t("armed")}
          </span>
          {!a.triggeredAt && (
            <button
              type="button"
              onClick={() => void remove(a.id)}
              className="text-[0.875rem] text-muted-foreground underline-offset-4 hover:text-loss hover:underline"
            >
              {t("remove")}
            </button>
          )}
          {a.triggeredAt && (
            <span className="font-latin w-full text-[0.75rem] text-subtle">
              {eatStamp(a.triggeredAt)}
            </span>
          )}
        </div>
      ))}
    </Card>
  );
}
