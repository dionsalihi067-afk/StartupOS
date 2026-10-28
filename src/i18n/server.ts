import "server-only";
import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";
import { getFallbackMessages, getMessages } from "@/i18n/messages";
import { createTranslator, type Translator } from "@/i18n/translator";

/** Validates the `[locale]` route segment, rendering 404 for anything other than `sq`/`en`. */
export async function resolveLocale(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return locale;
}

export function getTranslator(locale: Locale): Translator {
  return createTranslator(locale, getMessages(locale), getFallbackMessages(locale));
}
