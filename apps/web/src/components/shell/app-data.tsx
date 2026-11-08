"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type {
  MeResponse,
  NotificationItem,
  NotificationsResponse,
  ProgressResponse,
  WalletResponse,
} from "@alkeva/shared";

import { TG_RESUME_EVENT } from "@/components/telegram/telegram-chrome";
import { api, ApiError } from "@/lib/api";
import { openAuthedStream } from "@/lib/authed-stream";
import { tgRefresh } from "@/lib/telegram/session";
import { isTelegramSurface } from "@/lib/telegram/webapp";
import { useResource, type Resource } from "@/lib/use-resource";
import { notificationDetail, notificationHref, notificationTitle } from "@/lib/notifications";

interface AppData {
  me: Resource<MeResponse>;
  wallet: Resource<WalletResponse>;
  progress: Resource<ProgressResponse>;
  notifications: Resource<NotificationsResponse>;
  /** Marks notices read; with no ids, everything. Optimistic. */
  markRead: (ids?: string[]) => Promise<void>;
  /** Re-reads wallet + progress (after a trade, deposit, withdrawal…). */
  refreshMoney: () => void;
}

const Ctx = createContext<AppData | null>(null);

/** Templates that change balances — a live notice of one refreshes the wallet. */
const MONEY_TEMPLATES = /^(deposit_|payout_|order_|delivery_)/;

/**
 * The shell's shared reads, fetched ONCE for the whole app (the header used
 * to render twice — desk and phone — and each copy polled on its own).
 *
 * One EventSource on /api/notifications/stream says "something new" the
 * moment the API or the worker records a notice; the list, the wallet and
 * the tier then refetch over the ordinary authenticated endpoints, a toast
 * names it, and — when the tab is in the background and this browser has no
 * push subscription — a system notification shows it. If the stream drops,
 * a 60-second poll keeps the bell honest until it reconnects.
 */
export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("notifications");
  const [moneyRev, setMoneyRev] = useState(0);
  const [noteRev, setNoteRev] = useState(0);
  const [streamUp, setStreamUp] = useState(false);

  const me = useResource<MeResponse>("/auth/me");
  const wallet = useResource<WalletResponse>("/wallet", { revision: moneyRev, intervalMs: 120_000 });
  const progress = useResource<ProgressResponse>("/me/progress", { revision: moneyRev });
  const notifications = useResource<NotificationsResponse>("/notifications", {
    revision: noteRev,
    intervalMs: streamUp ? undefined : 60_000,
  });

  const refreshMoney = useCallback(() => setMoneyRev((n) => n + 1), []);
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    const telegram = isTelegramSurface();
    if (!telegram && typeof EventSource === "undefined") return;
    let source: EventSource | null = null;
    let closeStream: (() => void) | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const onNotice = (raw: string) => {
      let template = "";
      try {
        template = (JSON.parse(raw) as { template?: string }).template ?? "";
      } catch {
        /* still refetch */
      }
      setNoteRev((n) => n + 1);
      if (MONEY_TEMPLATES.test(template) || template === "price_alert") refreshMoney();
      void announce(template);
    };

    const connect = () => {
      if (telegram) {
        // The Mini App is cookie-less: same stream, bearer header, over fetch.
        closeStream = openAuthedStream("/notifications/stream", {
          onOpen: () => setStreamUp(true),
          onEvent: (event, data) => {
            if (event === "notification") onNotice(data);
          },
          onError: (status) => {
            setStreamUp(false);
            if (closed) return;
            if (status === 401) {
              // Refresh first; reconnect with the new token straight away.
              void tgRefresh().then((ok) => {
                if (!closed) retry = setTimeout(connect, ok ? 0 : 30_000);
              });
            } else {
              retry = setTimeout(connect, 30_000);
            }
          },
        });
        return;
      }
      source = new EventSource("/api/notifications/stream", { withCredentials: true });
      source.onopen = () => setStreamUp(true);
      source.addEventListener("notification", (ev) => onNotice((ev as MessageEvent<string>).data));
      source.onerror = () => {
        setStreamUp(false);
        source?.close();
        // EventSource gives up on a 401; come back once the session is refreshed.
        if (!closed) retry = setTimeout(connect, 30_000);
      };
    };

    /** Toast now; a system notification too when nobody is looking. */
    const announce = async (template: string) => {
      let latest: NotificationItem | undefined;
      try {
        latest = (await api<NotificationsResponse>("/notifications")).notifications[0];
      } catch {
        return;
      }
      if (!latest) return;
      const title = notificationTitle(tRef.current, latest);
      const detail = notificationDetail(tRef.current, latest);
      toast(title, { description: detail ?? undefined });
      if (
        !telegram &&
        typeof document !== "undefined" &&
        document.visibilityState === "hidden" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        // A push subscription delivers its own system notification; only
        // fall back here when this browser has none.
        const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
        const sub = await reg?.pushManager.getSubscription().catch(() => null);
        if (!sub) {
          const n = new Notification(title, { body: detail ?? undefined, icon: "/brand/mark-256.png", tag: latest.id });
          n.onclick = () => {
            window.focus();
            window.location.assign(notificationHref(latest!));
          };
        }
      }
      void template;
    };

    connect();
    // The service worker posts here when a push arrives while this tab has focus.
    const onSwMessage = (ev: MessageEvent) => {
      if ((ev.data as { type?: string } | null)?.type === "alkeva:notification") setNoteRev((n) => n + 1);
    };
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    // Back in the Mini App (e.g. from Chapa in the phone's browser): re-read
    // balances and notices at once rather than waiting for the next poll.
    const onResume = () => {
      refreshMoney();
      setNoteRev((n) => n + 1);
    };
    window.addEventListener(TG_RESUME_EVENT, onResume);
    return () => {
      closed = true;
      source?.close();
      closeStream?.();
      if (retry) clearTimeout(retry);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
      window.removeEventListener(TG_RESUME_EVENT, onResume);
    };
  }, [refreshMoney]);

  const markRead = useCallback(
    async (ids?: string[]) => {
      try {
        await api("/notifications/read", {
          method: "POST",
          body: JSON.stringify(ids && ids.length > 0 ? { ids } : { all: true }),
        });
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
      } finally {
        setNoteRev((n) => n + 1);
      }
    },
    [],
  );

  const value = useMemo<AppData>(
    () => ({ me, wallet, progress, notifications, markRead, refreshMoney }),
    [me, wallet, progress, notifications, markRead, refreshMoney],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppData must be used inside AppDataProvider");
  return v;
}

/** The same data when inside the customer shell; null elsewhere (the staff console). */
export function useOptionalAppData(): AppData | null {
  return useContext(Ctx);
}
