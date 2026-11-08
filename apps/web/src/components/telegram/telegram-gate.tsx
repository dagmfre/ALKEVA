"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, LogOut, Send, Unlink } from "lucide-react";
import type { MeResponse, ProvidersResponse, TelegramSessionResponse } from "@alkeva/shared";

import { TelegramChrome } from "@/components/telegram/telegram-chrome";
import { TelegramClaim } from "@/components/telegram/telegram-claim";
import { TelegramOnboarding } from "@/components/telegram/telegram-onboarding";
import { TgFrame } from "@/components/telegram/tg-frame";
import { SystemBanner } from "@/components/system/banner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import {
  clearTgTokens,
  setTgTokens,
  storedRefreshToken,
  TG_EXPIRED_EVENT,
  TG_SIGNOUT_EVENT,
  tgRefresh,
} from "@/lib/telegram/session";
import { parseStartParam, type StartTarget } from "@/lib/telegram/start-param";
import { prepareChrome, webApp } from "@/lib/telegram/webapp";

type GateState =
  | { s: "booting" }
  | { s: "outside" }
  | { s: "ready" }
  | { s: "needs_account"; data: Extract<TelegramSessionResponse, { status: "needs_account" }> }
  | { s: "claim"; claimToken: string; account: string }
  | { s: "expired" }
  | { s: "refused"; code: string }
  /** A menu asked to sign out: choose how. The session is still live. */
  | { s: "sign_out" }
  | { s: "signed_out"; disconnected: boolean };

/** Pages anyone may read without an account (linked from the signup form). */
const OPEN_PATHS = ["/terms", "/privacy", "/copyright"];

/**
 * Exchanging initData happens ONCE per page load: the server accepts each
 * launch's initData a single time, so a double-run effect (React strict mode)
 * must not burn it twice.
 */
let boot: Promise<GateState> | null = null;

async function post<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; code: string }> {
  try {
    const res = await fetch(`/api${path}`, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as { message?: unknown } | null;
    if (!res.ok) {
      return { ok: false, status: res.status, code: typeof json?.message === "string" ? json.message : `http_${res.status}` };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, status: 0, code: "network" };
  }
}

async function bootstrap(target: StartTarget): Promise<GateState> {
  const app = webApp();
  if (!app) return { s: "outside" };
  prepareChrome(app);

  // A website-started link: the claim is the whole point of this launch.
  if (target.kind === "link") {
    const r = await post<{ claimToken: string; account: string }>("/auth/telegram/link/claim", {
      initData: app.initData,
      linkToken: target.token,
    });
    if (r.ok) return { s: "claim", claimToken: r.data.claimToken, account: r.data.account };
    if (r.code === "telegram_already_linked") return startSession(app.initData);
    return refusal(r.code);
  }

  // A reload inside the same Mini App: the session is still in this webview.
  if (storedRefreshToken() && (await tgRefresh())) return { s: "ready" };
  return startSession(app.initData);
}

async function startSession(initData: string): Promise<GateState> {
  const r = await post<TelegramSessionResponse>("/auth/telegram/session", { initData });
  if (!r.ok) return refusal(r.code);
  if (r.data.status === "signed_in") {
    setTgTokens(r.data.tokens);
    return { s: "ready" };
  }
  return { s: "needs_account", data: r.data };
}

function refusal(code: string): GateState {
  // Replayed / stale initData cannot be retried from here: only reopening the
  // Mini App produces a fresh, single-use launch.
  if (/^telegram_init_/.test(code) || code === "telegram_pending_expired" || code === "http_401") {
    return { s: "expired" };
  }
  return { s: "refused", code };
}

/**
 * The Mini App's front door. Nothing behind it renders until this Telegram
 * user is signed in to an ALKEVA account — the shell, its data providers and
 * every screen are children of the "ready" state.
 */
export function TelegramGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<GateState>({ s: "booting" });
  const target = useRef<StartTarget>({ kind: "none" });
  const routed = useRef(false);

  useEffect(() => {
    target.current = parseStartParam(webApp()?.initDataUnsafe.start_param);
    boot ??= bootstrap(target.current);
    let live = true;
    void boot.then((next) => {
      if (live) setState(next);
    });
    const onExpired = () =>
      // Signing out revokes the session on purpose; that is not "expired".
      setState((prev) => (prev.s === "signed_out" ? prev : { s: "expired" }));
    const onSignOut = () => setState((prev) => (prev.s === "ready" ? { s: "sign_out" } : prev));
    window.addEventListener(TG_EXPIRED_EVENT, onExpired);
    window.addEventListener(TG_SIGNOUT_EVENT, onSignOut);
    return () => {
      live = false;
      window.removeEventListener(TG_EXPIRED_EVENT, onExpired);
      window.removeEventListener(TG_SIGNOUT_EVENT, onSignOut);
    };
  }, []);

  const signedIn = useCallback(() => setState({ s: "ready" }), []);

  // A deep link chooses the first screen — once, and only from the home route.
  useEffect(() => {
    if (state.s !== "ready" || routed.current) return;
    routed.current = true;
    const t = target.current;
    if (t.kind === "path" && pathname === "/") router.replace(t.path);
  }, [state.s, pathname, router]);

  if (OPEN_PATHS.includes(pathname)) return <>{children}</>;

  switch (state.s) {
    case "ready":
      return <TelegramChrome>{children}</TelegramChrome>;
    case "needs_account":
      return <TelegramOnboarding data={state.data} onSignedIn={signedIn} />;
    case "claim":
      return (
        <TelegramClaim
          claimToken={state.claimToken}
          account={state.account}
          onSignedIn={signedIn}
          onExpired={() => setState({ s: "expired" })}
        />
      );
    case "sign_out":
      return (
        <SignOutChoice
          onCancel={signedIn}
          onDone={(disconnected) => setState({ s: "signed_out", disconnected })}
        />
      );
    case "signed_out":
      return <SignedOut disconnected={state.disconnected} />;
    case "outside":
      return <OutsideTelegram />;
    case "expired":
      return <Reopen />;
    case "refused":
      return <Refused code={state.code} />;
    default:
      return <Booting />;
  }
}

