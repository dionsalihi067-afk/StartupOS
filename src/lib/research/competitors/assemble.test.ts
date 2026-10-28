import { describe, expect, it } from "vitest";
import { buildCompetitorIntelligence } from "@/lib/research/competitors/assemble";
import { competitorProvenanceIssues, type CompetitorIntelligence } from "@/lib/research/competitors/model";
import { deriveName } from "@/lib/research/competitors/signals";
import { COMPETITOR_LIMITS } from "@/lib/research/limits";
import type { ResearchRunResult, ResearchSnapshot } from "@/lib/research/model";
import type { RawSearchHit } from "@/lib/research/provider";
import { competitorResults, researchRun, sampleInput } from "@/test/research";

function snapshotOf(run: ResearchRunResult): ResearchSnapshot {
  if (run.status === "failed") throw new Error(run.error);
  return run.snapshot;
}

async function scenario(options: Parameters<typeof researchRun>[0] = {}) {
  const snapshot = snapshotOf(await researchRun({ results: competitorResults(), ...options }));
  const intel = buildCompetitorIntelligence(snapshot);
  if (!intel) throw new Error("intelligence failed validation");
  return { snapshot, intel };
}

const byDomain = (intel: CompetitorIntelligence, domain: string) => intel.competitors.find((c) => c.domain === domain);

describe("buildCompetitorIntelligence: validation", () => {
  it("keeps only identifiable, relevant businesses", async () => {
    const { intel } = await scenario();
    expect(intel.competitors.map((c) => c.domain).sort()).toEqual(["mulliri.al", "nomadhub.co.uk", "riocafe.al", "teahouse.al"]);
  });

  it("records why every other candidate was rejected", async () => {
    const { intel, snapshot } = await scenario();
    const reasonFor = (url: string) => intel.rejected.find((r) => snapshot.sources.find((s) => s.id === r.sourceId)?.url === url)?.reason;
    expect(reasonFor("https://guide.example.org/coffee-tirana")).toBe("article");
    expect(reasonFor("https://www.instagram.com/riocafe")).toBe("platform");
    expect(reasonFor("https://beans-wholesale.com/")).toBe("supplier");
    expect(reasonFor("https://cars.al/")).toBe("irrelevant");
    expect(reasonFor("https://somecafe.al/")).toBe("insufficientEvidence");
  });

  it("never treats general (non-discovery) results as competitor candidates", async () => {
    const { intel, snapshot } = await scenario();
    const general = snapshot.sources.filter((s) => s.domain === "example.com").map((s) => s.id);
    expect(general.length).toBeGreaterThan(0);
    for (const c of intel.competitors) expect(c.sourceIds.some((id) => general.includes(id))).toBe(false);
    expect(intel.rejected.some((r) => general.includes(r.sourceId))).toBe(false);
  });

  it("returns no competitors, rather than inventing any, when nothing validates", async () => {
    const articles: RawSearchHit[] = [{ title: "Top 5 coffee shops", url: "https://mag.example.net/top-coffee", snippet: "A list of coffee shops." }];
    const { intel } = await scenario({ results: { competitors: articles, localCompetitors: articles, directCompetitors: [], nicheCompetitors: [] } });
    expect(intel.competitors).toEqual([]);
    expect(intel.findings).toEqual([]);
  });
});

describe("buildCompetitorIntelligence: deduplication", () => {
  it("merges the same business found by several queries under different URL forms", async () => {
    const { intel, snapshot } = await scenario();
    const rio = byDomain(intel, "riocafe.al")!;
    const urls = rio.sourceIds.map((id) => snapshot.sources.find((s) => s.id === id)?.url);
    expect(urls).toEqual(["https://www.riocafe.al/", "https://riocafe.al/menu"]);
    expect(rio.queryIds).toEqual(["localCompetitors", "directCompetitors"]);
    expect(rio.evidenceIds).toHaveLength(2);
    expect(intel.competitors.filter((c) => c.domain === "riocafe.al")).toHaveLength(1);
  });

  it("collapses subdomains into one competitor", async () => {
    const { intel } = await scenario();
    expect(byDomain(intel, "teahouse.al")?.website).toBe("https://shop.teahouse.al/");
  });

  it("merges the same distinctive name in the same location across domains", async () => {
    const results = competitorResults();
    results.competitors = [{ title: "Rio Café", url: "https://riocafe-tirana.com/", snippet: "Rio Café specialty coffee in Tirana." }];
    const { intel } = await scenario({ results });
    const rio = intel.competitors.filter((c) => c.name.value === "Rio Café");
    expect(rio).toHaveLength(1);
    expect(rio[0]!.sourceIds).toHaveLength(3);
  });
});

