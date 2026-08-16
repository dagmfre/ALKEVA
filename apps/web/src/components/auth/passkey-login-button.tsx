"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

/**
 * Usernameless passkey login. Rendered only when the API reports WebAuthn
 * configured AND the browser exposes PublicKeyCredential — otherwise it
 * simply doesn't exist, per the degrade-not-crash pattern.
 */
export function PasskeyLoginButton({ enabled }: { enabled: boolean }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "PublicKeyCredential" in window);
  }, []);

  if (!enabled || !supported) return null;

  async function signIn() {
    setFailed(false);
    setBusy(true);
    try {
      const { sessionId, options } = await api<{
        sessionId: string;
        options: PublicKeyCredentialRequestOptionsJSON;
      }>("/auth/webauthn/login/options", { method: "POST" });
      const response = await startAuthentication({ optionsJSON: options });
      await api("/auth/webauthn/login/verify", {
        method: "POST",
        body: JSON.stringify({ sessionId, response }),
      });
      router.replace("/");
      router.refresh();
    } catch {
      // Covers user cancellation and real failures alike — one quiet line.
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button type="button" variant="outline" size="cta" disabled={busy} onClick={() => void signIn()}>
        <span aria-hidden="true">◆</span>
        {t("passkeyButton")}
      </Button>
      {failed && (
        <p className="text-center text-[0.8125rem] text-loss">{t("passkeyFailed")}</p>
      )}
    </div>
  );
}
