import { NextResponse, type NextRequest } from "next/server";

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
  "/auth/google/callback",
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
  const signedIn =
    req.cookies.has(ACCESS_COOKIE) || req.cookies.has(REFRESH_COOKIE);

  if (!signedIn && !PUBLIC_PATHS.includes(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = pathname === "/" ? "/welcome" : "/login";
    return NextResponse.redirect(url);
  }

  if (signedIn && AUTH_ONLY_WHEN_OUT.includes(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
