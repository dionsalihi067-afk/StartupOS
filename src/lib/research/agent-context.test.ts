import { describe, expect, it } from "vitest";
import { GENERATED_SECTIONS } from "@/lib/dependencies";
import {
  AGENT_RESEARCH_RELEVANCE,
  getResearchContextForAgent,
  projectResearchForAgents,
  researchFreshness,
} from "@/lib/research/agent-context";
import { AGENT_COMPETITOR_VIEW } from "@/lib/research/competitors/project";
import { runResearch } from "@/lib/research/engine";
import { AGENT_RESEARCH_LIMITS } from "@/lib/research/limits";
import { researchSnapshotSchema, type ResearchRunResult, type ResearchSnapshot } from "@/lib/research/model";
import { RESEARCH_GUIDANCE, renderResearchContext } from "@/lib/research/prompt";
import { researchRun, sampleInput } from "@/test/research";

const NOW = new Date("2026-10-08T13:00:00.000Z");

function snapshotOf(run: ResearchRunResult): ResearchSnapshot {
  if (run.status === "failed") throw new Error(`expected a snapshot, got ${run.error}`);
  return run.snapshot;
}

describe("getResearchContextForAgent: relevance", () => {
  it("gives every agent only the categories it is declared to use", async () => {
    const run = await researchRun();
    for (const agent of GENERATED_SECTIONS) {
      const context = getResearchContextForAgent(run, agent, NOW);
      const allowed = AGENT_RESEARCH_RELEVANCE[agent];
      if (allowed.length === 0) {
        expect(context).toBeNull();
        continue;
      }
      expect(context?.categories).toEqual(allowed);
      expect(context?.facts.length).toBeGreaterThan(0);
      for (const fact of context?.facts ?? []) expect(allowed).toContain(fact.category);
    }
  });

  it("excludes irrelevant categories", async () => {
    const run = await researchRun();
    const pricing = getResearchContextForAgent(run, "pricing", NOW);
    const persona = getResearchContextForAgent(run, "persona", NOW);
    expect(pricing?.facts.every((f) => f.statement.includes("pricing signal"))).toBe(true);
    expect(persona?.facts.every((f) => f.statement.includes("customerNeeds signal"))).toBe(true);
    expect(JSON.stringify(pricing)).not.toContain("competitors signal");
    expect(getResearchContextForAgent(run, "design", NOW)).toBeNull();
    expect(getResearchContextForAgent(run, "logo", NOW)).toBeNull();
  });

  it("orders facts by the agent's category priority", async () => {
    const context = getResearchContextForAgent(await researchRun(), "competitor", NOW);
    const order = context?.facts.map((f) => f.category) ?? [];
    expect(order).toEqual([...order].sort((a, b) => AGENT_RESEARCH_RELEVANCE.competitor.indexOf(a) - AGENT_RESEARCH_RELEVANCE.competitor.indexOf(b)));
    expect(order[0]).toBe("positioning");
  });

  it("never passes raw competitor-search snippets as facts", async () => {
    const projected = projectResearchForAgents(await researchRun(), NOW);
    for (const context of Object.values(projected)) expect(context.facts.some((f) => f.category === "competitor")).toBe(false);
  });

  it("only projects agents with declared relevance", async () => {
    const projected = projectResearchForAgents(await researchRun(), NOW);
    expect(Object.keys(projected).sort()).toEqual(
      GENERATED_SECTIONS.filter((a) => AGENT_RESEARCH_RELEVANCE[a].length > 0 || AGENT_COMPETITOR_VIEW[a]).sort(),
    );
  });
});

describe("getResearchContextForAgent: provenance", () => {
  it("preserves the exact source behind every fact", async () => {
    const run = await researchRun();
    const snapshot = snapshotOf(run);
    const context = getResearchContextForAgent(run, "brand", NOW);
    if (!context) throw new Error("brand should receive research");

    for (const fact of context.facts) {
      const original = snapshot.claims.find((c) => c.kind === "fact" && c.statement === fact.statement);
      if (!original || original.kind !== "fact") throw new Error(`fact ${fact.ref} has no origin claim`);
      const originalUrls = original.sourceIds.map((id) => snapshot.sources.find((s) => s.id === id)?.url);
      const projectedUrls = fact.sourceRefs.map((ref) => context.sources.find((s) => s.ref === ref)?.url);
      expect(projectedUrls).toEqual(originalUrls);
      expect(fact.confidence).toBe(original.confidence);
    }
    expect(context.sources.map((s) => s.ref)).toEqual(context.sources.map((_, i) => `S${i + 1}`));
  });

  it("never exposes provider metadata, query text or internal ids", async () => {
    const run = await researchRun({ provider: "secret-provider-name" });
    const snapshot = snapshotOf(run);
    const serialized = JSON.stringify(projectResearchForAgents(run, NOW));
    expect(serialized).not.toContain("secret-provider-name");
    for (const q of snapshot.queries) expect(serialized).not.toContain(q.text);
    expect(serialized).not.toMatch(/\b(src|ev|cl)_[0-9a-f]{12}\b/);
  });

  it("returns no inferences or recommendations when the snapshot has none", async () => {
    const context = getResearchContextForAgent(await researchRun(), "marketing", NOW);
    expect(context?.inferences).toEqual([]);
    expect(context?.recommendations).toEqual([]);
  });

  it("projects real inferences and recommendations grounded in included facts", async () => {
    const snapshot = snapshotOf(await researchRun());
    const fact = snapshot.claims.find((c) => c.kind === "fact" && c.category === "market");
    if (!fact) throw new Error("expected a market fact");
    const extended: ResearchSnapshot = {
      ...snapshot,
      claims: [
        ...snapshot.claims,
        { id: "cl_aaaaaaaaaaaa", kind: "inference", category: "market", statement: "Demand appears seasonal.", confidence: "low", basedOnClaimIds: [fact.id] },
        { id: "cl_bbbbbbbbbbbb", kind: "recommendation", category: "market", statement: "Plan a seasonal launch.", confidence: "low", basedOnClaimIds: ["cl_aaaaaaaaaaaa"] },
        { id: "cl_cccccccccccc", kind: "inference", category: "pricing", statement: "Not for market agents.", confidence: "low", basedOnClaimIds: [fact.id] },
      ],
    };
    expect(researchSnapshotSchema.safeParse(extended).success).toBe(true);

    const context = getResearchContextForAgent({ status: extended.status, snapshot: extended }, "market", NOW);
    const factRef = context?.facts.find((f) => f.statement === fact.statement)?.ref;
    expect(context?.inferences).toEqual([{ ref: "I1", category: "market", statement: "Demand appears seasonal.", confidence: "low", basedOn: [factRef] }]);
    expect(context?.recommendations).toEqual([{ ref: "R1", category: "market", statement: "Plan a seasonal launch.", confidence: "low", basedOn: ["I1"] }]);
  });
});

