import { describe, expect, it } from "vitest";
import { dedupeSources, normalizeHit, normalizePublishedAt, normalizeUrl } from "@/lib/research/normalize";
import { hit } from "@/test/research";

const retrievedAt = "2026-10-08T12:00:00.000Z";

describe("normalizeUrl", () => {
  it("lowercases the host, drops fragments, tracking params and trailing slashes", () => {
    expect(normalizeUrl("HTTPS://WWW.Example.com/Path/?utm_source=x&gclid=1&b=2&a=1#frag")).toEqual({
      url: "https://www.example.com/Path?a=1&b=2",
      key: "example.com/Path?a=1&b=2",
      domain: "example.com",
    });
  });

  it("keeps meaningful query parameters and path case", () => {
    expect(normalizeUrl("https://shop.example.com/Item?id=42&page=2")?.url).toBe("https://shop.example.com/Item?id=42&page=2");
  });

  it("treats encoding and scheme variants of the same page as one key", () => {
    const a = normalizeUrl("https://example.com/%7Euser/guide/")!;
    const b = normalizeUrl("http://www.example.com/~user/guide")!;
    expect(a.key).toBe(b.key);
    expect(normalizeUrl("https://example.com/a%2Fb")!.key).not.toBe(normalizeUrl("https://example.com/a/b")!.key);
  });

  it("rejects non-http, credentialed, host-less and invalid URLs", () => {
    for (const raw of ["ftp://example.com/x", "javascript:alert(1)", "not a url", "http://user:pw@example.com/", "http://localhost/x"]) {
      expect(normalizeUrl(raw)).toBeNull();
    }
  });

  it("is deterministic", () => {
    const raw = "https://Example.com/b/?z=1&a=2&utm_medium=x";
    expect(normalizeUrl(raw)).toEqual(normalizeUrl(raw));
  });
});

describe("normalizeHit", () => {
  it("leaves missing publisher and publication date unset (never the retrieval time)", () => {
    const source = normalizeHit({ queryId: "demand", hit: hit("a") }, retrievedAt)!;
    expect(source.publisher).toBeUndefined();
    expect(source.publishedAt).toBeUndefined();
    expect(source.retrievedAt).toBe(retrievedAt);
    expect(source).toMatchObject({ domain: "example.com", title: "Title a", queryIds: ["demand"] });
    expect(source.id).toMatch(/^src_[0-9a-f]{12}$/);
  });

  it("keeps provider-supplied publisher and absolute publication dates", () => {
    const source = normalizeHit(
      { queryId: "trends", hit: hit("b", { publisher: "  Example  News ", publishedAt: "2026-03-01T00:00:00Z" }) },
      retrievedAt,
    )!;
    expect(source.publisher).toBe("Example News");
    expect(source.publishedAt).toBe("2026-03-01T00:00:00.000Z");
  });

  it("removes page markdown from snippets but keeps hashtags and numbering", () => {
    const source = normalizeHit(
      { queryId: "demand", hit: hit("c", { snippet: "# Free scheduling ![logo](https://x.test/l.png) **24/7** booking. ## Features See [pricing](https://x.test/p) #1 in #Prishtina" }) },
      retrievedAt,
    )!;
    expect(source.snippet).toBe("Free scheduling 24/7 booking. Features See pricing #1 in #Prishtina");
  });

  it("drops hits without a usable URL or title", () => {
    expect(normalizeHit({ queryId: "demand", hit: { title: "x", url: "mailto:a@b.c" } }, retrievedAt)).toBeNull();
    expect(normalizeHit({ queryId: "demand", hit: { title: "  ", url: "https://example.com" } }, retrievedAt)).toBeNull();
    expect(normalizeHit({ queryId: "demand", hit: { title: "x" } }, retrievedAt)).toBeNull();
  });
});

describe("normalizePublishedAt", () => {
  it("rejects relative, unparseable and future dates", () => {
    expect(normalizePublishedAt("2 days ago", retrievedAt)).toBeUndefined();
    expect(normalizePublishedAt("yesterday", retrievedAt)).toBeUndefined();
    expect(normalizePublishedAt("soon", retrievedAt)).toBeUndefined();
    expect(normalizePublishedAt("2030-01-01", retrievedAt)).toBeUndefined();
    expect(normalizePublishedAt("Mar 3, 2024", retrievedAt)).toMatch(/^2024-03-0[23]T/);
  });
});

describe("dedupeSources", () => {
  const order = ["demand", "trends", "competitors"] as const;

  it("merges the same page found by several queries, keeping provenance in plan order", () => {
    const fromCompetitors = normalizeHit({ queryId: "competitors", hit: hit("x", { url: "http://www.example.com/x/" }) }, retrievedAt)!;
    const fromDemand = normalizeHit(
      { queryId: "demand", hit: hit("x", { url: "https://example.com/x?utm_source=feed", publishedAt: "2026-01-05" }) },
      retrievedAt,
    )!;
    const merged = dedupeSources([fromCompetitors, fromDemand], order);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.queryIds).toEqual(["demand", "competitors"]);
    expect(merged[0]!.url).toBe(fromCompetitors.url);
    expect(merged[0]!.publishedAt).toBe("2026-01-05T00:00:00.000Z");
  });

  it("caps the number of distinct sources", () => {
    const sources = ["a", "b", "c", "d"].map((p) => normalizeHit({ queryId: "demand", hit: hit(p) }, retrievedAt)!);
    expect(dedupeSources(sources, order, 2).map((s) => s.title)).toEqual(["Title a", "Title b"]);
  });
});
