"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/mark";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { PasskeyLoginButton } from "@/components/auth/passkey-login-button";
import { SystemBanner } from "@/components/system/banner";
import { api, ApiError } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

interface ProvidersResponse {
  google: boolean;
  webauthn: boolean;
}

/**
 * First impression, and the one screen an investor sees before anything else.
 *
 * The locale toggle sits above the fold on purpose: a user who cannot read the
 * current language must be able to switch it *before* authenticating.
 *
 * Registration carries a hard consent gate: the checkbox feeds
 * `acceptTerms: true` to the API, whose DTO refuses anything else — the
 * client checkbox is UX, the DTO is the boundary. The Google button renders
 * only when the API reports the provider configured, and on the register
 * side only once consent is checked (a provider signup is still a signup).
 */
export function AuthForm({ mode }: { mode: "register" | "login" }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [consented, setConsented] = useState(false);

  const providers = useResource<ProvidersResponse>("/auth/providers");
  const googleReady = providers.data?.google === true;
  const webauthnReady = providers.data?.webauthn === true;
  const resetDone = mode === "login" && params.get("reset") === "1";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      if (mode === "register") {
        await api("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            email: form.get("email"),
            password: form.get("password"),
            fullName: form.get("fullName"),
            locale,
            acceptTerms: consented,
          }),
        });
      } else {
        await api("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: form.get("email"),
            password: form.get("password"),
          }),
        });
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "invalid_credentials") setError(t("errorInvalidCredentials"));
        else if (err.code === "email_taken") setError(t("errorEmailTaken"));
        else if (err.code === "validation_failed") setError(t("errorValidation"));
        else setError(t("errorGeneric"));
      } else {
        setError(t("errorGeneric"));
      }
    } finally {
      setBusy(false);
    }
  }

  function startGoogle() {
    // A full navigation, not fetch: the API 302s to Google's consent screen.
    window.location.href = `/api/auth/google/start?intent=${mode}&locale=${locale}`;
  }

  return (
    /*
     * Signing in is a focused task, so it stays one column at every width —
     * but on a desk the column sits in a panel on the ground rather than
     * floating bare, which is what made the old shell read as a phone
     * screenshot pasted into a browser.
     */
    <main className="flex min-h-dvh w-full items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-[27rem] flex-col gap-7 lg:gap-6 lg:rounded-lg lg:border lg:border-border lg:bg-card lg:px-8 lg:py-9">
        <div className="flex items-center justify-between">
          <Wordmark size={30} />
          <LocaleToggle />
        </div>

        <div>
          <h1 className="text-2xl font-semibold">
            {mode === "register" ? t("registerTitle") : t("loginTitle")}
          </h1>
          <p className="mt-1 text-[0.9375rem] text-muted-foreground">{tc("tagline")}</p>
        </div>

        {resetDone && <SystemBanner tone="info">{t("resetOk")}</SystemBanner>}

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {mode === "register" && (
            <Field label={t("fullName")} name="fullName" required minLength={2} autoComplete="name" />
          )}
          <Field label={t("email")} name="email" type="email" required autoComplete="email" />
          <Field
            label={t("password")}
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
          />

          {mode === "login" && (
            <Link
              href="/forgot-password"
              className="-mt-1 self-end text-[0.9375rem] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {t("forgotPassword")}
            </Link>
          )}

          {mode === "register" && (
            <label className="flex items-start gap-3 text-[0.9375rem] leading-relaxed">
              <input
                type="checkbox"
                required
                checked={consented}
                onChange={(e) => setConsented(e.target.checked)}
                className="mt-1 size-4.5 flex-none accent-(--gold-500)"
              />
              <span className="text-muted-foreground">
                {t("acceptTerms")}{" "}
                <Link href="/terms" target="_blank" className="text-gold-400 underline-offset-4 hover:underline">
                  {t("termsLink")}
                </Link>{" "}
                ·{" "}
                <Link href="/privacy" target="_blank" className="text-gold-400 underline-offset-4 hover:underline">
                  {t("privacyLink")}
                </Link>
              </span>
            </label>
          )}

          {error && <SystemBanner tone="critical">{error}</SystemBanner>}

          <Button type="submit" size="cta" disabled={busy}>
            {busy ? tc("loading") : mode === "register" ? t("registerButton") : t("loginButton")}
          </Button>
        </form>

        {(googleReady || (webauthnReady && mode === "login")) && (
          <>
            <div className="flex items-center gap-3.5" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[0.8125rem] text-subtle">{t("orDivider")}</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            {googleReady && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="cta"
                  disabled={mode === "register" && !consented}
                  onClick={startGoogle}
                >
                  <GoogleMark />
                  {t("continueWithGoogle")}
                </Button>
                {mode === "register" && !consented && (
                  <p className="-mt-4 text-center text-[0.8125rem] text-subtle">
                    {t("googleNeedsConsent")}
                  </p>
                )}
              </>
            )}
            {mode === "login" && <PasskeyLoginButton enabled={webauthnReady} />}
          </>
        )}

        <Link
          href={mode === "register" ? "/login" : "/register"}
          className="text-center text-[0.9375rem] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {mode === "register" ? t("haveAccount") : t("needAccount")}
        </Link>
      </div>
    </main>
  );
}

/** The four-color G, inline — no external asset, no tracking pixel. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.17 3.57-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.92l-3.87-3c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.28A7.2 7.2 0 0 1 4.91 12c0-.79.14-1.56.38-2.28v-3.1H1.29a12 12 0 0 0 0 10.76l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.29 6.62l4 3.1C6.23 6.88 8.88 4.77 12 4.77Z"
      />
    </svg>
  );
}

function Field({
  label,
  name,
  ...props
}: { label: string; name: string } & React.ComponentProps<"input">) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.9375rem] font-medium">{label}</span>
      <input
        name={name}
        {...props}
        className="well min-h-12 rounded-md border-input px-3.5 text-base outline-none transition-colors focus:border-gold-400"
      />
    </label>
  );
}
