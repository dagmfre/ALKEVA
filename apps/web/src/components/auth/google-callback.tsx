"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import type { GoogleCallbackTelegramResponse } from "@alkeva/shared";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
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
  const tt = useTranslations("telegram");
  const [failed, setFailed] = useState(false);
  // Started from the Telegram Mini App: no session here, just the way back.
  const [telegram, setTelegram] = useState<GoogleCallbackTelegramResponse["telegram"] | null>(null);
  const [decision, setDecision] = useState<"pending" | "busy" | "approved" | "declined" | "expired">("pending");
  const fired = useRef(false);
  const fromTelegram = useRef(false);

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
    fromTelegram.current = stateFromTelegram(state);
    void api("/auth/google/callback", {
      method: "POST",
      body: JSON.stringify({ code, state }),
    })
      .then((res) => {
        const tg = (res as Partial<GoogleCallbackTelegramResponse> | null)?.telegram;
        if (tg) {
          setTelegram(tg);
          return;
        }
        router.replace("/");
        router.refresh();
      })
      .catch(() => setFailed(true));
  }, [params, router]);

  return (
    <AuthShell>
      <div className="flex flex-col gap-6">
        {telegram ? (
          <TelegramApproval
            info={telegram}
            decision={decision}
            onDecide={(kind) => {
              setDecision("busy");
              void fetch("/api/auth/telegram/google/approve", {
                method: "POST",
                credentials: "omit",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ flowId: telegram.flowId, token: telegram.token, decision: kind }),
              })
                .then((res) => setDecision(res.ok ? (kind === "approve" ? "approved" : "declined") : "expired"))
                .catch(() => setDecision("expired"));
            }}
          />
        ) : failed && fromTelegram.current ? (
          <SystemBanner tone="critical">{tt("googleFailedBody")}</SystemBanner>
        ) : failed ? (
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
    </AuthShell>
  );
}

/**
 * Was this sign-in started from the Telegram Mini App? Read from the state
 * JWT's payload for wording only. The server verifies the signature, and
 * nothing here grants anything.
 */
function stateFromTelegram(state: string): boolean {
  try {
    const part = state.split(".")[1] ?? "";
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return typeof (JSON.parse(json) as { tgf?: unknown }).tgf === "string";
  } catch {
    return false;
  }
}

/**
 * The decisive step of "Continue with Google" from Telegram, shown in the
 * browser that just proved the Google account: which Telegram account asked,
 * and an explicit choice. If someone else sent this link, "This wasn't me"
 * stops it — nothing is linked until "Connect".
 */
function TelegramApproval({
  info,
  decision,
  onDecide,
}: {
  info: GoogleCallbackTelegramResponse["telegram"];
  decision: "pending" | "busy" | "approved" | "declined" | "expired";
  onDecide: (kind: "approve" | "reject") => void;
}) {
  const tt = useTranslations("telegram");
  const back = info.returnUrl ? (
    <Button size="cta" asChild>
      <a href={info.returnUrl} rel="noopener noreferrer">
        <Send className="size-4" aria-hidden="true" />
        {tt("backToTelegram")}
      </a>
    </Button>
  ) : null;

  if (decision === "approved") {
    return (
      <>
        <h1 className="text-[1.5rem] leading-tight font-extrabold">{tt("googleDoneTitle")}</h1>
        <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{tt("googleDoneBody")}</p>
        {back}
      </>
    );
  }
  if (decision === "declined" || decision === "expired") {
    return (
      <>
        <h1 className="text-[1.5rem] leading-tight font-extrabold">{tt("googleDeclinedTitle")}</h1>
        <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
          {decision === "declined" ? tt("googleDeclinedBody") : tt("googleExpired")}
        </p>
      </>
    );
  }
  const busy = decision === "busy";
  return (
    <>
      <h1 className="text-[1.5rem] leading-tight font-extrabold">{tt("googleApproveTitle")}</h1>
      <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
        {tt("googleApproveBody", { telegram: info.telegram, account: info.account })}
      </p>
      <SystemBanner tone="caution">{tt("googleApproveWarning")}</SystemBanner>
      <Button size="cta" disabled={busy} onClick={() => onDecide("approve")}>
        {tt("googleApprove")}
      </Button>
      <Button variant="outline" size="cta" disabled={busy} onClick={() => onDecide("reject")}>
        {tt("googleApproveReject")}
      </Button>
    </>
  );
}
