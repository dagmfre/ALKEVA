"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Laptop, Smartphone } from "lucide-react";
import type { SessionItem } from "@alkeva/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { eatStamp } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

/** "Chrome on Android" from a user-agent string — good enough to recognise a device. */
function describe(ua: string | null): { label: string; phone: boolean } {
  if (!ua) return { label: "—", phone: false };
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const phone = /Android|iPhone|iPad|iPod|Mobile/.test(ua);
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return { label: os ? `${browser} · ${os}` : browser, phone };
}

/**
 * Every device signed in to this account (one session each since Phase 10).
 * Signing out one, or every other one, takes effect immediately — the API
 * refuses a revoked session's access token on its next request.
 */
export function SessionsCard() {
  const t = useTranslations("account.sessions");
  const [revision, setRevision] = useState(0);
  const sessions = useResource<{ sessions: SessionItem[] }>("/auth/sessions", { revision });
  const [busy, setBusy] = useState(false);
  const list = sessions.data?.sessions ?? [];
  const others = list.filter((s) => !s.current).length;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      setRevision((n) => n + 1);
    }
  }

  return (
    <Panel aria-label={t("title")}>
      <PanelHeader title={t("title")} hint={list.length > 0 ? String(list.length) : undefined} />
      <div className="flex flex-1 flex-col border-t border-border">
        {sessions.loading ? (
          <div className="p-4">
            <Skeleton className="h-20" />
          </div>
        ) : (
          list.map((s) => {
            const d = describe(s.userAgent);
            const Icon = d.phone ? Smartphone : Laptop;
            return (
              <div key={s.id} className="flex items-center gap-3 border-b border-border px-[1.125rem] py-3 last:border-b-0">
                <Icon className="size-4.5 flex-none text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[0.875rem] font-semibold">
                    {d.label}
                    {s.current && <Badge variant="gain">{t("thisDevice")}</Badge>}
                  </div>
                  <div className="tnum truncate text-[0.75rem] text-subtle">
                    {t("lastActive", { when: eatStamp(s.lastUsedAt) })}
                    {s.ip ? ` · ${s.ip}` : ""}
                  </div>
                </div>
                {!s.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void run(() => api(`/auth/sessions/${s.id}`, { method: "DELETE" }))}
                  >
                    {t("signOut")}
                  </Button>
                )}
              </div>
            );
          })
        )}
      </div>
      {others > 0 && (
        <div className="border-t border-border p-3">
          <Button
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => void run(() => api("/auth/sessions/revoke-others", { method: "POST" }))}
          >
            {t("signOutOthers", { count: others })}
          </Button>
        </div>
      )}
    </Panel>
  );
}