describe("buildCompetitorIntelligence: evidence and provenance", () => {
  it("traces every field to the snapshot", async () => {
    const { intel, snapshot } = await scenario();
    expect(competitorProvenanceIssues(intel, snapshot)).toEqual([]);
    const source = (id: string) => snapshot.sources.find((s) => s.id === id)!;
    const evidence = (id: string) => snapshot.evidence.find((e) => e.id === id)!;

    for (const c of intel.competitors) {
      expect(c.name.value).toBe(deriveName(source(c.name.sourceIds[0]!).title, c.domain));
      expect(c.sourceIds.map((id) => source(id).url)).toContain(c.website);
      expect(c.listing.value).toBe(evidence(c.listing.evidenceIds[0]!).excerpt);
      if (c.location) expect(`${source(c.location.sourceIds[0]!).title} ${evidence(c.location.evidenceIds[0]!).excerpt}`).toMatch(/Tiran/);
      if (c.pricing.status === "observed") {
        for (const o of c.pricing.observations) expect(evidence(o.evidenceIds[0]!).excerpt).toContain(o.amount.split(/\/| per /)[0]!);
      }
    }
  });

  it("leaves unsupported fields absent instead of guessing", async () => {
    const { intel } = await scenario();
    const mulliri = byDomain(intel, "mulliri.al")!;
    expect(mulliri.location).toBeUndefined();
    expect(mulliri.classification.locationMatched).toBe(false);
    expect(mulliri.pricing).toEqual({ status: "unavailable" });
    expect(byDomain(intel, "teahouse.al")!.pricing).toEqual({ status: "unavailable" });
  });

  it("extracts only explicit pricing evidence", async () => {
    const { intel } = await scenario();
    expect(byDomain(intel, "riocafe.al")!.pricing).toMatchObject({ status: "observed", observations: [{ amount: "150 ALL" }] });
    expect(byDomain(intel, "nomadhub.co.uk")!.pricing).toMatchObject({ status: "observed", observations: [{ amount: "€8/day" }] });
  });
});

describe("buildCompetitorIntelligence: classification", () => {
  it("labels direct competitors only when offer, discovery intent and location agree", async () => {
    const { intel } = await scenario();
    expect(byDomain(intel, "riocafe.al")!.classification).toEqual({ type: "direct", matchedTerms: ["specialty", "coffee"], locationMatched: true });
    expect(byDomain(intel, "nomadhub.co.uk")!.classification.type).toBe("direct");
  });

  it("marks uncertain cases instead of guessing, and never assigns indirect by keywords", async () => {
    const { intel } = await scenario();
    expect(byDomain(intel, "mulliri.al")!.classification.type).toBe("uncertain");
    expect(byDomain(intel, "teahouse.al")!.classification.type).toBe("uncertain");
    expect(intel.competitors.some((c) => c.classification.type === "indirect")).toBe(false);
  });

  it("ranks direct competitors first and corroboration raises confidence", async () => {
    const { intel } = await scenario();
    expect(intel.competitors.map((c) => c.domain)).toEqual(["riocafe.al", "nomadhub.co.uk", "teahouse.al", "mulliri.al"]);
    expect(byDomain(intel, "riocafe.al")!.confidence).toBe("medium");
    expect(byDomain(intel, "nomadhub.co.uk")!.confidence).toBe("low");
  });

  it("caps validated competitors", async () => {
    const many: RawSearchHit[] = Array.from({ length: 5 }, (_, i) => ({ title: `Coffee Place ${i}`, url: `https://coffee${i}.al/`, snippet: `Specialty coffee in Tirana, branch ${i}.` }));
    const others: RawSearchHit[] = Array.from({ length: 5 }, (_, i) => ({ title: `Kafe Studio ${i}`, url: `https://kafe${i}.al/`, snippet: `Specialty coffee bar in Tirana ${i}.` }));
    const { intel } = await scenario({ results: { localCompetitors: many, directCompetitors: others } });
    expect(intel.competitors).toHaveLength(COMPETITOR_LIMITS.maxCompetitors);
  });
});

