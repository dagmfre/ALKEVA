"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Wordmark } from "@/components/brand/mark";
import { Skeleton } from "@/components/ui/skeleton";
import { SystemBanner } from "@/components/system/banner";
import { api } from "@/lib/api";

/**
 * Google's redirect target. The ?code&state pair is POSTed to the API
 * THROUGH the /api proxy so the session cookies land first-party — the same
 * reason the proxy exists at all. On success the user is simply home; on any
 * failure they get one honest sentence and a way back, never a spinner that
 * spins forever.
 */
export function GoogleCallbackScreen() {
  const t = useTranslations("auth");
  const router = useRouter();
  const params = useSearchParams();
  const [failed, setFailed] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    // React strict-mode double-invokes effects; the code is single-use at
    // Google, so the exchange must fire exactly once.
    if (fired.current) return;
    fired.current = true;

    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) {
      setFailed(true);
      return;
    }
    void api("/auth/google/callback", {
      method: "POST",
      body: JSON.stringify({ code, state }),
    })
      .then(() => {
        router.replace("/");
        router.refresh();
      })
      .catch(() => setFailed(true));
  }, [params, router]);

  return (
    <main className="flex min-h-dvh w-full items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-[27rem] flex-col gap-6 lg:rounded-lg lg:border lg:border-border lg:bg-card lg:px-8 lg:py-9">
        <Wordmark size={30} />
        {failed ? (
          <>
            <SystemBanner tone="critical">{t("googleFailed")}</SystemBanner>
            <Link
              href="/login"
              className="text-center text-[0.9375rem] text-gold-400 underline-offset-4 hover:underline"
            >
              ← {t("loginTitle")}
            </Link>
          </>
        ) : (
          <>
            <p className="text-[0.9375rem] text-muted-foreground">{t("googleSigningIn")}</p>
            <Skeleton className="h-10 w-full" />
          </>
        )}
      </div>
    </main>
  );
}
