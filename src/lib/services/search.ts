import "server-only";
import { z } from "zod";
import type { SearchResult } from "@/lib/types";
import type { RawSearchHit } from "@/lib/research/provider";

/**
 * Provider-agnostic web search service.
 *
 * Supports three real search providers, auto-selected by which API key is
 * present (priority: Tavily → Serper → Brave). This is the ONLY source of
 * competitor and market data in StartupOS — when no provider is configured the
 * platform reports the capability as unavailable rather than fabricating data.
 *
 * `searchRaw` is the strict layer (typed errors, provider metadata) used by the
 * research engine; `webSearch` / `multiSearch` never throw and keep the shape
 * the generation agents rely on.
 */

export type SearchProvider = "tavily" | "serper" | "brave";

export interface SearchResponse {
  provider: SearchProvider;
  query: string;
  results: SearchResult[];
}

export type SearchErrorCode = "timeout" | "http" | "malformed" | "network";

export class SearchProviderError extends Error {
  constructor(readonly code: SearchErrorCode, message: string = code) {
    super(message);
    this.name = "SearchProviderError";
  }
}

const TIMEOUT_MS = 12_000;

export function getSearchProvider(): SearchProvider | null {
  if (process.env.TAVILY_API_KEY?.trim()) return "tavily";
  if (process.env.SERPER_API_KEY?.trim()) return "serper";
  if (process.env.BRAVE_API_KEY?.trim()) return "brave";
  return null;
}

export function isSearchConfigured(): boolean {
  return getSearchProvider() !== null;
}

/** Runs a single web search. Returns `null` on any failure or if unconfigured. */
export async function webSearch(query: string, maxResults = 6): Promise<SearchResponse | null> {
  const provider = getSearchProvider();
  if (!provider) return null;
  try {
    const hits = await searchRaw(provider, query, maxResults);
    const results = hits
      .map((h) => normalizeResult(h.title, h.url, h.snippet))
      .filter((r): r is SearchResult => r !== null);
    return { provider, query, results };
  } catch {
    return null;
  }
}

/**
 * Runs multiple queries, de-duplicates results by URL, and returns a flat,
 * ranked list plus the provider and the queries that actually succeeded.
 * Identical query strings (case/whitespace-insensitive) share one provider call.
 */
export async function multiSearch(
  queries: string[],
  perQuery = 5,
): Promise<{ provider: SearchProvider | null; queries: string[]; results: SearchResult[] }> {
  const provider = getSearchProvider();
  if (!provider) return { provider: null, queries: [], results: [] };

  const keyOf = (q: string) => q.trim().toLowerCase().replace(/\s+/g, " ");
  const uniqueOrder: string[] = [];
  const firstIndexByKey = new Map<string, number>();
  for (const q of queries) {
    const key = keyOf(q);
    if (!key || firstIndexByKey.has(key)) continue;
    firstIndexByKey.set(key, uniqueOrder.length);
    uniqueOrder.push(q);
  }

  const settled = await Promise.allSettled(uniqueOrder.map((q) => webSearch(q, perQuery)));
  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  const okQueries: string[] = [];
  const okByKey = new Set<string>();

  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    if (!s || s.status !== "fulfilled" || !s.value) continue;
    okByKey.add(keyOf(uniqueOrder[i]!));
    for (const r of s.value.results) {
      const key = normalizeUrl(r.url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(r);
    }
  }

  for (const q of queries) {
    if (okByKey.has(keyOf(q))) okQueries.push(q);
  }

  return { provider, queries: okQueries, results: merged };
}

/**
 * Runs one query against a specific provider. Throws {@link SearchProviderError}
 * on timeout, HTTP failure, network failure or a response that does not match
 * the provider's documented shape.
 */
export async function searchRaw(
  provider: SearchProvider,
  query: string,
  maxResults: number,
  timeoutMs = TIMEOUT_MS,
): Promise<RawSearchHit[]> {
  switch (provider) {
    case "tavily":
      return searchTavily(query, maxResults, timeoutMs);
    case "serper":
      return searchSerper(query, maxResults, timeoutMs);
    case "brave":
      return searchBrave(query, maxResults, timeoutMs);
  }
}

/* ------------------------------ Providers ------------------------------ */

/** Provider fields are optional and loosely typed; non-string values are treated as absent. */
const field = z.unknown().transform((v) => (typeof v === "string" ? v : undefined));

const tavilyResponse = z.object({
  results: z.array(z.object({ title: field, url: field, content: field, published_date: field })).optional(),
});

const serperResponse = z.object({
  organic: z.array(z.object({ title: field, link: field, snippet: field, date: field })).optional(),
});

const braveResponse = z.object({
  web: z
    .object({
      results: z
        .array(
          z.object({
            title: field,
            url: field,
            description: field,
            page_age: field,
            profile: z.object({ name: field }).optional().catch(undefined),
          }),
        )
        .optional(),
    })
    .optional(),
});

async function searchTavily(query: string, maxResults: number, timeoutMs: number): Promise<RawSearchHit[]> {
  const res = await timedFetch(
    "https://api.tavily.com/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: maxResults,
        search_depth: "basic",
        include_answer: false,
      }),
    },
    timeoutMs,
  );
  const json = await parseBody(res, tavilyResponse);
  return (json.results ?? []).slice(0, maxResults).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
    publishedAt: r.published_date,
  }));
}

async function searchSerper(query: string, maxResults: number, timeoutMs: number): Promise<RawSearchHit[]> {
  const res = await timedFetch(
    "https://google.serper.dev/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": process.env.SERPER_API_KEY ?? "" },
      body: JSON.stringify({ q: query, num: maxResults }),
    },
    timeoutMs,
  );
  const json = await parseBody(res, serperResponse);
  return (json.organic ?? []).slice(0, maxResults).map((r) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet,
    publishedAt: r.date,
  }));
}

async function searchBrave(query: string, maxResults: number, timeoutMs: number): Promise<RawSearchHit[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(maxResults));
  const res = await timedFetch(
    url.toString(),
    {
      method: "GET",
      headers: { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_API_KEY ?? "" },
    },
    timeoutMs,
  );
  const json = await parseBody(res, braveResponse);
  return (json.web?.results ?? []).slice(0, maxResults).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.description,
    publishedAt: r.page_age,
    publisher: r.profile?.name,
  }));
}

/* ------------------------------ Helpers -------------------------------- */

async function timedFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: controller.signal });
    } catch {
      throw new SearchProviderError(controller.signal.aborted ? "timeout" : "network");
    }
    if (!res.ok) throw new SearchProviderError("http", `Search provider responded ${res.status}`);
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function parseBody<T>(res: Response, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new SearchProviderError("malformed", "Search provider returned invalid JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new SearchProviderError("malformed", "Search provider response has an unexpected shape");
  return parsed.data;
}

function normalizeResult(title?: string, url?: string, snippet?: string): SearchResult | null {
  const t = (title ?? "").trim();
  const u = (url ?? "").trim();
  if (!t || !u || !/^https?:\/\//i.test(u)) return null;
  return {
    title: t.slice(0, 200),
    url: u,
    snippet: (snippet ?? "").trim().replace(/\s+/g, " ").slice(0, 500),
  };
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
