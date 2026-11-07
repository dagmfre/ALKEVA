"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { TelegramSessionResponse } from "@alkeva/shared";
import { LOCALES, type Locale } from "@alkeva/shared/locales";

import { Field } from "@/components/auth/field";
import { SystemBanner } from "@/components/system/banner";
import { TgFrame } from "@/components/telegram/tg-frame";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { setTgTokens } from "@/lib/telegram/session";
import { webApp } from "@/lib/telegram/webapp";

type NeedsAccount = Extract<TelegramSessionResponse, { status: "needs_account" }>;

async function post(path: string, body: unknown): Promise<{ data?: TelegramSessionResponse; code?: string; body?: unknown }> {
  try {
    const res = await fetch(`/api${path}`, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as { message?: unknown } | null;
    if (!res.ok) {
      const code = typeof json?.message === "string" ? json.message : `http_${res.status}`;
      return { code: res.status === 400 ? "validation" : code, body: json };
    }
    return { data: json as TelegramSessionResponse };
  } catch {
    return { code: "network" };
  }
}

/**
 * First open of the Mini App by a Telegram account that opens no ALKEVA
 * account yet. Two honest choices: create a new account here, or prove an
 * existing one with its password. Accounts that have no password (Google,
 * Fayda, passkey) connect from the website instead, where they can sign in.
 */
export function TelegramOnboarding({
  data,
  onSignedIn,
}: {
  data: NeedsAccount;
  onSignedIn: () => void;
}) {
  const t = useTranslations("telegram");
  const [mode, setMode] = useState<"create" | "link">(data.signupEnabled ? "create" : "link");

  return (
    <TgFrame>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[1.375rem] font-bold">{t("welcomeTitle")}</h1>
        <p className="text-[0.9375rem] text-muted-foreground">
          {t("signedInAs", { name: data.telegram.display })}
        </p>
      </div>

      {data.signupEnabled ? (
        <Segmented
          value={mode}
          onValueChange={(v) => setMode(v as "create" | "link")}
          options={[
            { value: "create", label: t("tabCreate") },
            { value: "link", label: t("tabLink") },
          ]}
          stretch
          aria-label={t("welcomeTitle")}
        />
      ) : null}

      {mode === "create" ? (
        <CreateAccount data={data} onSignedIn={onSignedIn} />
      ) : (
        <LinkWithPassword data={data} onSignedIn={onSignedIn} />
      )}
    </TgFrame>
  );
}

function errorText(t: ReturnType<typeof useTranslations>, code: string, body?: unknown): string {
  switch (code) {
    case "email_taken_link_instead":
      return t("errEmailTaken");
    case "invalid_credentials":
      return t("errInvalidCredentials");
    case "login_locked": {
      const secs = (body as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds ?? 900;
      return t("errLocked", { minutes: Math.ceil(secs / 60) });
    }
    case "method_disabled":
      return t("errMethodDisabled");
    case "account_has_telegram":
      return t("errAccountHasTelegram");
    case "telegram_linked_elsewhere":
      return t("linkedElsewhere");
    case "telegram_staff_refused":
      return t("staffRefused");
    case "telegram_pending_expired":
      return t("expiredBody");
    case "validation":
      return t("errValidation");
    case "rate_limited":
    case "http_429":
      return t("rateLimited");
    default:
      return t("genericError");
  }
}

function CreateAccount({ data, onSignedIn }: { data: NeedsAccount; onSignedIn: () => void }) {
  const t = useTranslations("telegram");
  const ta = useTranslations("auth");
  const tc = useTranslations("common");
  const uiLocale = useLocale();
  const unsafeUser = webApp()?.initDataUnsafe.user;
  // Telegram's name is only a starting point the person can correct; a
  // verified legal name replaces it after the Fayda identity check.
  const [fullName, setFullName] = useState(
    [unsafeUser?.first_name, unsafeUser?.last_name].filter(Boolean).join(" ").slice(0, 120),
  );
  const [email, setEmail] = useState("");
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const locale: Locale = (LOCALES as readonly string[]).includes(uiLocale) ? (uiLocale as Locale) : "am";
    const r = await post("/auth/telegram/signup", {
      pendingToken: data.pendingToken,
      email,
      fullName,
      locale,
      acceptTerms: consented,
    });
    setBusy(false);
    if (r.data?.status === "signed_in") {
      setTgTokens(r.data.tokens);
      onSignedIn();
      return;
    }
    setError(errorText(t, r.code ?? "", r.body));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-[0.875rem] leading-relaxed text-muted-foreground">{t("createBody")}</p>
      {error ? <SystemBanner tone="critical">{error}</SystemBanner> : null}
      <Field
        label={ta("fullName")}
        name="fullName"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        required
        minLength={2}
        maxLength={120}
        autoComplete="name"
      />
      <Field
        label={ta("email")}
        name="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        inputMode="email"
      />
      <label className="flex items-start gap-3 text-[0.8125rem] leading-relaxed">
        <input
          type="checkbox"
          required
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
          className="mt-0.5 size-4.5 flex-none accent-(--gold-400)"
        />
        <span className="text-muted-foreground">
          {ta("acceptTerms")}{" "}
          <Link href="/terms" className="text-gold-400 underline-offset-4 hover:underline">
            {ta("termsLink")}
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="text-gold-400 underline-offset-4 hover:underline">
            {ta("privacyLink")}
          </Link>
        </span>
      </label>
      <Button type="submit" size="cta" disabled={busy || !consented}>
        {busy ? tc("loading") : t("createButton")}
      </Button>
    </form>
  );
}

function LinkWithPassword({ data, onSignedIn }: { data: NeedsAccount; onSignedIn: () => void }) {
  const t = useTranslations("telegram");
  const ta = useTranslations("auth");
  const tc = useTranslations("common");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = await post("/auth/telegram/link/password", {
      pendingToken: data.pendingToken,
      email,
      password,
    });
    setBusy(false);
    setPassword("");
    if (r.data?.status === "signed_in") {
      setTgTokens(r.data.tokens);
      onSignedIn();
      return;
    }
    setError(errorText(t, r.code ?? "", r.body));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-[0.875rem] leading-relaxed text-muted-foreground">
        {t("linkBody", { name: data.telegram.display })}
      </p>
      {error ? <SystemBanner tone="critical">{error}</SystemBanner> : null}
      <Field
        label={ta("email")}
        name="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="username"
        inputMode="email"
      />
      <Field
        label={ta("password")}
        name="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="current-password"
      />
      <Button type="submit" size="cta" disabled={busy}>
        {busy ? tc("loading") : t("linkButton")}
      </Button>
      <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">{t("linkNoPassword")}</p>
    </form>
  );
}
