"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import type { TelegramSessionResponse } from "@alkeva/shared";

import { TgFrame } from "@/components/telegram/tg-frame";
import { Button } from "@/components/ui/button";
import { setTgTokens } from "@/lib/telegram/session";
import { webApp } from "@/lib/telegram/webapp";

type ClaimStatus = { status: "waiting" | "rejected" | "expired" } | TelegramSessionResponse;

/**
 * Link path (b), the Mini App's half. This Telegram account is now parked
 * against the account that made the link — and NOTHING is linked until its
 * owner confirms on the allkeva.com page they came from (with a fresh
 * sign-in). Until then this screen waits; a leaked link alone links nothing.
 */
export function TelegramClaim({
  claimToken,
  account,
  onSignedIn,
  onExpired,
}: {
  claimToken: string;
  account: string;
  onSignedIn: () => void;
  onExpired: () => void;
}) {
  const t = useTranslations("telegram");
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const started = Date.now();

    const poll = async () => {
      if (stop) return;
      try {
        const res = await fetch("/api/auth/telegram/link/claim-status", {
          method: "POST",
          credentials: "omit",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claimToken }),
        });
        if (res.ok) {
          const body = (await res.json()) as ClaimStatus;
          if (body.status === "signed_in") {
            setTgTokens(body.tokens);
            onSignedIn();
            return;
          }
          if (body.status === "rejected") {
            setRejected(true);
            return;
          }
          if (body.status === "expired") {
            onExpired();
            return;
          }
        }
      } catch {
        /* keep waiting */
      }
      // The claim lives 10 minutes on the server; stop polling with it.
      if (Date.now() - started > 10 * 60_000) {
        onExpired();
        return;
      }
      timer = setTimeout(poll, 3_000);
    };
    void poll();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [claimToken, onSignedIn, onExpired]);

  if (rejected) {
    return (
      <TgFrame>
        <h1 className="text-[1.375rem] font-bold">{t("claimRejectedTitle")}</h1>
        <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{t("claimRejectedBody")}</p>
        <Button size="cta" variant="outline" onClick={() => webApp()?.close()}>
          {t("closeApp")}
        </Button>
      </TgFrame>
    );
  }

  return (
    <TgFrame>
      <h1 className="text-[1.375rem] font-bold">{t("claimTitle")}</h1>
      <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
        {t("claimBody", { account })}
      </p>
      <div className="flex items-center gap-3 rounded-xl bg-raised px-4 py-3 text-[0.875rem] text-muted-foreground" role="status">
        <Loader2 className="size-4 flex-none animate-spin" aria-hidden="true" />
        {t("claimWaiting")}
      </div>
    </TgFrame>
  );
}
