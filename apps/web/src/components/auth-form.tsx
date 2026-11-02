"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { IdCard } from "lucide-react";
import type { MeResponse, ProvidersResponse } from "@alkeva/shared";

import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/auth-shell";
import { Field } from "@/components/auth/field";
import { PasskeyLoginButton } from "@/components/auth/passkey-login-button";
import { SystemBanner } from "@/components/system/banner";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

/** Only same-site relative paths survive as a post-sign-in destination. */
export function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

/** Where a freshly signed-in user should land, given what they still owe. */
export function landingFor(me: MeResponse, next: string): string {
  if (me.role !== "user") return next === "/" ? "/admin" : next;
  if (!me.emailVerified) return `/verify-email?next=${encodeURIComponent(next)}`;
  return next;
}

/**
 * Sign-in and registration. Which doors exist is decided by the server
 * (AUTH_METHODS → GET /auth/providers): Fayda — the national ID — leads,
 * password / Google / passkey follow only when enabled. When password sign-in
 * is off for customers, staff still reach it through a discreet "Staff
 * sign-in" link (their accounts have no other way in).
 *
 * The locale toggle sits above the fold: someone who cannot read the current
 * language must be able to switch before authenticating. Registration keeps
 * its hard consent gate — the checkbox feeds `acceptTerms: true`, which the
 * API's DTO requires.
 */
export function AuthForm({ mode }: { mode: "register" | "login" }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [faydaBusy, setFaydaBusy] = useState(false);
  const [consented, setConsented] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);

  const providers = useResource<ProvidersResponse>("/auth/providers");
  const p = providers.data;
  const showPassword = p?.password === true || (mode === "login" && staffOpen);
  const resetDone = mode === "login" && params.get("reset") === "1";
  const expired = mode === "login" && params.get("expired") === "1";

  function explain(err: unknown): string {
    if (!(err instanceof ApiError)) return t("errorGeneric");
    switch (err.code) {
      case "invalid_credentials":
        return t("errorInvalidCredentials");
      case "email_taken":
        return t("errorEmailTaken");
      case "validation_failed":
        return t("errorValidation");
      case "login_locked":
        return t("errorLocked");
      case "method_disabled":
        return t("errorMethodDisabled");
      case "fayda_unconfigured":
      case "fayda_unreachable":
        return t("faydaUnavailable");
      case "rate_limited":
        return tc("rateLimited");
      default:
        return t("errorGeneric");
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      const me =
        mode === "register"
          ? await api<MeResponse>("/auth/register", {
              method: "POST",
              body: JSON.stringify({
                email: form.get("email"),
                password: form.get("password"),
                fullName: form.get("fullName"),
                locale,
                acceptTerms: consented,
              }),
            })
          : await api<MeResponse>("/auth/login", {
              method: "POST",
              body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
            });
      router.replace(landingFor(me, next));
      router.refresh();
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  }

  async function startFayda() {
    setError(null);
    setFaydaBusy(true);
    try {
      const { url } = await api<{ url: string }>("/auth/fayda/start", { method: "POST" });
      try {
        sessionStorage.setItem("alkeva.next", next);
      } catch {
        /* private mode: land on Home afterwards */
      }
      // A full navigation: the national ID provider's own pages take over.
      window.location.href = url;
    } catch (err) {
      setError(explain(err));
      setFaydaBusy(false);
    }
  }

  function startGoogle() {
    // A full navigation, not fetch: the API 302s to Google's consent screen.
    window.location.href = `/api/auth/google/start?intent=${mode}&locale=${locale}`;
  }

  const alternates = p && (p.google || (p.passkey && mode === "login"));

  return (
    <AuthShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-[-0.02em]">
            {mode === "register" ? t("registerTitle") : t("loginTitle")}
          </h1>
          <p className="mt-1.5 text-[0.875rem] text-muted-foreground">{tc("tagline")}</p>
        </div>

        {resetDone && <SystemBanner tone="info">{t("resetOk")}</SystemBanner>}
        {expired && <SystemBanner tone="info">{t("sessionExpired")}</SystemBanner>}
        {error && <SystemBanner tone="critical">{error}</SystemBanner>}

        {!p ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <>
            {p.fayda && (
              <div className="flex flex-col gap-2">
                <Button type="button" size="cta" onClick={startFayda} disabled={faydaBusy}>
                  <IdCard className="size-5" strokeWidth={1.8} aria-hidden="true" />
                  {faydaBusy ? tc("loading") : t("continueWithFayda")}
                </Button>
                <p className="text-center text-[0.8125rem] leading-snug text-subtle">
                  {mode === "register" ? t("faydaRegisterHint") : t("faydaLoginHint")}
                </p>
              </div>
            )}

            {p.fayda && showPassword && <Divider label={t("orDivider")} />}

            {showPassword && (
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
                  minLength={mode === "register" ? 10 : 1}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                />

                {mode === "login" && p.password && (
                  <Link
                    href="/forgot-password"
                    className="-mt-1 self-end text-[0.8125rem] font-semibold text-gold-400 hover:text-gold-300"
                  >
                    {t("forgotPassword")}
                  </Link>
                )}

                {mode === "register" && (
                  <label className="flex items-start gap-3 text-[0.8125rem] leading-relaxed">
                    <input
                      type="checkbox"
                      required
                      checked={consented}
                      onChange={(e) => setConsented(e.target.checked)}
                      className="mt-0.5 size-4.5 flex-none accent-(--gold-400)"
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

                <Button type="submit" size="cta" variant={p.fayda ? "outline" : "default"} disabled={busy}>
                  {busy ? tc("loading") : mode === "register" ? t("registerButton") : t("loginButton")}
                </Button>
              </form>
            )}

            {alternates && (
              <>
                <Divider label={t("orDivider")} />
                {p.google && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="cta"
                      disabled={mode === "register" && showPassword && !consented}
                      onClick={startGoogle}
                    >
                      <GoogleMark />
                      {t("continueWithGoogle")}
                    </Button>
                    {mode === "register" && showPassword && !consented && (
                      <p className="-mt-4 text-center text-[0.8125rem] text-subtle">{t("googleNeedsConsent")}</p>
                    )}
                  </>
                )}
                {mode === "login" && <PasskeyLoginButton enabled={p.passkey} />}
              </>
            )}
          </>
        )}

        {(mode === "login" || p?.password || p?.google) && (
          <Link
            href={mode === "register" ? "/login" : "/register"}
            className="text-center text-[0.8125rem] font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            {mode === "register" ? t("haveAccount") : t("needAccount")}
          </Link>
        )}

        {mode === "login" && p && !p.password && !staffOpen && (
          <button
            type="button"
            onClick={() => setStaffOpen(true)}
            className="self-center text-[0.75rem] text-subtle underline-offset-4 hover:text-muted-foreground hover:underline"
          >
            {t("staffSignIn")}
          </button>
        )}
      </div>
    </AuthShell>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3.5" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      <span className="data-label">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
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
