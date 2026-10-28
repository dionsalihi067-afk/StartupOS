"use client";

import * as React from "react";
import { INTL_LOCALE, type Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { createTranslator, type Translator } from "@/i18n/translator";

interface I18nContextValue {
  locale: Locale;
  t: Translator;
}

const I18nContext = React.createContext<I18nContextValue | null>(null);

/** Supplies the active locale's messages, passed down from the server layout. */
export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ locale, t: createTranslator(locale, messages) }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nContextValue {
  const ctx = React.useContext(I18nContext);
  if (!ctx) throw new Error("useT/useLocale must be used inside <I18nProvider>.");
  return ctx;
}

export function useT(): Translator {
  return useI18n().t;
}

export function useLocale(): Locale {
  return useI18n().locale;
}

/** Locale-aware presentation of numbers and dates. Never changes the underlying values. */
export function useFormat() {
  const { locale, t } = useI18n();
  return React.useMemo(() => createFormat(locale, t), [locale, t]);
}

export function createFormat(locale: Locale, t: Translator) {
  const tag = INTL_LOCALE[locale];
  const dateFmt = new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", year: "numeric" });

  return {
    number(value: number, options?: Intl.NumberFormatOptions): string {
      return new Intl.NumberFormat(tag, options).format(value);
    },
    percent(value: number): string {
      return new Intl.NumberFormat(tag, { style: "percent", maximumFractionDigits: 0 }).format(value / 100);
    },
    seconds(ms: number): string {
      return new Intl.NumberFormat(tag, { style: "unit", unit: "second", unitDisplay: "narrow", maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(ms / 1000);
    },
    date(iso: string): string {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
    },
    /** "Today", "Yesterday", "3 days ago", then an absolute date. */
    relativeDate(iso: string): string {
      const days = daysSince(iso);
      if (days === null) return "—";
      if (days <= 0) return t("dates.today");
      if (days === 1) return t("dates.yesterday");
      if (days < 7) return t("dates.daysAgo", { count: days });
      return dateFmt.format(new Date(iso));
    },
    /** Full "Created …" phrase, so each language can word it naturally. */
    created(iso: string): string {
      const days = daysSince(iso);
      if (days === null) return "—";
      if (days <= 0) return t("dates.createdToday");
      if (days === 1) return t("dates.createdYesterday");
      if (days < 7) return t("dates.createdDaysAgo", { count: days });
      return t("dates.createdOn", { date: dateFmt.format(new Date(iso)) });
    },
  };
}

function daysSince(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
}

export type Format = ReturnType<typeof createFormat>;
