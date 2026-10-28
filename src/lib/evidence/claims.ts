/**
 * Shared claim / evidence helpers for research and strategy outputs.
 *
 * These are runtime validators — not TypeScript types alone. They keep
 * unverified quantitative competitor/market assertions out of packages that
 * would otherwise look “complete”.
 *
 * Claim categories (product truth model):
 *  - fact / system: trusted store or verified calculation (not handled here)
 *  - source-supported: cited URL exists (caller still must not over-claim)
 *  - inference / hypothesis / recommendation: strategic text, not verified fact
 *  - estimate: numeric projection with disclosed assumptions (finance layer)
 *  - unknown / unavailable: omit rather than fabricate
 */

/** Runtime classification used by UI and filters. */
export type ClaimKind =
  | "fact"
  | "source-supported"
  | "inference"
  | "hypothesis"
  | "estimate"
  | "recommendation"
  | "unknown";

/**
 * Percentages, currencies, or large “N customers/users” style claims.
 * Used for market summaries and strategic SWOT that must not smuggle stats.
 */
export function containsQuantitativeClaim(text: string): boolean {
  return (
    /\d[\d,.]*\s*%/.test(text) ||
    /\b\d[\d,.]*\s*(?:percent|percentage|përqind)\b/i.test(text) ||
    /(?:€|\$|£|ALL)\s*\d[\d,.]*/i.test(text) ||
    /\b\d[\d,.]*\s*(?:€|\$|£|ALL)\b/i.test(text) ||
    /\b\d[\d,.]*\s*(?:million|billion|thousand|mrd|mln|mijë)\b/i.test(text) ||
    /\b\d[\d,.]*\s*\+?\s*(?:customers?|clients?|users?|klient\w*|përdorues\w*|subscribers?)\b/i.test(text) ||
    /\b(?:doubled|tripled|tenfold|100x)\b/i.test(text)
  );
}

/** http(s) URL with a hostname — used to reject fake citation strings. */
export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (u.protocol === "http:" || u.protocol === "https:") && Boolean(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Assertions that look like verified competitor *performance* or internal
 * metrics — not something a homepage snippet can establish.
 */
export function containsUnsupportedCompetitorMetric(text: string): boolean {
  if (containsQuantitativeClaim(text)) return true;
  return /\b(?:revenue|profit(?:ability)?|valuation|market\s+share|ebitda|cac|ltv|roas|conversion\s+rate|customer\s+acquisition|annual\s+recurring|arr\b|mrr\b)\b/i.test(
    text,
  );
}

/** Market insight reaches the package only with text + ≥1 valid http(s) citation. */
export function acceptMarketInsight(insight: string, sources: string[]): boolean {
  if (!insight.trim()) return false;
  const valid = sources.filter(isHttpUrl);
  return valid.length > 0;
}

/**
 * Summaries have no per-claim citations. Quantitative assertions are replaced
 * so they cannot appear as unsourced verified facts.
 */
export function sanitizeMarketSummary(summary: string): string {
  const trimmed = summary.trim();
  if (!trimmed) return trimmed;
  if (!containsQuantitativeClaim(trimmed)) return trimmed;
  return "Market summary omitted a quantitative claim that was not backed by cited sources in this run.";
}

/**
 * SWOT / differentiation / opportunity-gap lines are strategic. Drop lines that
 * assert unverified competitor metrics or invented statistics so they cannot be
 * read as facts about a real business.
 */
export function sanitizeStrategicItems(items: string[], max = 8): string[] {
  const out: string[] = [];
  for (const raw of items) {
    const text = raw.trim();
    if (!text) continue;
    if (containsUnsupportedCompetitorMetric(text)) continue;
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Per-competitor strengths/weaknesses inferred from snippets. Keep short
 * qualitative notes; drop metric overclaims that snippets cannot support.
 */
export function sanitizeCompetitorAnnotations(items: string[], max: number): string[] {
  return sanitizeStrategicItems(items, max);
}

/** SWOT quadrants after LLM output — all treated as recommendations/hypotheses. */
export function sanitizeSwot(swot: {
  strengths?: string[] | null;
  weaknesses?: string[] | null;
  opportunities?: string[] | null;
  threats?: string[] | null;
}): { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] } {
  return {
    strengths: sanitizeStrategicItems(swot.strengths ?? [], 4),
    weaknesses: sanitizeStrategicItems(swot.weaknesses ?? [], 4),
    opportunities: sanitizeStrategicItems(swot.opportunities ?? [], 4),
    threats: sanitizeStrategicItems(swot.threats ?? [], 4),
  };
}
