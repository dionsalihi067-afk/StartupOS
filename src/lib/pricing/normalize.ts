import type { BillingBasis, Cadence, CurrencyCode, PriceQualifier } from "@/lib/pricing/model";

/**
 * Deterministic price normalization. Machine-readable fields are added only
 * when the text states them; everything else stays null. No currency is
 * inferred from location and no amount is converted.
 */

export interface CurrencyRead {
  currency: CurrencyCode | null;
  /** Set only when the marker does not identify a single currency (a bare "$"). */
  currencySymbol: string | null;
}

const CURRENCY_MARKERS: readonly [RegExp, CurrencyCode][] = [
  [/US\$|\bUSD\b/i, "USD"],
  [/€|\bEUR\b|\beuros?\b/i, "EUR"],
  [/£|\bGBP\b/i, "GBP"],
  [/\bCHF\b/i, "CHF"],
  // "ALL" is matched case-sensitively: lowercase "all" is an ordinary word.
  [/\bALL\b|\blek[ëe]?\b/, "ALL"],
];

/** The single currency a text names; several different currencies → none. */
export function readCurrency(text: string): CurrencyRead {
  const found = [...new Set(CURRENCY_MARKERS.filter(([re]) => re.test(text)).map(([, code]) => code))];
  if (found.length === 1) return { currency: found[0]!, currencySymbol: null };
  if (found.length === 0 && text.includes("$")) return { currency: null, currencySymbol: "$" };
  return { currency: null, currencySymbol: null };
}

const NUMBER_TOKEN = /\d{1,6}(?:[.,]\d{1,3})*/g;

/**
 * "1.500" / "1,500" → 1500 (a single separator before exactly three digits is
 * a thousands separator); "3,50" / "3.50" → 3.5; "1.234,50" → 1234.5.
 * Returns null for token shapes that cannot be read unambiguously.
 */
export function parseAmount(token: string): number | null {
  const separators = token.match(/[.,]/g) ?? [];
  let value: number;
  if (separators.length === 0) {
    value = Number(token);
  } else {
    const last = Math.max(token.lastIndexOf("."), token.lastIndexOf(","));
    const decimals = token.length - last - 1;
    if (new Set(separators).size === 2) {
      value = Number(`${token.slice(0, last).replace(/[.,]/g, "")}.${token.slice(last + 1)}`);
    } else if (decimals === 3) {
      value = Number(token.replace(/[.,]/g, ""));
    } else if (separators.length === 1) {
      value = Number(token.replace(",", "."));
    } else {
      return null;
    }
  }
  return Number.isFinite(value) && value > 0 ? value : null;
}

const CADENCE_WORDS: Record<string, Cadence> = {
  month: "month", mo: "month",
  year: "year", yr: "year",
  week: "week",
  day: "day",
  hour: "hour", hr: "hour",
  session: "session",
  person: "person",
  user: "user",
  night: "night",
};
const CADENCE_SUFFIX = /(?:\/|\bper)\s?([a-z]+)\s*$/i;
const RECURRING: readonly Cadence[] = ["month", "year", "week"];
const ONE_TIME_AFTER = /^\s*(?:one[- ]time|once|lifetime)\b/i;
const FROM_BEFORE = /(?:\bfrom|\bstarting (?:at|from)|\bstarts at|\bas low as|\bnga|\bduke filluar nga)\s*$/i;

/** The cadence stated directly after the amount ("€29/month", "€8 per day"); null when none is stated. */
export function readCadence(original: string): Cadence | null {
  const word = CADENCE_SUFFIX.exec(original)?.[1]?.toLowerCase();
  return word ? (CADENCE_WORDS[word] ?? null) : null;
}

export interface NormalizedPrice {
  original: string;
  excerpt: string;
  value: number | null;
  currency: CurrencyCode | null;
  currencySymbol: string | null;
  cadence: Cadence | null;
  billing: BillingBasis;
  qualifier: PriceQualifier;
}

/** Normalizes one observed price; `original` and `excerpt` are kept verbatim. */
export function normalizePrice(original: string, excerpt: string): NormalizedPrice {
  const cadence = readCadence(original);
  const head = original.split(/\s?\/|\s+per\b/i)[0]!.trim();
  const at = excerpt.indexOf(head);
  const before = at >= 0 ? excerpt.slice(0, at) : "";
  const after = at >= 0 ? excerpt.slice(at + original.length) : "";
  const token = head.match(NUMBER_TOKEN)?.[0];

  let billing: BillingBasis = "unspecified";
  if (cadence) billing = RECURRING.includes(cadence) ? "recurring" : "perUnit";
  else if (ONE_TIME_AFTER.test(after)) billing = "oneTime";

  return {
    original,
    excerpt,
    value: token ? parseAmount(token) : null,
    ...readCurrency(head),
    cadence,
    billing,
    qualifier: FROM_BEFORE.test(before) ? "from" : "exact",
  };
}

/* ------------------------- Owner's expected price ------------------------- */

/** The owner's own expected price (discovery answer). Context for the strategy, never market evidence. */
export interface OwnerPriceRange {
  text: string;
  min: number;
  max: number;
  currency: CurrencyCode | null;
  currencySymbol: string | null;
  cadence: Cadence | null;
  /** The owner expressed a percentage (e.g. a commission rate). */
  percent: boolean;
}

const OWNER_CADENCE: readonly [RegExp, Cadence][] = [
  [/\/\s?(?:month|mo)\b|\bper month\b|\bmonthly\b|\bn[ëe] muaj\b|\bmujor/i, "month"],
  [/\/\s?(?:year|yr)\b|\bper year\b|\byearly\b|\bannual(?:ly)?\b|\bn[ëe] vit\b|\bvjetor/i, "year"],
  [/\/\s?week\b|\bper week\b|\bweekly\b|\bn[ëe] jav[ëe]\b/i, "week"],
];

const OWNER_RANGE = /(\d{1,6}(?:[.,]\d{1,3})*)\s*(?:-|–|—|to|deri(?: n[ëe])?)\s*\D{0,4}?(\d{1,6}(?:[.,]\d{1,3})*)/i;

/** "€20–40" → 20..40; "around €30" → 30..30. Two numbers count as a range only when joined by a range separator. */
export function parseOwnerPriceRange(text: string): OwnerPriceRange | null {
  const range = OWNER_RANGE.exec(text);
  const tokens = range ? [range[1]!, range[2]!] : (text.match(NUMBER_TOKEN) ?? []).slice(0, 1);
  const numbers = tokens.map(parseAmount).filter((v): v is number => v !== null);
  if (numbers.length === 0 || numbers.length !== tokens.length) return null;
  return {
    text,
    min: Math.min(...numbers),
    max: Math.max(...numbers),
    ...readCurrency(text),
    cadence: OWNER_CADENCE.find(([re]) => re.test(text))?.[1] ?? null,
    percent: text.includes("%"),
  };
}

/* -------------------------------- Display -------------------------------- */

const PREFIX: Partial<Record<CurrencyCode, string>> = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF " };

/** Formats a computed (recommended) amount in the given currency; without a currency the bare amount is shown. */
export function formatPrice(value: number, currency: CurrencyCode | null, currencySymbol: string | null): string {
  const amount = Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (currency === "ALL") return `${amount} ALL`;
  if (currency) return `${PREFIX[currency]}${amount}`;
  return currencySymbol ? `${currencySymbol}${amount}` : amount;
}
