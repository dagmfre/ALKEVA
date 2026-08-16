"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/mark";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { SystemBanner } from "@/components/system/banner";
import { api, ApiError } from "@/lib/api";

/**
 * Password recovery, both halves. The request form always reports success —
 * the API answers 202 whether or not the email exists (no enumeration), so
 * the UI cannot know more than "if that address is ours, a mail is on its
 * way", and saying more would leak.
 */
export function ForgotPasswordScreen() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      await api("/auth/recover", {
        method: "POST",
        body: JSON.stringify({ email: form.get("email") }),
      });
    } catch {
      // Deliberately swallowed: the answer is uniform either way.
    } finally {
      setSent(true);
      setBusy(false);
    }
  }

  return (
    <AuthPanel>
      <div>
        <h1 className="text-2xl font-semibold">{t("forgotTitle")}</h1>
        <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted-foreground">
          {t("forgotBody")}
        </p>
      </div>

      {sent ? (
        <p className="rounded-md border border-border bg-popover px-4 py-3.5 text-[0.9375rem] leading-relaxed">
          {t("resetSent")}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label={t("email")} name="email" type="email" required autoComplete="email" />
          <Button type="submit" size="cta" disabled={busy}>
            {busy ? tc("loading") : t("sendReset")}
          </Button>
        </form>
      )}

      <Link
        href="/login"
        className="text-center text-[0.9375rem] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        ← {t("loginTitle")}
      </Link>
    </AuthPanel>
  );
}

export function ResetPasswordScreen() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      await api("/auth/reset", {
        method: "POST",
        body: JSON.stringify({ token, password: form.get("password") }),
      });
      router.replace("/login?reset=1");
    } catch (err) {
      if (err instanceof ApiError && err.code === "invalid_reset_token") {
        setError(t("errorResetToken"));
      } else {
        setError(t("errorGeneric"));
      }
      setBusy(false);
    }
  }

  return (
    <AuthPanel>
      <div>
        <h1 className="text-2xl font-semibold">{t("resetTitle")}</h1>
        <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted-foreground">
          {t("resetBody")}
        </p>
      </div>

      {token ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field
            label={t("newPassword")}
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
          {error && <SystemBanner tone="critical">{error}</SystemBanner>}
          <Button type="submit" size="cta" disabled={busy}>
            {busy ? tc("loading") : t("resetButton")}
          </Button>
        </form>
      ) : (
        <SystemBanner tone="critical">{t("errorResetToken")}</SystemBanner>
      )}

      <Link
        href="/forgot-password"
        className="text-center text-[0.9375rem] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {t("forgotPassword")}
      </Link>
    </AuthPanel>
  );
}

function AuthPanel({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-[27rem] flex-col gap-7 lg:gap-6 lg:rounded-lg lg:border lg:border-border lg:bg-card lg:px-8 lg:py-9">
        <div className="flex items-center justify-between">
          <Wordmark size={30} />
          <LocaleToggle />
        </div>
        {children}
      </div>
    </main>
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
