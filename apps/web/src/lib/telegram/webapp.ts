"use client";

/**
 * The slice of `window.Telegram.WebApp` (telegram-web-app.js) this app uses.
 * Every optional method is version-gated: an older Telegram client simply
 * goes without the nicety, never throws.
 *
 * The Telegram surface is decided by the SERVER (Caddy marks requests to the
 * Mini App host; the root layout writes `data-surface="telegram"` on <html>).
 * A URL fragment or query string can never switch a normal browser into it.
 */
export interface TgWebApp {
  initData: string;
  initDataUnsafe: {
    start_param?: string;
    user?: { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string };
  };
  version: string;
  platform: string;
  isVersionAtLeast(version: string): boolean;
  ready(): void;
  expand(): void;
  close(): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor?(color: string): void;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation?(): void;
  disableClosingConfirmation?(): void;
  requestWriteAccess?(callback?: (granted: boolean) => void): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
    selectionChanged(): void;
  };
  onEvent(event: string, cb: () => void): void;
  offEvent(event: string, cb: () => void): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export function isTelegramSurface(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.surface === "telegram";
}

/** The WebApp object — only on the Telegram surface, and only when Telegram launched us. */
export function webApp(): TgWebApp | null {
  if (!isTelegramSurface() || typeof window === "undefined") return null;
  const app = window.Telegram?.WebApp;
  return app && typeof app.initData === "string" && app.initData.length > 0 ? app : null;
}

export function atLeast(app: TgWebApp, version: string): boolean {
  try {
    return app.isVersionAtLeast(version);
  } catch {
    return false;
  }
}

/** The app's ground colour, so Telegram's chrome and our page are one surface. */
const GROUND = "#060607";

export function prepareChrome(app: TgWebApp): void {
  try {
    app.ready();
    app.expand();
    if (atLeast(app, "6.1")) {
      app.setHeaderColor(GROUND);
      app.setBackgroundColor(GROUND);
    }
    if (atLeast(app, "7.10")) app.setBottomBarColor?.(GROUND);
    // Charts and lists scroll vertically; a swipe there must not close the app.
    if (atLeast(app, "7.7")) app.disableVerticalSwipes?.();
  } catch {
    /* chrome is cosmetic */
  }
}

/**
 * Leave the Mini App for the phone's browser (Chapa checkout, Fayda). Only
 * https URLs on an allow-listed host; anything else is refused outright.
 * Must be called from a user gesture (Telegram requires it).
 */
export function openExternal(url: string, allowedHosts: readonly string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const devHttp =
    process.env.NODE_ENV !== "production" && parsed.protocol === "http:" && parsed.hostname === "localhost";
  if ((parsed.protocol !== "https:" && !devHttp) || !allowedHosts.includes(parsed.hostname)) return false;
  const app = webApp();
  if (app) app.openLink(parsed.toString());
  else window.open(parsed.toString(), "_blank", "noopener,noreferrer");
  return true;
}

export function haptic(kind: "success" | "error" | "warning"): void {
  try {
    const app = webApp();
    if (app && atLeast(app, "6.1")) app.HapticFeedback?.notificationOccurred(kind);
  } catch {
    /* optional */
  }
}

/** Ask Telegram to confirm before the Mini App is closed (a live quote, a form). */
export function setClosingConfirmation(on: boolean): void {
  const app = webApp();
  if (!app || !atLeast(app, "6.2")) return;
  try {
    if (on) app.enableClosingConfirmation?.();
    else app.disableClosingConfirmation?.();
  } catch {
    /* optional */
  }
}

/** The main site's host, seen from the Mini App host (tg.allkeva.com → allkeva.com). */
export function mainSiteHost(): string {
  return typeof location === "undefined" ? "" : location.hostname.replace(/^tg\./, "");
}
