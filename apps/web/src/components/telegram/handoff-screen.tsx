"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { SystemBanner } from "@/components/system/banner";

/** The ticket is single-use: a double-run effect (strict mode) must not spend it twice. */
let consumed = false;

/**
 * The phone's-browser half of a Telegram handoff (allkeva.com/handoff#t=…).
 * The ticket arrives in the URL FRAGMENT, which no browser sends to a
 * server, so it is in no access log and no Referer. It is read, wiped from
 * the address bar at once, and spent on one request whose only power is to
 * start the Fayda identity flow (#t=) or a Google sign-in (#g=) for the
 * person who asked from Telegram. This browser receives no ALKEVA session —
 * only the identity provider's browser-binding cookie.
 */
export function HandoffScreen() {
  const t = useTranslations("telegram");
  const [problem, setProblem] = useState(false);

  useEffect(() => {
    if (consumed) return;
    consumed = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    // #t= starts the Fayda identity check, #g= a Google sign-in for the Mini App.
    const google = fragment.has("g");
    const ticket = (google ? fragment.get("g") : fragment.get("t")) ?? "";
    // Gone from the address bar (and from any later Referer) before anything else.
    window.history.replaceState(null, "", window.location.pathname);
    if (!/^[A-Za-z0-9_-]{40,64}$/.test(ticket)) {
      setProblem(true);
      return;
    }
    void fetch(google ? "/api/auth/telegram/google/consume" : "/api/telegram/handoff/consume", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const { url } = (await res.json()) as { url: string };
        // Only ever to an https identity provider URL the server built.
        if (!/^https:\/\//.test(url)) throw new Error("bad url");
        window.location.replace(url);
      })
      .catch(() => setProblem(true));
  }, []);

  return (
    <AuthShell>
      <div className="flex flex-col gap-5">
        {problem ? (
          <>
            <h1 className="text-[1.5rem] leading-tight font-extrabold">{t("handoffExpiredTitle")}</h1>
            <SystemBanner tone="critical">{t("handoffExpiredBody")}</SystemBanner>
          </>
        ) : (
          <div className="flex items-center gap-3 text-muted-foreground" role="status">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            <span className="text-[0.9375rem]">{t("handoffOpening")}</span>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
