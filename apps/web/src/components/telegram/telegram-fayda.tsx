"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheck, ExternalLink, ShieldCheck } from "lucide-react";
import type { TelegramHandoffStartResponse, TelegramHandoffStatus } from "@alkeva/shared";

import { SystemBanner } from "@/components/system/banner";
import { TG_RESUME_EVENT } from "@/components/telegram/telegram-chrome";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { api, ApiError } from "@/lib/api";
import { haptic, mainSiteHost, openExternal } from "@/lib/telegram/webapp";

/** The handoff this webview started, so a reload or a return still finds it. */
const HANDOFF_KEY = "alkeva.tg.handoff";

function readHandoff(): string | null {
  try {
    return sessionStorage.getItem(HANDOFF_KEY);
  } catch {
    return null;
  }
}
function writeHandoff(id: string | null): void {
  try {
    if (id) sessionStorage.setItem(HANDOFF_KEY, id);
    else sessionStorage.removeItem(HANDOFF_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * The Fayda identity check from inside Telegram. eSignet refuses to run in an
 * embedded webview or a frame, so:
 *
 *   1. "Verify with Fayda" creates a handoff (a single-use, 120-second ticket).
 *   2. "Continue to Fayda" opens allkeva.com/handoff#t=… in the phone's
 *      browser. The ticket rides the fragment and never reaches a log; the
 *      browser is given no ALKEVA session.
 *   3. After Fayda, the browser says "return to Telegram". Back here, the
 *      verified legal name is shown, and NOTHING is attached to the account
 *      until the owner taps Confirm — so a ticket that leaked commits nothing.
 */
export function TelegramFaydaPanel({ onDone }: { onDone: () => void }) {
  const t = useTranslations("telegram");
  const tk = useTranslations("kyc");
  const tc = useTranslations("common");
  const [handoff, setHandoff] = useState<{ id: string; url: string | null } | null>(() => {
    const id = readHandoff();
    return id ? { id, url: null } : null;
  });
  const [status, setStatus] = useState<TelegramHandoffStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    if (!handoff) return;
    try {
      const s = await api<TelegramHandoffStatus>(`/telegram/handoff/${handoff.id}`);
      setStatus(s);
      if (s.status === "expired") {
        writeHandoff(null);
        setHandoff(null);
      }
      if (s.status === "done") {
        writeHandoff(null);
        onDone();
      }
    } catch {
      /* keep the last known state */
    }
  }, [handoff, onDone]);

  useEffect(() => {
    void check();
    window.addEventListener(TG_RESUME_EVENT, check);
    return () => window.removeEventListener(TG_RESUME_EVENT, check);
  }, [check]);

  async function start() {
    setError(null);
    setBusy(true);
    try {
      const h = await api<TelegramHandoffStartResponse>("/telegram/handoff", {
        method: "POST",
        body: JSON.stringify({ purpose: "fayda_link" }),
      });
      writeHandoff(h.id);
      setHandoff({ id: h.id, url: h.url });
      setStatus({ status: "waiting" });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      setError(code === "fayda_already_verified" ? tk("faydaAlready") : tk("faydaUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  async function decide(confirm: boolean) {
    if (!handoff) return;
    setBusy(true);
    try {
      const s = await api<TelegramHandoffStatus>(
        `/telegram/handoff/${handoff.id}/${confirm ? "confirm" : "discard"}`,
        { method: "POST" },
      );
      writeHandoff(null);
      setHandoff(null);
      setStatus(null);
      if (confirm && s.status === "done") {
        haptic("success");
        onDone();
      }
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      setError(code === "fayda_linked_elsewhere" ? t("faydaElsewhere") : tk("faydaUnavailable"));
      haptic("error");
    } finally {
      setBusy(false);
    }
  }

  const awaiting = status?.status === "awaiting_confirmation" ? status : null;

  return (
    <Panel aria-label={tk("faydaTitle")}>
      <PanelHeader title={tk("faydaTitle")} hint={tk("faydaHint")} />
      <div className="flex flex-1 flex-col gap-4 px-[1.125rem] pb-[1.125rem]">
        {error ? <SystemBanner tone="critical">{error}</SystemBanner> : null}

        {awaiting ? (
          <>
            <div className="flex flex-col gap-1 rounded-xl bg-raised p-4">
              <span className="flex items-center gap-1.5 text-[0.8125rem] text-gain">
                <BadgeCheck className="size-4" aria-hidden="true" />
                {t("faydaReadBack")}
              </span>
              <span className="text-[1.0625rem] font-bold">{awaiting.legalName}</span>
              {awaiting.birthYear ? (
                <span className="tnum text-[0.8125rem] text-muted-foreground">
                  {t("faydaBorn", { year: awaiting.birthYear })}
                </span>
              ) : null}
            </div>
            <p className="text-[0.875rem] leading-relaxed text-muted-foreground">{t("faydaConfirmBody")}</p>
            <Button size="cta" onClick={() => void decide(true)} disabled={busy}>
              {busy ? tc("loading") : t("faydaConfirm")}
            </Button>
            <Button size="cta" variant="ghost" onClick={() => void decide(false)} disabled={busy}>
              {t("faydaNotMe")}
            </Button>
          </>
        ) : handoff ? (
          <>
            <p className="text-[0.875rem] leading-relaxed text-muted-foreground">
              {handoff.url ? t("faydaHandoffReady") : t("faydaHandoffWaiting")}
            </p>
            {handoff.url ? (
              <Button
                size="cta"
                onClick={() => {
                  // Only ever our own main site; Telegram opens it from this tap.
                  if (!openExternal(handoff.url!, [mainSiteHost()])) setError(tk("faydaUnavailable"));
                }}
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                {t("faydaContinue")}
              </Button>
            ) : (
              <Button size="cta" variant="outline" onClick={() => void check()}>
                {t("faydaCheck")}
              </Button>
            )}
            <Button
              size="cta"
              variant="ghost"
              onClick={() => {
                writeHandoff(null);
                setHandoff(null);
                setStatus(null);
              }}
            >
              {t("faydaStartOver")}
            </Button>
          </>
        ) : (
          <>
            <ol className="flex flex-col gap-3">
              {(["faydaTgStep1", "faydaTgStep2", "faydaTgStep3"] as const).map((k, i) => (
                <li key={k} className="flex items-start gap-3 text-[0.875rem]">
                  <span className="tnum grid size-6 flex-none place-items-center rounded-full bg-gold-400/12 text-[0.75rem] font-bold text-gold-400">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed text-muted-foreground">{t(k)}</span>
                </li>
              ))}
            </ol>
            <Button size="cta" onClick={() => void start()} disabled={busy} className="mt-auto">
              <ShieldCheck className="size-5" aria-hidden="true" />
              {busy ? tc("loading") : tk("faydaCta")}
            </Button>
          </>
        )}
        <p className="text-[0.75rem] leading-relaxed text-subtle">{tk("faydaPrivacy")}</p>
      </div>
    </Panel>
  );
}
