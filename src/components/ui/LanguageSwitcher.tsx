"use client";

import * as React from "react";
import { usePathname as useNextPathname, useRouter } from "next/navigation";
import { LOCALES, LOCALE_NAMES, splitLocale, type Locale } from "@/i18n/config";
import { useLocale, useT } from "@/i18n/client";
import { rememberLocale } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * SQ / EN toggle. Switching keeps the current page, query string (e.g. the
 * active workspace tab) and hash, and only swaps the locale prefix: no data in
 * localStorage is read or written, and nothing is regenerated.
 */
export function LanguageSwitcher({ className, size = "sm" }: { className?: string; size?: "sm" | "md" }) {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  const { path } = splitLocale(useNextPathname() ?? "/");

  const hrefFor = (l: Locale) => (path === "/" ? `/${l}` : `/${l}${path}`);

  function select(event: React.MouseEvent<HTMLAnchorElement>, next: Locale) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    rememberLocale(next);
    if (next === locale) return;
    router.replace(`${hrefFor(next)}${window.location.search}${window.location.hash}`, { scroll: false });
  }

  return (
    <nav aria-label={t("language.switcherLabel")} className={cn("shrink-0", className)}>
      <ul className="flex items-center rounded-lg border border-border bg-surface p-0.5">
        {LOCALES.map((l) => {
          const current = l === locale;
          return (
            <li key={l}>
              <a
                href={hrefFor(l)}
                hrefLang={l}
                lang={l}
                onClick={(e) => select(e, l)}
                aria-current={current ? "true" : undefined}
                aria-label={LOCALE_NAMES[l]}
                title={LOCALE_NAMES[l]}
                className={cn(
                  "flex items-center justify-center rounded-md font-semibold uppercase tracking-wide transition-colors duration-150",
                  size === "sm" ? "h-8 min-w-9 px-2 text-[11.5px]" : "h-9 min-w-11 px-3 text-xs",
                  current ? "bg-brand-soft text-brand-2" : "text-ink-subtle hover:text-ink",
                )}
              >
                {l}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
