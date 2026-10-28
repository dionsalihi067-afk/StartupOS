"use client";

import * as React from "react";
import NextLink from "next/link";
import { usePathname as useNextPathname, useRouter as useNextRouter } from "next/navigation";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, localizePath, splitLocale, type Locale } from "@/i18n/config";
import { useLocale } from "@/i18n/client";

/** `next/link` that keeps the current locale. Pass app paths without a locale, e.g. `/dashboard/brand`. */
export const Link = React.forwardRef<HTMLAnchorElement, React.ComponentProps<typeof NextLink>>(function Link(
  { href, ...props },
  ref,
) {
  const locale = useLocale();
  const localized = typeof href === "string" ? localizePath(href, locale) : href;
  return <NextLink ref={ref} href={localized} {...props} />;
});

/** Current path without the locale prefix, so route matching stays language-independent. */
export function usePathname(): string {
  return splitLocale(useNextPathname() ?? "/").path;
}

/** Router whose `push`/`replace` keep the current locale. */
export function useRouter() {
  const router = useNextRouter();
  const locale = useLocale();
  return React.useMemo(
    () => ({
      ...router,
      push: (href: string, options?: Parameters<typeof router.push>[1]) => router.push(localizePath(href, locale), options),
      replace: (href: string, options?: Parameters<typeof router.replace>[1]) =>
        router.replace(localizePath(href, locale), options),
    }),
    [router, locale],
  );
}

/** Persists an explicit language choice so the next visit to `/` opens in that language. */
export function rememberLocale(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}
