"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BellRing, Smartphone } from "lucide-react";
import type { NotificationItem, NotificationsResponse, NotifyPrefs } from "@alkeva/shared";

import { useAppData } from "@/components/shell/app-data";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { SystemBanner } from "@/components/system/banner";
import { api } from "@/lib/api";
import { eatStamp } from "@/lib/format";
import { notificationDetail, notificationHref, notificationTitle } from "@/lib/notifications";
import { currentSubscription, disablePush, enablePush, isIosNotInstalled, pushSupported } from "@/lib/push";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/**
 * Every notice the account has received (paged), and how they reach you:
 * email and browser notifications per category. Security notices always
 * email — the owner must hear about a new sign-in.
 */
export function NotificationsScreen() {
  const t = useTranslations("notifications");
  const tc = useTranslations("common");
  const { notifications, markRead } = useAppData();
  const [older, setOlder] = useState<NotificationItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const first = notifications.data;
  useEffect(() => {
    setCursor(first?.nextCursor ?? null);
  }, [first?.nextCursor]);

  // Opening the page reads everything on it.
  useEffect(() => {
    if (first && first.unreadCount > 0) void markRead();
  }, [first, markRead]);

  async function more() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api<NotificationsResponse>(`/notifications?before=${encodeURIComponent(cursor)}`);
      setOlder((o) => [...o, ...page.notifications]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  const items = [...(first?.notifications ?? []), ...older];

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_25.25rem]">
      <Panel aria-label={t("title")}>
        <PanelHeader title={t("title")} />
        <div className="flex-1 border-t border-border">
          {notifications.loading ? (
            <div className="p-4">
              <Skeleton className="h-40" />
            </div>
          ) : notifications.error && !first ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <p className="text-[0.875rem] text-muted-foreground">{t("loadFailed")}</p>
              <Button variant="outline" onClick={notifications.reload}>
                {tc("retry")}
              </Button>
            </div>
          ) : items.length === 0 ? (
            <p className="p-8 text-center text-[0.875rem] text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul>
              {items.map((n) => {
                const detail = notificationDetail(t, n);
                return (
                  <li key={n.id} className="border-b border-border last:border-0">
                    <Link
                      href={notificationHref(n)}
                      className={cn("flex gap-3 px-[1.125rem] py-3.5 hover:bg-white/3", !n.readAt && "bg-gold-400/5")}
                    >
                      <span className={cn("mt-1.5 size-1.5 flex-none rounded-full", n.readAt ? "bg-transparent" : "bg-gold-400")} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.875rem] font-semibold">{notificationTitle(t, n)}</span>
                        {detail && <span className="tnum block text-[0.8125rem] text-muted-foreground">{detail}</span>}
                      </span>
                      <span className="tnum flex-none text-[0.75rem] text-subtle">{eatStamp(n.createdAt)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {cursor && (
            <div className="p-4">
              <Button variant="outline" className="w-full" onClick={() => void more()} disabled={loadingMore}>
                {loadingMore ? tc("loading") : t("loadMore")}
              </Button>
            </div>
          )}
        </div>
      </Panel>
      <div className="flex flex-col gap-3">
        <BrowserAlertsPanel />
        <PrefsPanel />
      </div>
    </div>
  );
}

function BrowserAlertsPanel() {
  const t = useTranslations("notifications");
  const [state, setState] = useState<"loading" | "on" | "off" | "blocked" | "unsupported" | "unavailable">("loading");
  const [busy, setBusy] = useState(false);
  const ios = isIosNotInstalled();

  useEffect(() => {
    if (!pushSupported()) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }
    void currentSubscription().then((s) => setState(s ? "on" : "off"));
  }, []);

  async function toggle() {
    setBusy(true);
    try {
      if (state === "on") {
        await disablePush();
        setState("off");
      } else {
        const r = await enablePush();
        setState(r === "granted" ? "on" : r === "denied" ? "blocked" : r === "unavailable" ? "unavailable" : "off");
      }
    } catch {
      /* leave state as is */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel aria-label={t("browserTitle")}>
      <PanelHeader title={t("browserTitle")} />
      <div className="flex flex-col gap-3 px-[1.125rem] pb-[1.125rem]">
        <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">{t("browserBody")}</p>
        {ios && state !== "on" && (
          <SystemBanner tone="caution" className="mb-0">
            <span className="flex items-start gap-2">
              <Smartphone className="mt-0.5 size-4 flex-none" aria-hidden="true" />
              {t("iosHint")}
            </span>
          </SystemBanner>
        )}
        {state === "blocked" && <SystemBanner tone="caution" className="mb-0">{t("pushBlockedLong")}</SystemBanner>}
        {state === "unsupported" && <p className="text-[0.8125rem] text-subtle">{t("pushUnsupported")}</p>}
        {state === "unavailable" && <p className="text-[0.8125rem] text-subtle">{t("pushUnavailable")}</p>}
        {(state === "on" || state === "off") && (
          <Button variant={state === "on" ? "outline" : "default"} onClick={() => void toggle()} disabled={busy}>
            <BellRing className="size-4" aria-hidden="true" />
            {state === "on" ? t("pushDisable") : t("pushEnable")}
          </Button>
        )}
      </div>
    </Panel>
  );
}

function PrefsPanel() {
  const t = useTranslations("notifications");
  const prefs = useResource<NotifyPrefs>("/notifications/prefs");
  const [saving, setSaving] = useState(false);
  const p = prefs.data;

  async function save(next: Partial<NotifyPrefs>) {
    setSaving(true);
    try {
      await api("/notifications/prefs", { method: "PATCH", body: JSON.stringify(next) });
      prefs.reload();
    } finally {
      setSaving(false);
    }
  }

  const rows: { key: "alerts" | "money"; label: string }[] = [
    { key: "alerts", label: t("prefAlerts") },
    { key: "money", label: t("prefMoney") },
  ];

  return (
    <Panel aria-label={t("prefsTitle")}>
      <PanelHeader title={t("prefsTitle")} />
      <div className="flex flex-col px-[1.125rem] pb-[1.125rem]">
        {!p ? (
          <Skeleton className="h-28" />
        ) : (
          <table className="w-full text-[0.8125rem]">
            <thead>
              <tr className="text-subtle">
                <th className="py-2 text-start font-medium" />
                <th className="py-2 text-center font-medium">{t("channelEmail")}</th>
                <th className="py-2 text-center font-medium">{t("channelBrowser")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-border">
                  <td className="py-2.5 font-semibold">{r.label}</td>
                  <td className="py-2.5 text-center">
                    <input
                      type="checkbox"
                      className="size-4 accent-(--gold-400)"
                      checked={p[r.key].email}
                      disabled={saving}
                      aria-label={`${r.label} — ${t("channelEmail")}`}
                      onChange={(e) => void save({ [r.key]: { ...p[r.key], email: e.target.checked } })}
                    />
                  </td>
                  <td className="py-2.5 text-center">
                    <input
                      type="checkbox"
                      className="size-4 accent-(--gold-400)"
                      checked={p[r.key].push}
                      disabled={saving}
                      aria-label={`${r.label} — ${t("channelBrowser")}`}
                      onChange={(e) => void save({ [r.key]: { ...p[r.key], push: e.target.checked } })}
                    />
                  </td>
                </tr>
              ))}
              <tr className="border-t border-border">
                <td className="py-2.5 font-semibold">{t("prefSecurity")}</td>
                <td className="py-2.5 text-center text-[0.75rem] text-subtle">{t("always")}</td>
                <td className="py-2.5 text-center">
                  <input
                    type="checkbox"
                    className="size-4 accent-(--gold-400)"
                    checked={p.security.push}
                    disabled={saving}
                    aria-label={`${t("prefSecurity")} — ${t("channelBrowser")}`}
                    onChange={(e) => void save({ security: { push: e.target.checked } })}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </Panel>
  );
}
