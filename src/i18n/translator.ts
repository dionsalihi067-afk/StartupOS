import * as React from "react";
import { INTL_LOCALE, type Locale } from "@/i18n/config";
import type { MessageKey, Messages } from "@/i18n/messages";

export type TranslationValues = Record<string, string | number>;

type PluralNode = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
type Node = string | PluralNode | { [key: string]: Node };

export interface Translator {
  (key: MessageKey, values?: TranslationValues): string;
  /** Like `t`, but placeholders may be React nodes (e.g. `<code>`). */
  rich(key: MessageKey, values: Record<string, React.ReactNode>): React.ReactNode;
  /** For keys built at runtime from data (e.g. an industry key). Returns `undefined` instead of warning when absent. */
  optional(key: string, values?: TranslationValues): string | undefined;
  locale: Locale;
}

function lookup(messages: Messages, key: string): Node | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in node) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return node as Node;
}

function isPlural(node: Node): node is PluralNode {
  return typeof node === "object" && typeof (node as PluralNode).other === "string";
}

function interpolate(template: string, values?: TranslationValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

function warnMissing(locale: Locale, key: string) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[i18n] Missing "${locale}" translation for "${key}".`);
  }
}

/**
 * Creates a translator for one locale. Missing keys fall back to the other
 * locale's message (and warn in development); if no locale has the key, the
 * key itself is rendered so the gap is visible rather than silently blank.
 */
export function createTranslator(locale: Locale, messages: Messages, fallback?: Messages): Translator {
  const pluralRules = new Intl.PluralRules(INTL_LOCALE[locale]);

  function resolve(key: string, values: TranslationValues | undefined, warn: boolean): string | undefined {
    let node = lookup(messages, key);
    if (node === undefined && fallback) {
      node = lookup(fallback, key);
      if (node !== undefined && warn) warnMissing(locale, key);
    }
    if (node === undefined) return undefined;
    if (typeof node === "string") return interpolate(node, values);
    if (isPlural(node)) {
      const count = typeof values?.count === "number" ? values.count : 0;
      const form = node[pluralRules.select(count)] ?? node.other;
      return interpolate(form, values);
    }
    return undefined;
  }

  const t = ((key: MessageKey, values?: TranslationValues) => {
    const out = resolve(key, values, true);
    if (out === undefined) {
      warnMissing(locale, key);
      return key;
    }
    return out;
  }) as Translator;

  t.optional = (key, values) => resolve(key, values, false);

  t.rich = (key, values) => {
    const template = resolve(key, undefined, true) ?? key;
    const parts = template.split(/(\{\w+\})/g).map((part) => {
      const name = /^\{(\w+)\}$/.exec(part)?.[1];
      return name && name in values ? values[name] : part;
    });
    return React.createElement(React.Fragment, null, ...parts);
  };

  t.locale = locale;
  return t;
}
