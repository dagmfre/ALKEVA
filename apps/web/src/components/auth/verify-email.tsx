"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { MailCheck } from "lucide-react";
import type { MeResponse } from "@alkeva/shared";

import { AuthShell } from "@/components/auth/auth-shell";
import { safeNext } from "@/components/auth-form";
import { SystemBanner } from "@/components/system/banner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

/**
 * Confirm the email address with the 6-digit code it was sent. Money stays
 * locked until this is done: alerts, receipts and withdrawal codes all go to
 * this address, so it has to be one the customer actually reads.
 */
export function VerifyEmailScreen() {
  const t = useTranslations("verifyEmail");
  const tc = useTranslations("common");
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const me = useResource<MeResponse>("/auth/me");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function done(user: MeResponse) {
    // Verified email; a customer without a verified identity goes there next.
    router.replace(user.role === "user" && !user.identityVerified && user.kycTier < 1 ? "/kyc" : next);
    router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      done(await api<MeResponse>("/auth/email/verify", { method: "POST", body: JSON.stringify({ code }) }));
    } catch (err) {
      const c = err instanceof ApiError ? err.code : "";
      const left = (err instanceof ApiError ? (err.body as { attemptsLeft?: number })?.attemptsLeft : undefined) ?? null;
      setError(
        c === "code_invalid"
          ? t("wrongCode", { left: left ?? 0 })
          : c === "code_expired" || c === "code_locked"
            ? t("expiredCode")
            : t("error"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setNotice(null);
    try {
      const res = await api<{ sentTo: string }>("/auth/email/code", { method: "POST" });
      setNotice(t("resent", { email: res.sentTo }));
    } catch (err) {
      const c = err instanceof ApiError ? err.code : "";
      if (c === "email_already_verified" && me.data) done({ ...me.data, emailVerified: true });
      else setError(c === "code_rate_limited" || c === "rate_limited" ? tc("rateLimited") : t("error"));
    }
  }

  if (me.data?.emailVerified) {
    done(me.data);
  }

  return (
    <AuthShell>
      <div className="flex flex-col gap-6">
        <div className="flex size-12 items-center justify-center rounded-xl bg-gold-400/12 text-gold-400">
          <MailCheck className="size-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-[-0.02em]">{t("title")}</h1>
          {me.data ? (
            <p className="mt-1.5 text-[0.9375rem] text-muted-foreground">{t("body", { email: me.data.email })}</p>
          ) : (
            <Skeleton className="mt-2 h-5 w-64" />
          )}
        </div>
        {notice && <SystemBanner tone="info">{notice}</SystemBanner>}
        {error && <SystemBanner tone="critical">{error}</SystemBanner>}
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-[0.8125rem] font-semibold">{t("codeLabel")}</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="tnum h-14 rounded-lg border border-input bg-well px-4 text-center text-[1.5rem] tracking-[0.5em] outline-none focus:border-ring focus:ring-[3px] focus:ring-(--focus-ring)"
              aria-describedby="code-help"
            />
            <span id="code-help" className="text-[0.75rem] text-subtle">
              {t("codeHelp")}
            </span>
          </label>
          <Button type="submit" size="cta" disabled={busy || code.length !== 6}>
            {busy ? tc("loading") : t("confirm")}
          </Button>
        </form>
        <button
          type="button"
          onClick={resend}
          className="self-center text-[0.8125rem] font-semibold text-gold-400 underline-offset-4 hover:underline"
        >
          {t("resend")}
        </button>
      </div>
    </AuthShell>
  );
}
