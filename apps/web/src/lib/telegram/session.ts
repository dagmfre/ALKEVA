"use client";

import type { TelegramTokens } from "@alkeva/shared";

/**
 * The Mini App's session — cookie-less by design.
 *
 *  - The access token lives in memory only (this module), never in storage.
 *  - The refresh token lives in sessionStorage: it belongs to this one
 *    webview and disappears when the Mini App is closed. Telegram's own
 *    script keeps the launch parameters in sessionStorage for the same
 *    reason — a reload inside the Mini App must not lose the session.
 *  - The API only rotates it on /auth/telegram/refresh, and refuses it on
 *    the cookie path (and a web cookie on this one).
 *
 * When the session cannot be recovered the app does not fall back to any
 * weaker path: it asks the person to reopen ALKEVA from Telegram, which
 * produces fresh, single-use initData.
 */
const RT_KEY = "alkeva.tg.rt";
export const TG_EXPIRED_EVENT = "alkeva:tg-expired";

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

export function tgAccessToken(): string | null {
  return accessToken;
}

export function storedRefreshToken(): string | null {
  try {
    return sessionStorage.getItem(RT_KEY);
  } catch {
    return null;
  }
}

export function setTgTokens(tokens: TelegramTokens): void {
  accessToken = tokens.accessToken;
  try {
    sessionStorage.setItem(RT_KEY, tokens.refreshToken);
  } catch {
    /* storage blocked: the session lasts until this page reloads */
  }
}

export function clearTgTokens(): void {
  accessToken = null;
  try {
    sessionStorage.removeItem(RT_KEY);
  } catch {
    /* ignore */
  }
}

/** Single-flight refresh. True when a new access token is in memory. */
export function tgRefresh(): Promise<boolean> {
  refreshing ??= doRefresh().finally(() => {
    setTimeout(() => {
      refreshing = null;
    }, 0);
  });
  return refreshing;
}

async function doRefresh(attempt = 0): Promise<boolean> {
  const refreshToken = storedRefreshToken();
  if (!refreshToken) return false;
  let res: Response;
  try {
    res = await fetch("/api/auth/telegram/refresh", {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    return false;
  }
  if (res.status === 409 && attempt === 0) {
    // Another refresh of this same token won a moment ago; the winner stored
    // the new token. Re-read and try once.
    return storedRefreshToken() !== refreshToken ? doRefresh(1) : false;
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) clearTgTokens();
    return false;
  }
  const body = (await res.json()) as { tokens: TelegramTokens };
  setTgTokens(body.tokens);
  return true;
}

/** Session unrecoverable: the gate shows "reopen from Telegram". */
export function announceExpired(): void {
  clearTgTokens();
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TG_EXPIRED_EVENT));
}

/** A menu asked to sign out: the gate shows the sign-out choices. */
export const TG_SIGNOUT_EVENT = "alkeva:tg-signout";

export function requestTelegramSignOut(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TG_SIGNOUT_EVENT));
}
