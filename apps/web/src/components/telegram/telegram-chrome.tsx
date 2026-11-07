"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { atLeast, webApp } from "@/lib/telegram/webapp";

/** Fired when the Mini App comes back to the foreground (e.g. after Chapa). */
export const TG_RESUME_EVENT = "alkeva:resume";

/** The bottom bar's destinations — no Back button on these. */
const ROOTS = new Set(["/", "/trade", "/portfolio", "/history", "/wallet"]);

/**
 * Telegram's own controls, driven by the app's route: the native Back button
 * on any screen below a tab, and a resume signal when the person returns to
 * the Mini App (from the phone's browser, after a Chapa payment or a Fayda
 * check) so balances and pending deposits are re-read at once.
 */
export function TelegramChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const app = webApp();
    if (!app || !atLeast(app, "6.1")) return;
    const back = () => router.back();
    if (ROOTS.has(pathname)) {
      app.BackButton.hide();
      return;
    }
    app.BackButton.show();
    app.BackButton.onClick(back);
    return () => app.BackButton.offClick(back);
  }, [pathname, router]);

  useEffect(() => {
    const app = webApp();
    const resume = () => window.dispatchEvent(new Event(TG_RESUME_EVENT));
    const onVisible = () => {
      if (document.visibilityState === "visible") resume();
    };
    // `activated` (Bot API 8.0) where the client has it; visibility elsewhere.
    if (app && atLeast(app, "8.0")) app.onEvent("activated", resume);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (app && atLeast(app, "8.0")) app.offEvent("activated", resume);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return <>{children}</>;
}
