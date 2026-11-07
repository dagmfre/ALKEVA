"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { BadgeCheck } from "lucide-react";
import type { FaydaCallbackResponse, FaydaProfileSummary, MeResponse } from "@alkeva/shared";

import { AuthShell } from "@/components/auth/auth-shell";
import { Field } from "@/components/auth/field";
import { landingFor, safeNext } from "@/components/auth-form";
import { SystemBanner } from "@/components/system/banner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";

/** eSignet's callback error codes we explain in words (docs §3.1). */
const KNOWN_ERRORS = new Set([
  "consent_request_rejected",
  "consent_details_rejected",
  "transaction_timeout",
  "invalid_transaction",
  "invalid_accepted_claim",
  "invalid_permitted_scope",
]);

/** API refusals worth their own sentence. */
const KNOWN_CODES = new Set([
  "fayda_state_invalid",
  "fayda_linked_elsewhere",
  "fayda_already_verified",
  "fayda_profile_incomplete",
  "fayda_pending_expired",
  "underage",
  "email_taken_link_instead",
]);

function readNext(): string {
  try {
    return safeNext(sessionStorage.getItem("alkeva.next"));
  } catch {
    return "/";
  }
}

/**
 * Where Fayda (VeriFayda 2.0 / eSignet) sends the browser back. The
 * ?code&state pair goes to the API through the /api proxy, together with the
 * httpOnly binding cookie set when the sign-in started — so a callback link
 * opened in any other browser is refused. Three outcomes:
 *  - a known person → signed in;
 *  - a signed-in user verifying their identity → back to identity, verified;
 *  - someone new → one short form (their verified name is shown, an email is
 *    asked for because alerts and receipts go by email, terms accepted).
 */
export function FaydaCallbackScreen() {
  const t = useTranslations("fayda");
  const tt = useTranslations("telegram");
  const ta = useTranslations("auth");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const fired = useRef(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState<{ token: string; profile: FaydaProfileSummary } | null>(null);
  const [busy, setBusy] = useState(false);
  const [consented, setConsented] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Telegram handoff: verified in this browser, confirmed back in the Mini App.
  const [handoffReturn, setHandoffReturn] = useState<{ url: string | null } | null>(null);

  useEffect(() => {
    // Strict mode runs effects twice; the authorization code is single-use.
    if (fired.current) return;
    fired.current = true;

    const providerError = params.get("error");
    if (providerError) {
      setProblem(KNOWN_ERRORS.has(providerError) ? t(`err_${providerError}`) : t("errGeneric"));
      return;
    }
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) {
      setProblem(t("errGeneric"));
      return;
    }
    void api<FaydaCallbackResponse>("/auth/fayda/callback", {
      method: "POST",
      body: JSON.stringify({ code, state }),
    })
      .then((res) => {
        if (res.status === "handoff_parked") {
          setHandoffReturn({ url: res.returnUrl });
          return;
        }
        if (res.status === "needs_profile") {
          setPending({ token: res.token, profile: res.profile });
          return;
        }
        if (res.status === "linked") {
          router.replace("/kyc?verified=1");
          router.refresh();
          return;
        }
        router.replace(landingFor(res.user, readNext()));
        router.refresh();
      })
      .catch((err) => {
        const code = err instanceof ApiError ? err.code : "";
        setProblem(KNOWN_CODES.has(code) ? t(`code_${code}`) : t("errGeneric"));
      });
  }, [params, router, t]);

  async function complete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pending) return;
    setFormError(null);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await api<{ status: string; user: MeResponse }>("/auth/fayda/complete", {
        method: "POST",
        body: JSON.stringify({
          token: pending.token,
          email: form.get("email"),
          locale,
          acceptTerms: consented,
        }),
      });
      router.replace(landingFor(res.user, readNext()));
      router.refresh();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      if (code === "fayda_pending_expired" || code === "fayda_state_invalid") {
        setPending(null);
        setProblem(t(`code_${code}`));
      } else {
        setFormError(KNOWN_CODES.has(code) ? t(`code_${code}`) : code === "validation_failed" ? ta("errorValidation") : t("errGeneric"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <div className="flex flex-col gap-6">
        {handoffReturn ? (
          <>
            <h1 className="text-[1.5rem] leading-tight font-extrabold">{tt("handoffDoneTitle")}</h1>
            <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{tt("handoffDoneBody")}</p>
            {handoffReturn.url ? (
              <Button size="cta" asChild>
                <a href={handoffReturn.url} rel="noopener noreferrer">
                  {tt("backToTelegram")}
                </a>
              </Button>
            ) : null}
          </>
        ) : problem ? (
          <>
            <h1 className="text-[1.5rem] leading-tight font-extrabold">{t("problemTitle")}</h1>
            <SystemBanner tone="critical">{problem}</SystemBanner>
            <Link href="/login" className="text-center text-[0.9375rem] text-gold-400 underline-offset-4 hover:underline">
              ← {t("backToSignIn")}
            </Link>
          </>
        ) : pending ? (
          <form onSubmit={complete} className="flex flex-col gap-5">
            <div>
              <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-[-0.02em]">{t("completeTitle")}</h1>
              <p className="mt-1.5 text-[0.875rem] text-muted-foreground">{t("completeBody")}</p>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-gain/25 bg-gain/8 px-4 py-3">
              <BadgeCheck className="size-5 flex-none text-gain" aria-hidden="true" />
              <div className="min-w-0">
                <div className="text-[0.75rem] text-subtle">{t("verifiedName")}</div>
                <div className="truncate text-[1rem] font-bold">{pending.profile.name}</div>
              </div>
            </div>
            <Field
              label={ta("email")}
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={pending.profile.email ?? ""}
            />
            <p className="-mt-3 text-[0.8125rem] leading-snug text-subtle">{t("emailWhy")}</p>
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
                <Link href="/terms" target="_blank" className="text-gold-400 underline-offset-4 hover:underline">
                  {ta("termsLink")}
                </Link>{" "}
                ·{" "}
                <Link href="/privacy" target="_blank" className="text-gold-400 underline-offset-4 hover:underline">
                  {ta("privacyLink")}
                </Link>
              </span>
            </label>
            {formError && <SystemBanner tone="critical">{formError}</SystemBanner>}
            <Button type="submit" size="cta" disabled={busy || !consented}>
              {busy ? tc("loading") : t("completeButton")}
            </Button>
          </form>
        ) : (
          <>
            <p className="text-[0.9375rem] text-muted-foreground">{t("finishing")}</p>
            <Skeleton className="h-10 w-full" />
          </>
        )}
      </div>
    </AuthShell>
  );
}
