"use client";

/**
 * The single authenticated-fetch helper. All requests go to /api/* — Caddy
 * (or the Next.js rewrite in dev) proxies them to the NestJS API, so cookies
 * stay first-party.
 *
 * On a 401 it refreshes once and retries once. Two rules learned the hard way
 * (Phase 10, the "blank Portfolio on the phone" report):
 *  - ONE refresh at a time. A page fires several requests at once; when the
 *    access token has expired they all 401 together, and five parallel
 *    refreshes of the same rotating token used to race each other.
 *  - When the session is really gone (refresh refused), send the browser to
 *    sign in instead of leaving every screen on its loading skeleton forever.
 */
import { isTelegramSurface } from "@/lib/telegram/webapp";
import { announceExpired, tgAccessToken, tgRefresh } from "@/lib/telegram/session";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: unknown,
  ) {
    super(code);
  }
}

/** Requests that must never trigger the refresh-and-retry dance. */
const NO_RETRY = [
  "/auth/refresh",
  "/auth/telegram/session",
  "/auth/telegram/refresh",
  "/auth/telegram/signup",
  "/auth/telegram/link/password",
  "/auth/telegram/link/claim",
  "/auth/telegram/link/claim-status",
  "/auth/login",
  "/auth/register",
  "/auth/google/callback",
  "/auth/fayda/callback",
  "/auth/fayda/complete",
  "/auth/webauthn/login/verify",
];

/** Signed-out pages: a 401 there is expected, not a reason to redirect. */
const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/welcome",
  "/terms",
  "/privacy",
  "/copyright",
  "/forgot-password",
  "/reset-password",
  "/callback",
  "/auth/",
];

let refreshing: Promise<boolean> | null = null;
let redirecting = false;

/**
 * Credentials for a request to our own /api. The website uses its httpOnly
 * cookies; the Telegram Mini App is cookie-less and sends a bearer token
 * held in memory (lib/telegram/session.ts). Also used by the few callers
 * that cannot go through `api()` (multipart uploads, streams).
 */
export function authInit(): { credentials: RequestCredentials; headers: Record<string, string> } {
  if (isTelegramSurface()) {
    const token = tgAccessToken();
    return { credentials: "omit", headers: token ? { Authorization: `Bearer ${token}` } : {} };
  }
  return { credentials: "include", headers: {} };
}

async function rawFetch(path: string, init?: RequestInit): Promise<Response> {
  const auth = authInit();
  return fetch(`/api${path}`, {
    ...init,
    credentials: auth.credentials,
    headers: { "Content-Type": "application/json", ...auth.headers, ...init?.headers },
  });
}

/** Single-flight: every concurrent 401 waits on the same refresh. */
function refreshOnce(): Promise<boolean> {
  if (isTelegramSurface()) return tgRefresh();
  refreshing ??= rawFetch("/auth/refresh", { method: "POST" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      // Let the next expiry (15 min later) start a fresh refresh.
      setTimeout(() => {
        refreshing = null;
      }, 0);
    });
  return refreshing;
}

function sendToSignIn(): void {
  if (redirecting || typeof window === "undefined") return;
  // Inside Telegram there is no sign-in page to go to: fresh initData only
  // comes from reopening the Mini App, so the gate asks for exactly that.
  if (isTelegramSurface()) {
    announceExpired();
    return;
  }
  const here = window.location.pathname;
  if (PUBLIC_PREFIXES.some((p) => here === p || here.startsWith(p))) return;
  redirecting = true;
  const next = encodeURIComponent(here + window.location.search);
  window.location.assign(`/login?next=${next}&expired=1`);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await rawFetch(path, init);

  if (res.status === 401 && !NO_RETRY.includes(path)) {
    if (await refreshOnce()) {
      res = await rawFetch(path, init);
    }
    if (res.status === 401) sendToSignIn();
  }

  if (!res.ok) {
    let body: unknown = null;
    let code = `http_${res.status}`;
    try {
      body = await res.json();
      const message = (body as { message?: unknown })?.message;
      if (typeof message === "string") code = message;
    } catch {
      /* non-JSON body */
    }
    // The Nest throttler's message ("ThrottlerException: …") is not a
    // machine code — normalize any unmapped 429 so screens can localize it.
    if (res.status === 429 && !/^[a-z0-9_]+$/.test(code)) code = "rate_limited";
    throw new ApiError(res.status, code, body);
  }

  return (await res.json()) as T;
}
