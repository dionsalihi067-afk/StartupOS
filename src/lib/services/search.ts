import "server-only";
import type { SearchResult } from "@/lib/types";

/**
 * Provider-agnostic web search service.
 *
 * Supports three real search providers, auto-selected by which API key is
 * present (priority: Tavily → Serper → Brave). This is the ONLY source of
 * competitor and market data in StartupOS — when no provider is configured the
 * platform reports the capability as unavailable rather than fabricating data.
 *
 * Design goals mirror the LLM client: never throw to callers, hard timeouts,
 * bounded retries, normalized output.
 */

export type SearchProvider = "tavily" | "serper" | "brave";

export interface SearchResponse {
  provider: SearchProvider;
  query: string;
  results: SearchResult[];
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
    switch (provider) {
      case "tavily":
        return await searchTavily(query, maxResults);
      case "serper":
        return await searchSerper(query, maxResults);
      case "brave":
        return await searchBrave(query, maxResults);
    }
  } catch {
    return null;
  }
}

/**
 * Runs multiple queries, de-duplicates results by URL, and returns a flat,
 * ranked list plus the provider and the queries that actually succeeded.
 */
export async function multiSearch(
  queries: string[],
  perQuery = 5,
): Promise<{ provider: SearchProvider | null; queries: string[]; results: SearchResult[] }> {
  const provider = getSearchProvider();
  if (!provider) return { provider: null, queries: [], results: [] };

  const settled = await Promise.allSettled(queries.map((q) => webSearch(q, perQuery)));
  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  const okQueries: string[] = [];

  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    if (!s || s.status !== "fulfilled" || !s.value) continue;
    okQueries.push(queries[i]!);
    for (const r of s.value.results) {
      const key = normalizeUrl(r.url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(r);
    }
  }

  return { provider, queries: okQueries, results: merged };
}

/* ------------------------------ Providers ------------------------------ */

async function searchTavily(query: string, maxResults: number): Promise<SearchResponse> {
  const res = await timedFetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      max_results: maxResults,
      search_depth: "basic",
      include_answer: false,
    }),
  });
  const json = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
  const results = (json.results ?? [])
    .map((r) => normalizeResult(r.title, r.url, r.content))
    .filter((r): r is SearchResult => r !== null);
  return { provider: "tavily", query, results };
}

async function searchSerper(query: string, maxResults: number): Promise<SearchResponse> {
  const res = await timedFetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": process.env.SERPER_API_KEY ?? "" },
    body: JSON.stringify({ q: query, num: maxResults }),
  });
  const json = (await res.json()) as { organic?: { title?: string; link?: string; snippet?: string }[] };
  const results = (json.organic ?? [])
    .slice(0, maxResults)
    .map((r) => normalizeResult(r.title, r.link, r.snippet))
    .filter((r): r is SearchResult => r !== null);
  return { provider: "serper", query, results };
}

async function searchBrave(query: string, maxResults: number): Promise<SearchResponse> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(maxResults));
  const res = await timedFetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_API_KEY ?? "" },
  });
  const json = (await res.json()) as { web?: { results?: { title?: string; url?: string; description?: string }[] } };
  const results = (json.web?.results ?? [])
    .slice(0, maxResults)
    .map((r) => normalizeResult(r.title, r.url, r.description))
    .filter((r): r is SearchResult => r !== null);
  return { provider: "brave", query, results };
}

/* ------------------------------ Helpers -------------------------------- */

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`Search provider responded ${res.status}`);
    return res;
  } finally {
    clearTimeout(timeout);
  }
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
