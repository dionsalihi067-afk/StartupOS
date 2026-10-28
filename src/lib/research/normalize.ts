import { createHash } from "node:crypto";
import { RESEARCH_LIMITS, type ResearchLimits } from "@/lib/research/limits";
import type { RawSearchHit } from "@/lib/research/provider";
import type { ResearchDimension, ResearchSource } from "@/lib/research/model";

/**
 * Turns raw provider hits into canonical sources. Nothing is invented: a
 * missing publisher or publication date stays missing.
 */

/** Parameters that only track the click and never change the destination. */
const TRACKING_PARAMS = new Set([
  "gclid",
  "dclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "yclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gl",
  "ref_src",
  "srsltid",
]);

function isTrackingParam(name: string): boolean {
  const key = name.toLowerCase();
  return key.startsWith("utm_") || TRACKING_PARAMS.has(key);
}

export interface NormalizedUrl {
  /** Usable URL: lowercase host, no fragment, no tracking parameters, no trailing slash. */
  url: string;
  /** Identity used to detect the same page under different spellings. */
  key: string;
  domain: string;
}

/** Deterministic URL normalization. Returns null for anything that is not a plain public http(s) URL. */
export function normalizeUrl(raw: string): NormalizedUrl | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password || !u.hostname.includes(".")) return null;

  u.hash = "";
  if (u.search) {
    const kept = [...u.searchParams.entries()].filter(([name]) => !isTrackingParam(name));
    kept.sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1));
    u.search = "";
    for (const [name, value] of kept) u.searchParams.append(name, value);
  }
  u.pathname = decodeUnreserved(u.pathname);
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "") || "/";

  const domain = u.hostname.replace(/^www\./, "");
  const key = `${domain}${u.pathname === "/" ? "" : u.pathname}${u.search}`;
  return { url: u.toString(), key, domain };
}

/** RFC 3986 §6.2.2: percent-encoded unreserved characters are equivalent to the characters themselves. */
function decodeUnreserved(path: string): string {
  return path.replace(/%([0-9A-Fa-f]{2})/g, (_match, hex: string) => {
    const char = String.fromCharCode(parseInt(hex, 16));
    return /[A-Za-z0-9\-._~]/.test(char) ? char : `%${hex.toUpperCase()}`;
  });
}

/** 12 hex chars of sha256: the suffix of every research id. */
export function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function sourceIdFor(key: string): string {
  return `src_${shortHash(key)}`;
}

/** Shortens text to `max` characters, preferring a word boundary, and marks the cut with "…". */
export function clipText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Plain text from a provider snippet, which may contain page markdown (headings, emphasis, links, images). */
function cleanText(value: string | undefined, maxChars: number): string {
  return (value ?? "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(^|\s)#{1,6}(?=\s)/g, "$1")
    .replace(/\*\*|__/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars)
    .trim();
}

/** Absolute publication date as ISO, or undefined. Relative phrases ("2 days ago") and future dates are rejected. */
export function normalizePublishedAt(value: string | undefined, retrievedAt: string): string | undefined {
  const text = value?.trim();
  if (!text || /\bago\b|^(today|yesterday)$/i.test(text)) return undefined;
  const time = Date.parse(text);
  if (Number.isNaN(time)) return undefined;
  if (time > Date.parse(retrievedAt) + 24 * 60 * 60 * 1000) return undefined;
  return new Date(time).toISOString();
}

export interface SourceCandidate {
  queryId: ResearchDimension;
  hit: RawSearchHit;
}

/** Normalizes one hit; returns null when it lacks a usable URL or title. */
export function normalizeHit(
  candidate: SourceCandidate,
  retrievedAt: string,
  limits: Pick<ResearchLimits, "maxTitleChars" | "maxSnippetChars" | "maxPublisherChars"> = RESEARCH_LIMITS,
): ResearchSource | null {
  const location = candidate.hit.url ? normalizeUrl(candidate.hit.url) : null;
  const title = cleanText(candidate.hit.title, limits.maxTitleChars);
  if (!location || !title) return null;

  const source: ResearchSource = {
    id: sourceIdFor(location.key),
    url: location.url,
    domain: location.domain,
    title,
    snippet: cleanText(candidate.hit.snippet, limits.maxSnippetChars),
    retrievedAt,
    queryIds: [candidate.queryId],
  };
  const publisher = cleanText(candidate.hit.publisher, limits.maxPublisherChars);
  if (publisher) source.publisher = publisher;
  const publishedAt = normalizePublishedAt(candidate.hit.publishedAt, retrievedAt);
  if (publishedAt) source.publishedAt = publishedAt;
  return source;
}

/**
 * Merges sources that point at the same page. The first occurrence (in query
 * plan order, then provider rank) wins; later ones only add the queries that
 * found them and fill fields the first one lacked. Capped at `maxSources`.
 */
export function dedupeSources(
  sources: readonly ResearchSource[],
  queryOrder: readonly ResearchDimension[],
  maxSources: number = RESEARCH_LIMITS.maxSources,
): ResearchSource[] {
  const byId = new Map<string, ResearchSource>();
  for (const source of sources) {
    const existing = byId.get(source.id);
    if (!existing) {
      if (byId.size >= maxSources) continue;
      byId.set(source.id, { ...source, queryIds: [...source.queryIds] });
      continue;
    }
    for (const q of source.queryIds) if (!existing.queryIds.includes(q)) existing.queryIds.push(q);
    if (!existing.snippet && source.snippet) existing.snippet = source.snippet;
    if (!existing.publisher && source.publisher) existing.publisher = source.publisher;
    if (!existing.publishedAt && source.publishedAt) existing.publishedAt = source.publishedAt;
  }
  const rank = (q: ResearchDimension) => queryOrder.indexOf(q);
  return [...byId.values()].map((s) => ({ ...s, queryIds: [...s.queryIds].sort((a, b) => rank(a) - rank(b)) }));
}
