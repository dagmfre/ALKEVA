"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BellRing, Send, Unlink } from "lucide-react";
import type { TelegramLinkStartResponse, TelegramLinkStatusResponse } from "@alkeva/shared";

import { SystemBanner } from "@/components/system/banner";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { announceExpired } from "@/lib/telegram/session";
import { useIsTelegram } from "@/lib/telegram/use-telegram";
import { atLeast, webApp } from "@/lib/telegram/webapp";
import { useResource } from "@/lib/use-resource";

/**
 * Account › Telegram.
 *
 * Website: connect (a one-time t.me link), CONFIRM the Telegram account that
 * answered it (this is the decisive step and needs a recent sign-in), or
 * disconnect. Mini App: which account is connected, let the bot message you,
 * disconnect. Every connect and disconnect is emailed to the owner.
 */
export function TelegramCard() {
  const t = useTranslations("telegram");
  const router = useRouter();
  const inTelegram = useIsTelegram();
  const status = useResource<TelegramLinkStatusResponse>("/auth/telegram/link");
  const [start, setStart] = useState<TelegramLinkStartResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  const s = status.data;
  const reload = status.reload;
  const waiting = !!start && !s?.linked;

  // While a link is out, watch for the Telegram account that answers it.
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(reload, 4_000);
    return () => clearInterval(id);
  }, [waiting, reload]);

  if (status.loading && !s) {
    return (
      <Panel aria-label={t("cardTitle")}>
        <PanelHeader title={t("cardTitle")} />
        <div className="px-[1.125rem] pb-[1.125rem]">
          <Skeleton className="h-20" />
        </div>
      </Panel>
    );
  }
  if (!s || !s.available) return null;

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setError(null);
    setBusy(true);
    try {
      return await fn();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      setError(
        code === "reauth_required"
          ? t("errReauth")
          : code === "account_has_telegram"
            ? t("errAccountHasTelegram")
            : code === "telegram_linked_elsewhere"
              ? t("linkedElsewhere")
              : code === "telegram_link_pending_missing"
                ? t("errPendingGone")
                : t("genericError"),
      );
      return null;
    } finally {
      setBusy(false);
      status.reload();
    }
  }

  const connect = () =>
    run(async () => {
      setStart(await api<TelegramLinkStartResponse>("/auth/telegram/link/start", { method: "POST" }));
    });
  const decide = (decision: "confirm" | "reject") =>
    run(async () => {
      await api(`/auth/telegram/link/${decision}`, { method: "POST" });
      setStart(null);
    });
  const unlink = () =>
    run(async () => {
      await api("/auth/telegram/link", { method: "DELETE" });
      setConfirmUnlink(false);
      // Disconnecting from inside Telegram ends this very session.
      if (inTelegram) announceExpired();
    });
  const allowMessages = () => {
    const app = webApp();
    if (!app || !atLeast(app, "6.9") || !app.requestWriteAccess) return;
    app.requestWriteAccess((granted) => {
      if (granted) void run(() => api("/auth/telegram/messages", { method: "POST" }));
    });
  };

  return (
    <Panel aria-label={t("cardTitle")}>
      <PanelHeader title={t("cardTitle")} hint={s.botUsername ? `@${s.botUsername}` : undefined} />
      <div className="flex flex-1 flex-col gap-3 px-[1.125rem] pb-[1.125rem]">
        {error ? <SystemBanner tone="critical">{error}</SystemBanner> : null}

        {s.linked ? (
          <>
            <p className="text-[0.875rem] text-muted-foreground">
              {t("connectedAs", { name: s.linked.display })}
            </p>
            {inTelegram && !s.canMessage ? (
              <Button variant="outline" size="sm" onClick={allowMessages} disabled={busy}>
                <BellRing />
                {t("allowMessages")}
              </Button>
            ) : (
              <p className="text-[0.8125rem] text-subtle">
                {s.canMessage ? t("messagesOn") : t("messagesOff", { bot: s.botUsername ?? "" })}
              </p>
            )}
            {confirmUnlink ? (
              <div className="flex flex-col gap-2">
                <p className="text-[0.8125rem] text-muted-foreground">{t("unlinkConfirmBody")}</p>
                <span className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={() => void unlink()} disabled={busy}>
                    {t("unlinkConfirm")}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmUnlink(false)}>
                    {t("cancel")}
                  </Button>
                </span>
              </div>
            ) : (
              <Button variant="ghost" size="sm" className="self-start" onClick={() => setConfirmUnlink(true)}>
                <Unlink />
                {t("unlink")}
              </Button>
            )}
          </>
        ) : inTelegram ? null : s.pending ? (
          <>
            <p className="text-[0.875rem] leading-relaxed text-muted-foreground">
              {t("pendingBody", { name: s.pending.display })}
            </p>
            <span className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void decide("confirm")} disabled={busy}>
                {t("pendingConfirm")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void decide("reject")} disabled={busy}>
                {t("pendingReject")}
              </Button>
            </span>
            {error === t("errReauth") ? (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => router.push("/login?next=%2Faccount&expired=1")}
              >
                {t("signInAgain")}
              </Button>
            ) : null}
          </>
        ) : start ? (
          <>
            <p className="text-[0.875rem] leading-relaxed text-muted-foreground">{t("connectOpen")}</p>
            <Button size="sm" asChild className="self-start">
              <a href={start.url} target="_blank" rel="noopener noreferrer">
                <Send />
                {t("openTelegram")}
              </a>
            </Button>
            <p className="text-[0.75rem] text-subtle">{t("connectExpires")}</p>
          </>
        ) : (
          <>
            <p className="text-[0.875rem] leading-relaxed text-muted-foreground">{t("connectBody")}</p>
            <Button size="sm" className="self-start" onClick={() => void connect()} disabled={busy}>
              <Send />
              {t("connect")}
            </Button>
          </>
        )}
      </div>
    </Panel>
  );
}