describe("buildCompetitorIntelligence: comparison", () => {
  it("separates observations, inferences and recommendations", async () => {
    const { intel } = await scenario();
    const statements = (kind: string) => intel.findings.filter((f) => f.kind === kind).map((f) => f.statement);
    expect(statements("observation")).toEqual([
      '"specialty" appears in the retrieved listings of 2 of 4 competitors.',
      '"coffee" appears in the retrieved listings of 4 of 4 competitors.',
      "3 of 4 competitors' retrieved listings mention Tirana.",
      "Explicit prices appear in the retrieved listings of 2 of 4 competitors.",
      '"free delivery" appears in the retrieved listings of 2 of 4 competitors.',
    ]);
    expect(statements("inference")).toEqual(['"free delivery" appears to be a common promise among the competitors found.']);
    expect(statements("recommendation")).toEqual(['Treat "free delivery" as a baseline expectation rather than a differentiator.']);
  });

  it("grounds observations in competitor evidence and builds derived findings only on non-recommendations", async () => {
    const { intel } = await scenario();
    const kinds = new Map(intel.findings.map((f) => [f.id, f.kind]));
    for (const f of intel.findings) {
      if (f.kind === "observation") {
        const owned = new Set(f.competitorIds.flatMap((id) => intel.competitors.find((c) => c.id === id)!.evidenceIds));
        expect(f.evidenceIds.every((id) => owned.has(id))).toBe(true);
      } else {
        for (const id of f.basedOn) expect(kinds.get(id)).not.toBe("recommendation");
      }
    }
  });

  it("reports gaps only for offer terms absent from every competitor listing", async () => {
    const input = sampleInput({ offer: { main: "Coffee and vinyl records", status: "planned" } });
    const { intel } = await scenario({ input });
    const gaps = intel.findings.filter((f) => f.topic === "gap");
    expect(gaps.map((f) => [f.kind, f.statement])).toEqual([
      ["observation", 'None of the 4 competitors\' retrieved listings mention "vinyl".'],
      ["inference", '"vinyl" may be under-served among the competitors found.'],
      ["recommendation", 'Consider testing "vinyl" as a differentiator, and validate demand before relying on it.'],
      ["observation", 'None of the 4 competitors\' retrieved listings mention "records".'],
      ["inference", '"records" may be under-served among the competitors found.'],
      ["recommendation", 'Consider testing "records" as a differentiator, and validate demand before relying on it.'],
    ]);
    const gapObservation = gaps[0]!;
    if (gapObservation.kind !== "observation") throw new Error("expected an observation");
    expect(gapObservation.competitorIds).toHaveLength(intel.competitors.length);
  });

  it("never exceeds the findings cap and keeps derived findings grounded after truncation", async () => {
    const input = sampleInput({ offer: { main: "Coffee and vinyl records", status: "planned" } });
    const { intel } = await scenario({ input });
    expect(intel.findings.length).toBeLessThanOrEqual(COMPETITOR_LIMITS.maxFindings);
    const ids = new Set<string>();
    for (const f of intel.findings) {
      if (f.kind !== "observation") expect(f.basedOn.every((id) => ids.has(id))).toBe(true);
      ids.add(f.id);
    }
  });

  it("does not claim a pricing pattern from fewer than two priced competitors", async () => {
    const results = competitorResults();
    results.nicheCompetitors = [{ title: "Nomad Hub - coworking café", url: "https://nomadhub.co.uk/", snippet: "Coffee and coworking for remote workers in Tirana." }];
    const { intel } = await scenario({ results });
    const pricing = intel.findings.filter((f) => f.topic === "pricing");
    expect(pricing.map((f) => [f.kind, f.statement])).toEqual([
      ["observation", "Explicit prices appear in the retrieved listings of 1 of 4 competitors."],
      ["inference", "Public pricing appears uncommon among the competitors found, so no market-wide price pattern can be established."],
    ]);
    expect(intel.findings.some((f) => f.kind === "recommendation" && f.topic === "pricing")).toBe(false);
  });
});

describe("buildCompetitorIntelligence: status and determinism", () => {
  it("uses the evidence that survived partial research", async () => {
    const { intel, snapshot } = await scenario({ failing: ["localCompetitors"] });
    expect(snapshot.status).toBe("partial");
    const rio = byDomain(intel, "riocafe.al")!;
    expect(rio.queryIds).toEqual(["directCompetitors"]);
    expect(rio.confidence).toBe("low");
    expect(competitorProvenanceIssues(intel, snapshot)).toEqual([]);
  });

  it("is deterministic", async () => {
    const a = await scenario();
    const b = await scenario();
    expect(a.intel).toEqual(b.intel);
    expect(buildCompetitorIntelligence(a.snapshot)).toEqual(a.intel);
  });
});
