import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, splitLocale } from "@/i18n/config";
import { PATH_HEADER, isAppPath } from "@/lib/routing";

/** Better Auth's default session cookie names (the `__Secure-` variant is used over HTTPS). */
const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIES.some((name) => request.cookies.has(name));
}

/**
 * Every page lives under `/sq/...` or `/en/...`. Unprefixed paths redirect to the
 * language the user explicitly chose (cookie), otherwise Albanian. The browser's
 * Accept-Language header is intentionally ignored.
 *
 * Requests to the app without a session cookie are sent to login early. This is
 * only a fast path: the dashboard layout and every API route verify the session
 * against the database.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Public published websites are unauthenticated and outside the locale tree.
  if (pathname === "/s" || pathname.startsWith("/s/")) {
    return NextResponse.next();
  }

  const { locale, path } = splitLocale(pathname);

  if (!locale) {
    const saved = request.cookies.get(LOCALE_COOKIE)?.value;
    const target = isLocale(saved) ? saved : DEFAULT_LOCALE;
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? `/${target}` : `/${target}${pathname}`;
    url.search = search;
    return NextResponse.redirect(url);
  }

  if (isAppPath(path) && !hasSessionCookie(request)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/login`;
    url.search = `?next=${encodeURIComponent(path + search)}`;
    return NextResponse.redirect(url);
  }

  const headers = new Headers(request.headers);
  headers.set(PATH_HEADER, path + search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