describe("getResearchContextForAgent: status", () => {
  it("represents a complete run as current evidence", async () => {
    const context = getResearchContextForAgent(await researchRun(), "market", NOW);
    expect(context).toMatchObject({ status: "complete", freshness: "current" });
    expect(context?.limitations).toEqual([]);
  });

  it("flags partial research and the categories whose searches failed", async () => {
    const run = await researchRun({ failing: ["pricing"] });
    const pricing = getResearchContextForAgent(run, "pricing", NOW);
    expect(pricing?.status).toBe("partial");
    expect(pricing?.facts).toEqual([]);
    expect(pricing?.limitations).toContain("No pricing research is available because the search failed.");

    const brand = getResearchContextForAgent(run, "brand", NOW);
    expect(brand?.status).toBe("partial");
    expect(brand?.facts.length).toBeGreaterThan(0);
    expect(brand?.limitations[0]).toMatch(/partial/);
  });

  it("represents a failed run without any findings", async () => {
    const failed = await runResearch(sampleInput(), null);
    const context = getResearchContextForAgent(failed, "market", NOW);
    expect(context).toMatchObject({ status: "failed", facts: [], inferences: [], recommendations: [], sources: [] });
    const rendered = renderResearchContext(context!);
    expect(rendered).toContain("Status: failed");
    expect(rendered).not.toContain("Sources:");
    expect(rendered).not.toContain("[F1]");
  });

  it("marks old research as stale instead of presenting it as current", async () => {
    const run = await researchRun();
    const later = new Date(Date.parse(snapshotOf(run).completedAt) + (AGENT_RESEARCH_LIMITS.staleAfterDays + 1) * 86_400_000);
    const context = getResearchContextForAgent(run, "market", later);
    expect(context?.freshness).toBe("stale");
    expect(context?.limitations.some((l) => l.includes("outdated"))).toBe(true);
    expect(researchFreshness(snapshotOf(run).completedAt, NOW)).toBe("current");
  });
});

describe("getResearchContextForAgent: size limits", () => {
  it("caps claims and sources, and clips long statements", async () => {
    const run = await researchRun({ hitsPerQuery: 5, snippet: (d, n) => `${d} signal ${n} ${"detail ".repeat(70)}`.trim() });
    const snapshot = snapshotOf(run);
    const marketFacts = snapshot.claims.filter((c) => c.category === "market").length;
    expect(marketFacts).toBeGreaterThan(AGENT_RESEARCH_LIMITS.maxClaims);

    const context = getResearchContextForAgent(run, "market", NOW);
    expect(context?.facts).toHaveLength(AGENT_RESEARCH_LIMITS.maxClaims);
    expect(context?.sources.length).toBeLessThanOrEqual(AGENT_RESEARCH_LIMITS.maxSources);
    for (const f of context?.facts ?? []) {
      expect(f.statement.length).toBeLessThanOrEqual(AGENT_RESEARCH_LIMITS.maxStatementChars);
      expect(f.sourceRefs.length).toBeLessThanOrEqual(AGENT_RESEARCH_LIMITS.maxSourceRefsPerClaim);
    }
    expect(context?.limitations).toContain(`Only the ${AGENT_RESEARCH_LIMITS.maxClaims} most relevant of ${marketFacts} findings are included.`);
  });

  it("is deterministic and does not mutate the snapshot", async () => {
    const run = await researchRun({ hitsPerQuery: 5 });
    const before = structuredClone(run);
    const a = projectResearchForAgents(run, NOW);
    const b = projectResearchForAgents(run, NOW);
    expect(a).toEqual(b);
    expect(renderResearchContext(a.brand!)).toBe(renderResearchContext(b.brand!));
    expect(run).toEqual(before);
  });
});

describe("renderResearchContext", () => {
  it("renders compact provenance and the guidance contract exactly once", async () => {
    const context = getResearchContextForAgent(await researchRun(), "persona", NOW)!;
    const rendered = renderResearchContext(context);
    expect(rendered).toContain('[S1] example.com — "customerNeeds title 0"');
    expect(rendered).toMatch(/- \[F1\] customer · low confidence · \[S1\]: .*customerNeeds signal 0/);
    expect(rendered).toContain("Status: complete");
    for (const rule of RESEARCH_GUIDANCE) expect(rendered.split(rule)).toHaveLength(2);
    expect(rendered).not.toContain("Inferences");
    expect(rendered).not.toContain("Recommendations");
  });
});
