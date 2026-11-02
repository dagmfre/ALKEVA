import type { Request, Response } from "express";
import type { Env } from "@alkeva/shared";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "./auth.guard.js";
import type { ClientContext, TokenPair } from "./sessions.service.js";

/** One cookie shape for every way of signing in (password, Google, Fayda, passkey). */
function cookieOpts(env: Env) {
  const secure = env.WEB_ORIGIN.startsWith("https://");
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/" };
}

export function setSessionCookies(res: Response, env: Env, tokens: TokenPair): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...cookieOpts(env),
    maxAge: env.ACCESS_TOKEN_TTL_SEC * 1000,
  });
  // Path stays "/" — the browser reaches the API through the /api proxy, so a
  // narrower path would strand the cookie.
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...cookieOpts(env),
    maxAge: env.REFRESH_TOKEN_TTL_SEC * 1000,
  });
}

export function clearSessionCookies(res: Response, env: Env): void {
  res.clearCookie(ACCESS_COOKIE, cookieOpts(env));
  res.clearCookie(REFRESH_COOKIE, cookieOpts(env));
}

/** Short-lived cookie that ties an OIDC round-trip to the browser that started it. */
export function setFlowCookie(res: Response, env: Env, name: string, value: string, maxAgeSec: number): void {
  res.cookie(name, value, { ...cookieOpts(env), maxAge: maxAgeSec * 1000 });
}

export function clearFlowCookie(res: Response, env: Env, name: string): void {
  res.clearCookie(name, cookieOpts(env));
}

export function clientContext(req: Request): ClientContext {
  const ua = req.headers["user-agent"];
  return {
    userAgent: typeof ua === "string" ? ua : null,
    // `trust proxy 1` (main.ts) makes this the client address behind Caddy.
    ip: req.ip ?? null,
  };
}
