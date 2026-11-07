"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import type { ProvidersResponse } from "@alkeva/shared";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Where Chapa sends the phone's browser after a deposit started inside the
 * Telegram Mini App. This page holds no session and asks for none; it reads
 * only the public list of sign-in providers (to build the t.me link) and
 * credits nothing — the deposit is confirmed server-side, by Chapa's webhook
 * and our verify call, whatever happens here. Its one job is the way back.
 */
export function TelegramReturnScreen() {
  const t = useTranslations("telegram");
  const params = useSearchParams();
  const [link, setLink] = useState<string | null>(null);

  useEffect(() => {
    const id = params.get("id") ?? "";
    fetch("/api/auth/providers", { credentials: "omit" })
      .then((r) => (r.ok ? (r.json() as Promise<ProvidersResponse>) : null))
      .then((p) => {
        const tg = p?.telegram;
        if (!tg?.botUsername || !tg.appShortName) return;
        const start = UUID.test(id) ? `?startapp=deposit-${id}` : "";
        setLink(`https://t.me/${tg.botUsername}/${tg.appShortName}${start}`);
      })
      .catch(() => undefined);
  }, [params]);

  return (
    <AuthShell>
      <div className="flex flex-col gap-5">
        <h1 className="text-[1.5rem] leading-tight font-extrabold">{t("returnTitle")}</h1>
        <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{t("returnBody")}</p>
        {link ? (
          <Button size="cta" asChild>
            <a href={link} rel="noopener noreferrer">
              <Send className="size-4" aria-hidden="true" />
              {t("backToTelegram")}
            </a>
          </Button>
        ) : null}
      </div>
    </AuthShell>
  );
}
