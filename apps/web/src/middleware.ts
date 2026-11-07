import { NextResponse, type NextRequest } from "next/server";
import { isTelegramHost } from "@/lib/surface-host";

const ACCESS_COOKIE = "alkeva_access";
const REFRESH_COOKIE = "alkeva_refresh";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/welcome",
  "/terms",
  "/privacy",
  "/copyright",
  "/auth/google/callback",
  // Fayda (eSignet) returns here — the redirect URI registered with Fayda.
  "/callback",
  // Telegram Mini App → external browser legs (Phase 11). Both are pages
  // that hold no session: /handoff carries a single-use ticket in its
  // fragment, /telegram/return only links back into Telegram.
  "/handoff",
  "/telegram/return",
];

/**
 * On the Mini App host the website's own entrances make no sense — Telegram
 * is the entrance — and the staff console must not exist at all.
 */
const TELEGRAM_REDIRECT_HOME = [
  "/login",
  "/register",
  "/welcome",
  "/forgot-password",
  "/reset-password",
  "/auth/google/callback",
  "/callback",
  "/handoff",
];

/** Public routes a signed-in visitor is bounced away from (back to the app). */
const AUTH_ONLY_WHEN_OUT = ["/login", "/register", "/welcome"];

/**
 * Cheap auth gate so a signed-out visitor never sees the app shell flash.
 *
 * It checks for the *refresh* cookie as well as the access cookie on purpose:
 * the access token lives 15 minutes and the refresh cookie 14 days, so a user
 * returning after lunch has no access cookie but is very much still signed in.
 * `lib/api.ts` performs the silent refresh on the first 401 — this middleware
 * only keeps the truly signed-out away from authenticated routes.
 *
 * A signed-out visit to "/" lands on the marketing page, not the login form —
 * the product now has a front door. Terms/privacy/reset stay reachable in
 * both states.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Telegram Mini App host: no cookies exist here (bearer sessions only), so
  // the cookie gate below does not apply — the client-side Telegram gate
  // signs the person in from initData before any screen renders.
  if (isTelegramHost((name) => req.headers.get(name))) {
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      return new NextResponse(null, { status: 404 });
    }
    if (TELEGRAM_REDIRECT_HOME.includes(pathname)) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const signedIn =
    req.cookies.has(ACCESS_COOKIE) || req.cookies.has(REFRESH_COOKIE);

  if (!signedIn && !PUBLIC_PATHS.includes(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = pathname === "/" ? "/welcome" : "/login";
    return NextResponse.redirect(url);
  }

  // lib/api.ts sends a browser whose session is really gone (refresh refused,
  // session revoked) to /login?expired=1. Its cookies still EXIST, so without
  // this the bounce below would send it straight back into the app — a loop.
  // Clear them and show the sign-in form.
  if (pathname === "/login" && req.nextUrl.searchParams.get("expired") === "1") {
    const res = NextResponse.next();
    res.cookies.delete(ACCESS_COOKIE);
    res.cookies.delete(REFRESH_COOKIE);
    return res;
  }

  if (signedIn && AUTH_ONLY_WHEN_OUT.includes(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Anything with a file extension is a static asset, never a route: the brand
  // PNGs and the generated icon.png/apple-icon.png live at the app root, and
  // without this a signed-out visitor's favicon request was answered with a
  // 307 to /welcome. Routes in this app never contain a dot.
  matcher: ["/((?!api|_next/static|_next/image|.*\\.).*)"],
};
