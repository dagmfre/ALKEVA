"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/mark";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { SystemBanner } from "@/components/system/banner";
import { api, ApiError } from "@/lib/api";

/**
 * First impression, and the one screen an investor sees before anything else.
 *
 * The locale toggle sits above the fold on purpose: a user who cannot read the
 * current language must be able to switch it *before* authenticating.
 */
export function AuthForm({ mode }: { mode: "register" | "login" }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center gap-7 px-4 py-10">
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

        {error && <SystemBanner tone="critical">{error}</SystemBanner>}

        <Button type="submit" size="cta" disabled={busy}>
          {busy ? tc("loading") : mode === "register" ? t("registerButton") : t("loginButton")}
        </Button>
      </form>

      <Link
        href={mode === "register" ? "/login" : "/register"}
        className="text-center text-[0.9375rem] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {mode === "register" ? t("haveAccount") : t("needAccount")}
      </Link>
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
        className="min-h-12 rounded-md border border-input bg-background px-3.5 text-base outline-none transition-colors focus:border-gold-400"
      />
    </label>
  );
}
