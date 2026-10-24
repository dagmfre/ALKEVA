"use client";

import { useTranslations } from "next-intl";
import type { AlertsResponse } from "@alkeva/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Coin, Panel, PanelHeader } from "@/components/ui/panel";
import { api } from "@/lib/api";
import { eatStamp, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/**
 * The user's price alerts — armed ones can be removed, fired ones are records.
 * Always rendered: with none set, it says where alerts come from.
 */
export function AlertsList({ className }: { className?: string }) {
  const t = useTranslations("alerts");
  const tc = useTranslations("common");
  const { data, reload } = useResource<AlertsResponse>("/alerts");

  const alerts = (data?.alerts ?? []).filter((a) => a.active || a.triggeredAt);

  async function remove(id: string) {
    try {
      await api(`/alerts/${id}`, { method: "DELETE" });
    } finally {
      reload();
    }
  }

  return (
    <Panel className={className} aria-label={t("listTitle")}>
      <PanelHeader title={t("listTitle")} hint={alerts.length > 0 ? String(alerts.length) : undefined} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-border">
        {alerts.length === 0 ? (
          <p className="flex min-h-32 flex-1 items-center justify-center px-6 text-center text-[0.8125rem] leading-relaxed text-muted-foreground">
            {t("listEmpty")}
          </p>
        ) : (
          alerts.map((a) => (
            <div key={a.id} className="flex items-center gap-3 border-b border-border px-[1.125rem] py-2.5 last:border-b-0">
              <Coin metal={a.asset} size="sm" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[0.8125rem]">
                  {a.asset === "XAU" ? tc("gold") : tc("platinum")} {t(a.direction)}{" "}
                  <b className="tnum font-semibold">{money(a.thresholdCentsPerGram)}</b>
                </span>
                {a.triggeredAt && <span className="tnum text-[0.6875rem] text-subtle">{eatStamp(a.triggeredAt)}</span>}
              </span>
              <Badge dot variant={a.triggeredAt ? "gold" : "muted"}>
                {a.triggeredAt ? t("fired") : t("armed")}
              </Badge>
              {!a.triggeredAt && (
                <Button variant="ghost" size="sm" className={cn("hover:text-loss")} onClick={() => void remove(a.id)}>
                  {t("remove")}
                </Button>
              )}
            </div>
          ))
        )}
        {alerts.length > 0 && (
          <p className="mt-auto border-t border-border px-[1.125rem] py-3 text-[0.71875rem] leading-relaxed text-subtle">
            {t("listFoot")}
          </p>
        )}
      </div>
    </Panel>
  );
}
