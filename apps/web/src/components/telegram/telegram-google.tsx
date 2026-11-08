"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ExternalLink, Loader2 } from "lucide-react";
import type {
  TelegramGoogleStartResponse,
  TelegramGoogleStatus,
  TelegramSessionResponse,
} from "@alkeva/shared";
import { LOCALES, type Locale } from "@alkeva/shared/locales";

import { GoogleMark } from "@/components/auth-form";
import { SystemBanner } from "@/components/system/banner";
import { Button } from "@/components/ui/button";
import { setTgTokens } from "@/lib/telegram/session";
import { haptic, mainSiteHost, openExternal } from "@/lib/telegram/webapp";

type Flow =
  | { s: "idle" }
  | { s: "starting" }
  | { s: "ready_to_open"; flowId: string; url: string }
  | { s: "waiting"; flowId: string }
  | { s: "linking"; flowId: string; account: string };

async function post<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; code: string }> {
  try {
    const res = await fetch(`/api${path}`, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as { message?: unknown } | null;
    if (!res.ok) return { ok: false, code: typeof json?.message === "string" ? json.message : `http_${res.status}` };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, code: "network" };
  }
}

/**
 * "Continue with Google" inside the Mini App.
 *
 * Google refuses to sign anyone in from an embedded webview, which is what a
 * Mini App is, so the sign-in runs in the phone's browser:
 *   1. tap → the server makes a single-use ticket bound to this Mini App's
 *      pending Telegram identity;
 *   2. tap → the phone's browser opens allkeva.com/handoff#g=<ticket>, which
 *      goes straight to Google (Telegram only opens links from a tap, hence
 *      two of them — the same pattern as Chapa and Fayda);
 *   3. after Google, THAT browser shows which Telegram account asked and
 *      the owner approves it there (the decisive click is on the side that
 *      proved the account, never on the side that asked);
 *   4. back here, the Mini App signs in.
 * The browser never receives an ALKEVA session.
 */
export function TelegramGoogle({
  pendingToken,
  intent,
  consented = true,
  onSignedIn,
}: {
  pendingToken: string;
  telegramName: string;
  intent: "login" | "register";
  /** Register only: the terms box above must be ticked first. */
  consented?: boolean;
  onSignedIn: () => void;
}) {
  const t = useTranslations("telegram");
  const ta = useTranslations("auth");
  const uiLocale = useLocale();
  const [flow, setFlow] = useState<Flow>({ s: "idle" });
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  // The panel sits under the password form: bring each new step into view.
  useEffect(() => {
    if (flow.s === "ready_to_open" || flow.s === "waiting") {
      panel.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [flow.s]);

  const message = useCallback(
    (code: string) => {
      switch (code) {
        case "google_account_not_found":
          return t("googleNotFound");
        case "email_taken_link_instead":
          return t("googleEmailTaken");
        case "google_declined":
          return t("googleDeclined");
        case "google_email_unverified":
          return t("googleEmailUnverified");
        case "account_has_telegram":
          return t("errAccountHasTelegram");
        case "telegram_linked_elsewhere":
          return t("linkedElsewhere");
        case "telegram_staff_refused":
          return t("staffRefused");
        case "auth_google_unconfigured":
          return t("googleUnavailable");
        case "telegram_pending_expired":
          return t("expiredBody");
        case "telegram_google_expired":
        case "expired":
          return t("googleExpired");
        case "rate_limited":
        case "http_429":
          return t("rateLimited");
        default:
          return ta("googleFailed");
      }
    },
    [t, ta],
  );

  async function start() {
    setError(null);
    setFlow({ s: "starting" });
    const locale: Locale = (LOCALES as readonly string[]).includes(uiLocale) ? (uiLocale as Locale) : "am";
    const r = await post<TelegramGoogleStartResponse>("/auth/telegram/google/start", {
      pendingToken,
      intent,
      locale,
      acceptTerms: intent === "register" ? consented : undefined,
    });
    if (!r.ok) {
      setFlow({ s: "idle" });
      setError(message(r.code));
      return;
    }
    setFlow({ s: "ready_to_open", flowId: r.data.flowId, url: r.data.url });
  }

  function open(flowId: string, url: string) {
    if (!openExternal(url, [mainSiteHost()])) {
      setError(t("googleUnavailable"));
      return;
    }
    setFlow({ s: "waiting", flowId });
  }

  // While Google runs in the browser: poll, and check at once on return.
  const waitingId = flow.s === "waiting" ? flow.flowId : null;
  useEffect(() => {
    if (!waitingId) return;
    let live = true;
    const check = async () => {
      const r = await post<TelegramGoogleStatus>("/auth/telegram/google/status", {
        pendingToken,
        flowId: waitingId,
      });
      if (!live || !r.ok) return;
      const st = r.data;
      if (st.status === "ready") {
        // Approved in the browser by the account's owner: sign in.
        haptic("success");
        void finish(waitingId, st.account);
      } else if (st.status === "failed") {
        haptic("error");
        setFlow({ s: "idle" });
        setError(message(st.code));
      } else if (st.status === "expired") {
        setFlow({ s: "idle" });
        setError(message("expired"));
      }
    };
    const timer = setInterval(() => void check(), 2500);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [waitingId, pendingToken, message]);

  async function finish(flowId: string, account: string) {
    setError(null);
    setFlow({ s: "linking", flowId, account });
    const r = await post<TelegramSessionResponse>("/auth/telegram/google/confirm", { pendingToken, flowId });
    if (r.ok && r.data.status === "signed_in") {
      setTgTokens(r.data.tokens);
      onSignedIn();
      return;
    }
    setFlow({ s: "idle" });
    setError(message(r.ok ? "google_failed" : r.code));
  }

  async function cancel(flowId: string) {
    setFlow({ s: "idle" });
    await post("/auth/telegram/google/cancel", { pendingToken, flowId });
  }

  if (flow.s === "linking") {
    return (
      <div ref={panel} className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-4 text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        <span className="text-[0.875rem]">{t("googleConnecting", { account: flow.account })}</span>
      </div>
    );
  }

  if (flow.s === "ready_to_open" || flow.s === "waiting") {
    return (
      <div ref={panel} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        {flow.s === "ready_to_open" ? (
          <>
            <p className="text-[0.875rem] leading-relaxed text-muted-foreground">{t("googleReady")}</p>
            <Button type="button" size="cta" onClick={() => open(flow.flowId, flow.url)}>
              <ExternalLink className="size-4" aria-hidden="true" />
              {t("googleOpen")}
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5 text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span className="text-[0.875rem] leading-relaxed">{t("googleWaiting")}</span>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void cancel(flow.flowId).then(() => start())}>
              {t("googleStartOver")}
            </Button>
          </>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={() => void cancel(flow.flowId)}>
          {t("cancel")}
        </Button>
      </div>
    );
  }

  const needsConsent = intent === "register" && !consented;
  return (
    <div ref={panel} className="flex flex-col gap-2">
      {error ? <SystemBanner tone="critical">{error}</SystemBanner> : null}
      <Button
        type="button"
        variant="outline"
        size="cta"
        disabled={flow.s === "starting" || needsConsent}
        onClick={() => void start()}
      >
        {flow.s === "starting" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <GoogleMark />
        )}
        {ta("continueWithGoogle")}
      </Button>
      {needsConsent ? (
        <p className="text-[0.8125rem] text-muted-foreground">{ta("googleNeedsConsent")}</p>
      ) : null}
    </div>
  );
}

