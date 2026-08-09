import { NextResponse, type NextRequest } from "next/server";

const ACCESS_COOKIE = "alkeva_access";
const REFRESH_COOKIE = "alkeva_refresh";

const PUBLIC_PATHS = ["/login", "/register"];

/**
 * Cheap auth gate so a signed-out visitor never sees the app shell flash.
 *
 * It checks for the *refresh* cookie as well as the access cookie on purpose:
 * the access token lives 15 minutes and the refresh cookie 14 days, so a user
 * returning after lunch has no access cookie but is very much still signed in.
 * `lib/api.ts` performs the silent refresh on the first 401 — this middleware
 * only keeps the truly signed-out away from authenticated routes.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const signedIn =
    req.cookies.has(ACCESS_COOKIE) || req.cookies.has(REFRESH_COOKIE);

  if (!signedIn && !PUBLIC_PATHS.includes(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (signedIn && PUBLIC_PATHS.includes(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
