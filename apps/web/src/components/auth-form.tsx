"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { LocaleSwitcher } from "./locale-switcher";

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
      router.push("/");
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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gold-500">{tc("appName")}</h1>
        <LocaleSwitcher />
      </div>
      <div>
        <h2 className="text-xl font-semibold">
          {mode === "register" ? t("registerTitle") : t("loginTitle")}
        </h2>
        <p className="mt-1 text-sm text-neutral-400">{tc("tagline")}</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {mode === "register" && (
          <label className="flex flex-col gap-1 text-sm">
            {t("fullName")}
            <input
              name="fullName"
              required
              minLength={2}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 outline-none focus:border-gold-500"
            />
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          {t("email")}
          <input
            name="email"
            type="email"
            required
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 outline-none focus:border-gold-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("password")}
          <input
            name="password"
            type="password"
            required
            minLength={8}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 outline-none focus:border-gold-500"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-gold-500 py-2.5 font-semibold text-neutral-950 transition-opacity disabled:opacity-50"
        >
          {busy ? tc("loading") : mode === "register" ? t("registerButton") : t("loginButton")}
        </button>
      </form>

      <Link
        href={mode === "register" ? "/login" : "/register"}
        className="text-center text-sm text-neutral-400 underline-offset-4 hover:underline"
      >
        {mode === "register" ? t("haveAccount") : t("needAccount")}
      </Link>
    </main>
  );
}
