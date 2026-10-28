import { describe, expect, it } from "vitest";
import { runResearch } from "@/lib/research/engine";
import { RESEARCH_LIMITS } from "@/lib/research/limits";
import { RESEARCH_DIMENSIONS, researchSnapshotSchema } from "@/lib/research/model";
import { planResearch } from "@/lib/research/planner";
import { ResearchProviderError } from "@/lib/research/provider";
import { fakeProvider, hit, sampleInput, steppingClock } from "@/test/research";

const input = sampleInput();
const planned = planResearch(input);

/** Distinct results per planned query id (safe under bounded parallel search). */
const perQuery = (query: string) => {
  const id = planned.queries.find((q) => q.text === query)?.id ?? "unknown";
  return [hit(`${id}-a`), hit(`${id}-b`)];
};

describe("runResearch", () => {
  it("returns a complete, schema-valid snapshot when every query succeeds", async () => {
    const provider = fakeProvider(perQuery);
    const result = await runResearch(input, provider, { now: steppingClock() });
    if (result.status === "failed") throw new Error(result.error);

    const snap = result.snapshot;
    expect(result.status).toBe("complete");
    expect(researchSnapshotSchema.safeParse(snap).success).toBe(true);
    expect(snap.provider).toBe("fake");
    expect(snap.startedAt).toBe("2026-10-08T12:00:00.000Z");
    expect(Date.parse(snap.completedAt)).toBeGreaterThan(Date.parse(snap.startedAt));
    expect(snap.stats).toEqual({ queriesPlanned: 9, queriesSucceeded: 9, queriesFailed: 0, sourcesFound: 18 });
    expect(provider.calls).toHaveLength(snap.queries.length);
    expect(new Set(provider.calls.map((c) => c.query))).toEqual(new Set(snap.queries.map((q) => q.text)));
    expect(snap.context.customer).toBe("Remote workers");
    for (const claim of snap.claims) {
      if (claim.kind === "fact") expect(claim.sourceIds.length).toBeGreaterThan(0);
    }
  });

  it("keeps successful queries and records failures as partial research", async () => {
    const provider = fakeProvider((q) => {
      const id = planned.queries.find((x) => x.text === q)?.id;
      if (id === "customerNeeds") throw new ResearchProviderError("timeout");
      if (id === "pricing") throw new Error("boom");
      return perQuery(q);
    });
    const result = await runResearch(input, provider, { now: steppingClock() });
    if (result.status === "failed") throw new Error(result.error);

    expect(result.status).toBe("partial");
    const failed = result.snapshot.queries.filter((q) => q.status === "failed");
    expect(failed.map((q) => [q.id, q.error])).toEqual([
      ["customerNeeds", "timeout"],
      ["pricing", "unexpected"],
    ]);
    expect(result.snapshot.stats).toMatchObject({ queriesSucceeded: 7, queriesFailed: 2, sourcesFound: 14 });
  });

  it("times out a provider that never answers", async () => {
    const demandText = planned.queries.find((q) => q.id === "demand")!.text;
    const provider = fakeProvider((q) => (q === demandText ? new Promise(() => {}) : perQuery(q)));
    const result = await runResearch(input, provider, { limits: { requestTimeoutMs: 20 } });
    if (result.status === "failed") throw new Error(result.error);
    expect(result.snapshot.queries[0]).toMatchObject({ id: "demand", status: "failed", error: "timeout" });
  });

  it("marks malformed provider responses as failed queries and drops unusable hits", async () => {
    const demandText = planned.queries.find((q) => q.id === "demand")!.text;
    const provider = fakeProvider((q) => {
      if (q === demandText) return { results: "not an array" };
      const id = planned.queries.find((x) => x.text === q)?.id ?? "x";
      return [hit(`ok-${id}`), { title: 42, url: "https://example.com/bad-title" }, "garbage", { title: "No url" }];
    });
    const result = await runResearch(input, provider);
    if (result.status === "failed") throw new Error(result.error);
    expect(result.snapshot.queries[0]).toMatchObject({ status: "failed", error: "malformed" });
    expect(result.snapshot.queries[1]).toMatchObject({ status: "ok", resultCount: 1 });
    expect(result.snapshot.sources).toHaveLength(RESEARCH_DIMENSIONS.length - 1);
  });

  it("fails clearly when every query fails, with no findings", async () => {
    const result = await runResearch(input, fakeProvider(() => Promise.reject(new ResearchProviderError("http"))));
    expect(result).toMatchObject({ status: "failed", error: "allQueriesFailed", provider: "fake" });
    if (result.status !== "failed") throw new Error("expected failure");
    expect(result.queries).toHaveLength(RESEARCH_DIMENSIONS.length);
    expect(result.queries.every((q) => q.error === "http")).toBe(true);
  });

  it("fails when queries succeed but return nothing usable", async () => {
    expect(await runResearch(input, fakeProvider(() => []))).toMatchObject({ status: "failed", error: "noResults" });
  });

  it("reports missing configuration instead of fabricating research", async () => {
    expect(await runResearch(input, null)).toMatchObject({ status: "failed", error: "notConfigured", provider: null, queries: [] });
  });

  it("deduplicates a source found by several queries and keeps its provenance", async () => {
    const shared = hit("shared", { url: "https://www.example.com/shared/?utm_campaign=x" });
    const demandText = planned.queries.find((q) => q.id === "demand")!.text;
    const provider = fakeProvider((q) => [
      q === demandText ? shared : { ...shared, url: "https://example.com/shared" },
      hit(`own-${planned.queries.find((x) => x.text === q)?.id ?? "x"}`),
    ]);
    const result = await runResearch(input, provider);
    if (result.status === "failed") throw new Error(result.error);

    const sharedSources = result.snapshot.sources.filter((s) => s.title === "Title shared");
    expect(sharedSources).toHaveLength(1);
    expect(sharedSources[0]!.queryIds).toEqual([...RESEARCH_DIMENSIONS]);
    const evidence = result.snapshot.evidence.find((e) => e.sourceId === sharedSources[0]!.id)!;
    expect(evidence.category).toBeNull();
    expect(result.snapshot.claims.some((c) => c.kind === "fact" && c.sourceIds.includes(sharedSources[0]!.id))).toBe(false);
  });

  it("never exceeds the hard limits, even when asked to", async () => {
    const provider = fakeProvider((q) => {
      const id = planned.queries.find((x) => x.text === q)?.id ?? "x";
      return Array.from({ length: 50 }, (_, i) => hit(`c${id}-${i}`));
    });
    const result = await runResearch(input, provider, {
      limits: { maxQueries: 100, maxResultsPerQuery: 100, maxSources: 1000, requestTimeoutMs: 10_000_000 },
    });
    if (result.status === "failed") throw new Error(result.error);
    expect(provider.calls.length).toBeLessThanOrEqual(RESEARCH_LIMITS.maxQueries);
    for (const call of provider.calls) {
      expect(call.options.maxResults).toBeLessThanOrEqual(RESEARCH_LIMITS.maxResultsPerQuery);
      expect(call.options.timeoutMs).toBeLessThanOrEqual(RESEARCH_LIMITS.requestTimeoutMs);
    }
    expect(result.snapshot.sources.length).toBeLessThanOrEqual(RESEARCH_LIMITS.maxSources);
  });

  it("is deterministic for the same input and provider responses", async () => {
    // Fixed clock: parallel query workers must not race a stepping clock.
    const fixed = () => new Date("2026-10-08T12:00:00.000Z");
    const a = await runResearch(input, fakeProvider(perQuery), { now: fixed });
    const b = await runResearch(input, fakeProvider(perQuery), { now: fixed });
    expect(a).toEqual(b);
  });

  it("caps in-flight provider searches under the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const provider = fakeProvider(async (q) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 15));
      inFlight--;
      return perQuery(q);
    });
    await runResearch(input, provider);
    expect(peak).toBeLessThanOrEqual(4);
    expect(provider.calls).toHaveLength(planned.queries.length);
  });
});
