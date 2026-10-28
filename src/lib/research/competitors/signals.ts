import { COMPETITOR_LIMITS } from "@/lib/research/limits";
import type { ResearchContext } from "@/lib/research/model";

/**
 * Deterministic text signals read from evidence. Matching is accent- and
 * case-insensitive and tolerant of simple inflections ("coffee"/"coffees",
 * "Tirana"/"Tiranë"); nothing here guesses at meaning.
 */

/** Words too generic to establish that two businesses offer the same thing. */
const GENERIC_TERMS = new Set([
  "and", "for", "the", "with", "from", "your", "our", "new", "best", "top", "local", "small", "online",
  "shop", "store", "company", "companies", "business", "businesses", "service", "services", "agency",
  "platform", "app", "solution", "solutions", "center", "centre", "studio", "group", "brand", "product", "products",
]);

export function foldText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function tokens(text: string): string[] {
  return foldText(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function distinct(words: string[]): string[] {
  return [...new Set(words)];
}

/** Distinctive words of a phrase; falls back to all words when every word is generic. */
function distinctiveWords(phrase: string | undefined): string[] {
  const words = tokens(phrase ?? "").filter((w) => w.length >= 3);
  const specific = words.filter((w) => !GENERIC_TERMS.has(w));
  return distinct(specific.length > 0 ? specific : words);
}

/** Terms describing what the business offers (main offer first, then the idea). */
export function offerTerms(context: ResearchContext): string[] {
  return distinct([...distinctiveWords(context.offer), ...distinctiveWords(context.idea)]);
}

/** Terms identifying the business's market location (e.g. "Prishtinë, Kosovo" → ["prishtine", "kosovo"]). */
export function locationTerms(context: ResearchContext): string[] {
  return distinctiveWords(context.location);
}

function termMatches(term: string, words: readonly string[]): boolean {
  if (term.length <= 4) return words.includes(term);
  const stem = term.slice(0, Math.max(5, term.length - 2));
  return words.some((w) => w === term || w.startsWith(stem));
}

/** The subset of `terms` present in `text`, in `terms` order. */
export function matchTerms(terms: readonly string[], text: string): string[] {
  const words = tokens(text);
  return terms.filter((t) => termMatches(t, words));
}

/* -------------------------------- Pricing -------------------------------- */

const AMOUNT = String.raw`\d{1,6}(?:[.,]\d{1,3})*`;
const PRICE_PATTERNS = [
  new RegExp(String.raw`[€$£]\s?${AMOUNT}`, "g"),
  new RegExp(String.raw`(?:EUR|USD|GBP|CHF)\s?${AMOUNT}`, "g"),
  new RegExp(String.raw`${AMOUNT}\s?(?:€|\$|£|EUR|USD|GBP|CHF|ALL|[Ll]ek[ëe]?)(?![\p{L}\p{N}])`, "gu"),
];
const CADENCE = /^\s?(?:\/|per)\s?(?:month|mo|year|yr|week|day|hour|hr|session|person|user|night)\b/i;
/** Amounts followed by a magnitude are company figures (funding, revenue), not prices. */
const MAGNITUDE = /^\s?(?:million|billion|bn|mn|m|k)\b/i;
const NON_PRICE_CONTEXT = /\b(?:revenue|funding|raised|valuation|salary|salaries|invest\w*|market size|turnover)\b/i;

export type PricingRead =
  | { status: "observed"; prices: { amount: string; excerpt: string }[] }
  | { status: "ambiguous" }
  | { status: "unavailable" };

function excerptAround(text: string, start: number, end: number): string {
  const half = Math.floor((COMPETITOR_LIMITS.maxPricingExcerptChars - (end - start)) / 2);
  const from = Math.max(0, start - half);
  const to = Math.min(text.length, end + half);
  return `${from > 0 ? "…" : ""}${text.slice(from, to).trim()}${to < text.length ? "…" : ""}`.slice(0, COMPETITOR_LIMITS.maxPricingExcerptChars);
}

/** Reads explicit prices from one evidence excerpt. Never estimates or converts. */
export function readPricing(text: string): PricingRead {
  const matches: { start: number; end: number }[] = [];
  for (const pattern of PRICE_PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (!matches.some((x) => start < x.end && end > x.start)) matches.push({ start, end });
    }
  }
  if (matches.length === 0) return { status: "unavailable" };

  const prices: { amount: string; excerpt: string }[] = [];
  let ambiguous = false;
  for (const { start, end } of matches.sort((a, b) => a.start - b.start)) {
    const after = text.slice(end);
    const before = text.slice(Math.max(0, start - 40), start);
    if (MAGNITUDE.test(after) || NON_PRICE_CONTEXT.test(before)) {
      ambiguous = true;
      continue;
    }
    const cadence = CADENCE.exec(after)?.[0] ?? "";
    const amount = `${text.slice(start, end)}${cadence}`.replace(/\s+/g, " ").trim();
    if (!prices.some((p) => p.amount === amount)) prices.push({ amount, excerpt: excerptAround(text, start, end + cadence.length) });
  }
  if (prices.length > 0) return { status: "observed", prices };
  return ambiguous ? { status: "ambiguous" } : { status: "unavailable" };
}

/* --------------------------------- Names --------------------------------- */

const GENERIC_TITLE_SEGMENTS = /^(home|homepage|home page|welcome|official site|official website|index|main)$/i;
/** Headline-style segments ("Half-Baked Byrek & Tortillas for Businesses in Kosovo") describe an offer, not a name. */
const HEADLINE_CONNECTORS = /\s(?:for|in|near|with|from|to|and|of|at)\s/i;
const MAX_NAME_WORDS = 5;
const MAX_PHRASE_WORDS = 4;

const usableName = (s: string | undefined): s is string =>
  !!s && s.length >= 2 && s.length <= COMPETITOR_LIMITS.maxNameChars && !GENERIC_TITLE_SEGMENTS.test(s);

function isHeadline(segment: string): boolean {
  const words = segment.split(/\s+/).length;
  return words > MAX_NAME_WORDS || (words >= 4 && HEADLINE_CONNECTORS.test(` ${segment} `));
}

const compact = (s: string) => foldText(s).replace(/[^\p{L}\p{N}]/gu, "");

/** A phrase of up to four words that spells the domain's own label ("Gerti Foods" for gertifoods.com). */
function phraseMatchingDomain(text: string, label: string): string | null {
  if (label.length < 4) return null;
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’&]*/gu) ?? [];
  for (let i = 0; i < words.length; i++) {
    for (let n = 1; n <= MAX_PHRASE_WORDS && i + n <= words.length; n++) {
      const phrase = words.slice(i, i + n);
      if (compact(phrase.join("")) === label) return phrase.join(" ");
    }
  }
  return null;
}

