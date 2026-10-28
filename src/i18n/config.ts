/** Supported interface languages. Albanian is the primary product language. */
export const LOCALES = ["sq", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "sq";

/** Cookie holding the user's explicitly chosen language. Read by the middleware. */
export const LOCALE_COOKIE = "startupos.locale";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Native names, shown as-is in every interface language. */
export const LOCALE_NAMES: Record<Locale, string> = {
  sq: "Shqip",
  en: "English",
};

/** BCP 47 tags used for `Intl` formatting. */
export const INTL_LOCALE: Record<Locale, string> = {
  sq: "sq-AL",
  en: "en-US",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Splits `/sq/dashboard` into `{ locale: "sq", path: "/dashboard" }`. */
export function splitLocale(pathname: string): { locale: Locale | null; path: string } {
  const segment = pathname.split("/")[1];
  if (!isLocale(segment)) return { locale: null, path: pathname || "/" };
  const rest = pathname.slice(segment.length + 1);
  return { locale: segment, path: rest || "/" };
}

/** Prefixes an app-internal path with a locale. External URLs, hashes and already-prefixed paths are returned unchanged. */
export function localizePath(href: string, locale: Locale): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  if (splitLocale(href).locale) return href;
  return href === "/" ? `/${locale}` : `/${locale}${href}`;
}
