import en from "@/messages/en.json";
import sq from "@/messages/sq.json";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";

/** English defines the message shape; every other locale must provide the same keys. */
export type Messages = typeof en;

// Compile-time completeness check: a key missing from sq.json is a type error here.
const albanian: Messages = sq;

const MESSAGES: Record<Locale, Messages> = { sq: albanian, en };

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}

/** Messages used when a key is missing from the requested locale. */
export function getFallbackMessages(locale: Locale): Messages {
  return locale === DEFAULT_LOCALE ? MESSAGES.en : MESSAGES[DEFAULT_LOCALE];
}

type PluralLeaf = { other: string };

/** Dot-separated paths to every translatable message, e.g. `"navigation.brand"`. */
type Paths<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : T[K] extends PluralLeaf
      ? `${Prefix}${K}`
      : Paths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Paths<Messages>;