/**
 * The business's name, from the strongest evidence available:
 * 1. a phrase in the title or excerpt that spells the site's own domain label (text and domain agree);
 * 2. the publisher name, when the search provider supplied one;
 * 3. the first title segment that reads as a name rather than a headline;
 * 4. otherwise the domain itself, which identifies the site without inventing a name.
 */
export function deriveName(title: string, domain: string, excerpt = "", publisher?: string): string {
  const segments = title.split(/\s[|\-–—:·]\s|\s?[|·]\s?/).map((s) => s.trim()).filter(Boolean);
  const label = compact(domain.split(".")[0] ?? "");
  for (const segment of segments) {
    const phrase = phraseMatchingDomain(segment, label);
    if (!phrase) continue;
    // "Mulliri Vjetër" on mulliri.al: the whole name-like segment is the name; a headline yields only the phrase.
    const name = usableName(segment) && !isHeadline(segment) ? segment : phrase;
    if (usableName(name)) return name;
  }
  const agreed = phraseMatchingDomain(excerpt, label);
  if (usableName(agreed ?? undefined)) return agreed!;
  if (usableName(publisher?.trim())) return publisher!.trim();
  const named = segments.find((s) => usableName(s) && !isHeadline(s));
  return named ?? domain.slice(0, COMPETITOR_LIMITS.maxNameChars);
}

/* ------------------------------ Market focus ------------------------------ */

/** Explicit statements that a site sells to other businesses rather than to consumers. */
const BUSINESS_SUPPLY = [
  /\bsuppl(?:y|ies|ying)\b[^.]{0,60}\b(?:bakeries|hotels|restaurants|cafes|retailers|supermarkets|shops|businesses|caterers|horeca|offices)\b/,
  /\bfor (?:businesses|restaurants|hotels|bakeries|cafes|retailers|the trade)\b/,
  /\b(?:b2b|horeca|industrial[- ]scale|bulk orders?|trade (?:customers|accounts|prices)|private label)\b/,
];
/** Statements that a site serves consumers directly (visit, order, dine in). */
const CONSUMER_FACING =
  /\b(?:menu|visit us|opening hours|open (?:daily|every|from|now)|dine[- ]in|takeaway|take-away|order online|book a table|reservations?|shop now|buy now|add to cart|in-store|walk-ins?|our (?:cafe|shop|store|bakery|restaurant))\b/;
/** Context wording showing the new business itself sells to businesses. */
const BUSINESS_MARKET =
  /\b(?:b2b|businesses|companies|restaurants|hotels|cafes|retailers|bakeries|supermarkets|wholesale\w*|suppl(?:y|ier|iers)|distribut\w*|horeca|caterers)\b/;

/** Count of distinct business-supply statements in a candidate's text. */
export function businessSupplySignals(text: string): number {
  const folded = foldText(text);
  return BUSINESS_SUPPLY.filter((pattern) => pattern.test(folded)).length;
}

export function servesConsumers(text: string): boolean {
  return CONSUMER_FACING.test(foldText(text));
}

/** Whether the new business sells to other businesses, judged from its own idea, offer and customer wording. */
export function targetsBusinesses(context: ResearchContext): boolean {
  return BUSINESS_MARKET.test(foldText([context.idea, context.offer, context.customer].filter(Boolean).join(" ")));
}