function Booting() {
  const t = useTranslations("telegram");
  return (
    <TgFrame>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground" role="status">
        <Loader2 className="size-6 animate-spin" aria-hidden="true" />
        <p className="text-[0.9375rem]">{t("signingIn")}</p>
      </div>
    </TgFrame>
  );
}

function Reopen() {
  const t = useTranslations("telegram");
  return (
    <TgFrame>
      <h1 className="text-[1.375rem] font-bold">{t("expiredTitle")}</h1>
      <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{t("expiredBody")}</p>
      <Button size="cta" onClick={() => webApp()?.close()}>
        {t("closeApp")}
      </Button>
    </TgFrame>
  );
}

function Refused({ code }: { code: string }) {
  const t = useTranslations("telegram");
  const message =
    code === "telegram_staff_refused"
      ? t("staffRefused")
      : code === "telegram_unconfigured"
        ? t("unconfigured")
        : code === "telegram_link_expired"
          ? t("linkExpired")
          : code === "telegram_linked_elsewhere"
            ? t("linkedElsewhere")
            : code === "rate_limited" || code === "http_429"
              ? t("rateLimited")
              : t("genericError");
  return (
    <TgFrame>
      <h1 className="text-[1.375rem] font-bold">{t("refusedTitle")}</h1>
      <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{message}</p>
      <Button size="cta" variant="outline" onClick={() => webApp()?.close()}>
        {t("closeApp")}
      </Button>
    </TgFrame>
  );
}

/** tg.allkeva.com opened in an ordinary browser: point the way into Telegram. */
function OutsideTelegram() {
  const t = useTranslations("telegram");
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/auth/providers", { credentials: "omit" })
      .then((r) => (r.ok ? (r.json() as Promise<ProvidersResponse>) : null))
      .then((p) => {
        if (p?.telegram.botUsername && p.telegram.appShortName) {
          setLink(`https://t.me/${p.telegram.botUsername}/${p.telegram.appShortName}`);
        }
      })
      .catch(() => undefined);
  }, []);
  return (
    <TgFrame>
      <h1 className="text-[1.375rem] font-bold">{t("outsideTitle")}</h1>
      <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{t("outsideBody")}</p>
      {link ? (
        <Button size="cta" asChild>
          <a href={link} rel="noopener noreferrer">
            <Send className="size-4" aria-hidden="true" />
            {t("openInTelegram")}
          </a>
        </Button>
      ) : null}
    </TgFrame>
  );
}

/**
 * Sign-out inside Telegram. There is no sign-in page here: the Telegram
 * account itself signs the person in, so "sign out" alone would be undone by
 * the next open. Two honest choices instead — end this session, or also
 * disconnect Telegram from the account so a different one can be used.
 */
function SignOutChoice({ onCancel, onDone }: { onCancel: () => void; onDone: (disconnected: boolean) => void }) {
  const t = useTranslations("telegram");
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState<"out" | "unlink" | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api<MeResponse>("/auth/me")
      .then((me) => setEmail(me.email))
      .catch(() => undefined);
  }, []);

  async function run(kind: "out" | "unlink") {
    setBusy(kind);
    setError(false);
    try {
      if (kind === "unlink") {
        // Removes the link and revokes every Telegram session of this account.
        await api("/auth/telegram/link", { method: "DELETE" });
      } else {
        await api("/auth/logout", { method: "POST" });
      }
    } catch {
      if (kind === "unlink") {
        setBusy(null);
        setError(true);
        return;
      }
      /* sign-out: the local session is dropped below either way */
    }
    clearTgTokens();
    onDone(kind === "unlink");
  }

  return (
    <TgFrame>
      <h1 className="text-[1.375rem] font-bold">{t("signOutTitle")}</h1>
      {email ? (
        <p className="text-[0.9375rem] text-muted-foreground">{t("signOutAccount", { email })}</p>
      ) : null}
      {error ? <SystemBanner tone="critical">{t("genericError")}</SystemBanner> : null}
      <div className="flex flex-col gap-1.5">
        <Button size="cta" variant="destructive" disabled={busy !== null} onClick={() => void run("out")}>
          {busy === "out" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <LogOut />}
          {t("signOutOnly")}
        </Button>
        <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">{t("signOutOnlyHint")}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Button size="cta" variant="outline" disabled={busy !== null} onClick={() => void run("unlink")}>
          {busy === "unlink" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Unlink />}
          {t("signOutDisconnect")}
        </Button>
        <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">{t("signOutDisconnectHint")}</p>
      </div>
      <Button variant="ghost" size="sm" disabled={busy !== null} onClick={onCancel}>
        {t("cancel")}
      </Button>
    </TgFrame>
  );
}

function SignedOut({ disconnected }: { disconnected: boolean }) {
  const t = useTranslations("telegram");
  return (
    <TgFrame>
      <h1 className="text-[1.375rem] font-bold">{t("signedOutTitle")}</h1>
      <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
        {disconnected ? t("signedOutDisconnectedBody") : t("signedOutBody")}
      </p>
      <Button size="cta" onClick={() => webApp()?.close()}>
        {t("closeApp")}
      </Button>
    </TgFrame>
  );
}
