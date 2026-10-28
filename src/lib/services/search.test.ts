import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { SearchProviderError, multiSearch, searchRaw, webSearch } from "@/lib/services/search";
import { createWebSearchProvider } from "@/lib/research/web-provider";
import { ResearchProviderError } from "@/lib/research/provider";

function respondWith(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof SearchProviderError || err instanceof ResearchProviderError) return err.code;
    throw err;
  }
  throw new Error("expected rejection");
}

beforeEach(() => {
  vi.stubEnv("TAVILY_API_KEY", "test-tavily");
  vi.stubEnv("SERPER_API_KEY", "");
  vi.stubEnv("BRAVE_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("search provider adapters", () => {
  it("normalizes a Tavily response into raw hits", async () => {
    respondWith({ results: [{ title: "A", url: "https://a.example/x", content: "About A", published_date: "2026-02-01", score: 0.9 }] });
    expect(await searchRaw("tavily", "coffee", 5)).toEqual([
      { title: "A", url: "https://a.example/x", snippet: "About A", publishedAt: "2026-02-01" },
    ]);
  });

  it("keeps Brave publisher names and treats non-string fields as absent", async () => {
    respondWith({ web: { results: [{ title: "B", url: "https://b.example", description: 7, profile: { name: "B News" } }] } });
    expect(await searchRaw("brave", "coffee", 5)).toEqual([
      { title: "B", url: "https://b.example", snippet: undefined, publishedAt: undefined, publisher: "B News" },
    ]);
  });

  it("caps results at the requested maximum", async () => {
    respondWith({ organic: Array.from({ length: 10 }, (_, i) => ({ title: `t${i}`, link: `https://s.example/${i}` })) });
    expect(await searchRaw("serper", "coffee", 3)).toHaveLength(3);
  });

  it("rejects malformed responses", async () => {
    respondWith({ results: "nope" });
    expect(await codeOf(searchRaw("tavily", "coffee", 5))).toBe("malformed");
    respondWith("<html>not json</html>");
    expect(await codeOf(searchRaw("tavily", "coffee", 5))).toBe("malformed");
  });

  it("reports HTTP and network failures", async () => {
    respondWith({ error: "quota" }, 429);
    expect(await codeOf(searchRaw("tavily", "coffee", 5))).toBe("http");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    expect(await codeOf(searchRaw("tavily", "coffee", 5))).toBe("network");
  });

  it("aborts requests that exceed the timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
      ),
    );
    expect(await codeOf(searchRaw("tavily", "coffee", 5, 10))).toBe("timeout");
  });

  it("maps adapter errors to research provider errors", async () => {
    respondWith({}, 500);
    expect(await codeOf(createWebSearchProvider("serper").search("coffee", { maxResults: 5, timeoutMs: 1000 }))).toBe("http");
  });

  it("keeps webSearch non-throwing for the generation agents", async () => {
    respondWith({}, 500);
    expect(await webSearch("coffee")).toBeNull();
    respondWith({ results: [{ title: " A ", url: "https://a.example", content: "x  y" }, { title: "no url" }] });
    expect(await webSearch("coffee")).toEqual({
      provider: "tavily",
      query: "coffee",
      results: [{ title: "A", url: "https://a.example", snippet: "x y" }],
    });
  });

  it("deduplicates identical multiSearch queries into one provider call", async () => {
    const fetchMock = respondWith({
      results: [{ title: "A", url: "https://a.example", content: "About A" }],
    });
    const out = await multiSearch(["  Coffee Tirana  ", "coffee tirana", "tea"], 3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.queries).toEqual(["  Coffee Tirana  ", "coffee tirana", "tea"]);
    expect(out.results).toHaveLength(1);
  });
});
