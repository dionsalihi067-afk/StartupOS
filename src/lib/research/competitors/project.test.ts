import { describe, expect, it } from "vitest";
import { getResearchContextForAgent, projectResearchForAgents, type AgentResearchContext } from "@/lib/research/agent-context";
import { AGENT_RESEARCH_LIMITS } from "@/lib/research/limits";
import { COMPETITOR_DISCOVERY_DIMENSIONS, type ResearchRunResult } from "@/lib/research/model";
import { COMPETITOR_GUIDANCE, renderResearchContext } from "@/lib/research/prompt";
import { competitorResults, researchRun } from "@/test/research";

const NOW = new Date("2026-10-08T13:00:00.000Z");

async function competitorRun(options: Parameters<typeof researchRun>[0] = {}): Promise<ResearchRunResult> {
  return researchRun({ results: competitorResults(), ...options });
}

function contextFor(run: ResearchRunResult, agent: Parameters<typeof getResearchContextForAgent>[1]): AgentResearchContext {
  const context = getResearchContextForAgent(run, agent, NOW);
  if (!context) throw new Error(`no context for ${agent}`);
  return context;
}

const sourceUrl = (context: AgentResearchContext, ref: string) => context.sources.find((s) => s.ref === ref)?.url;

describe("competitor projection: competitor step", () => {
  it("receives validated profiles with resolvable source references", async () => {
    const context = contextFor(await competitorRun(), "competitor");
    const competitors = context.competitors!;
    expect(competitors.view).toBe("profiles");
    expect(competitors.discovery).toBe("complete");
    expect(competitors.profiles.map((p) => [p.ref, p.name, p.type])).toEqual([
      ["C1", "Rio Café", "direct"],
      ["C2", "Nomad Hub", "direct"],
      ["C3", "Tea House Tirana", "uncertain"],
      ["C4", "Mulliri Vjetër", "uncertain"],
    ]);
    for (const p of competitors.profiles) {
      expect(p.sourceRefs.length).toBeGreaterThan(0);
      expect(p.sourceRefs.map((ref) => sourceUrl(context, ref))).toContain(p.website);
      expect(p.listing).toBeTruthy();
    }
    expect(competitors.profiles[0]!.location).toBe("Tirana");
    expect(competitors.profiles[3]!.location).toBeUndefined();
  });

  it("keeps listed prices verbatim and marks unlisted pricing as unknown", async () => {
    const { competitors } = contextFor(await competitorRun(), "competitor");
    const rio = competitors!.profiles[0]!;
    expect(rio.pricing.status).toBe("observed");
    expect(rio.pricing.observations.map((o) => o.amount)).toEqual(["150 ALL"]);
    expect(competitors!.profiles[3]!.pricing).toEqual({ status: "unavailable", observations: [] });
  });

  it("explains that unlisted details are unknown", async () => {
    const { competitors } = contextFor(await competitorRun(), "competitor");
    expect(competitors!.limitations).toContain("Competitor details come only from search listings; anything not shown is unknown.");
  });

  it("states explicitly when no competitor could be validated", async () => {
    const { competitors } = contextFor(await researchRun(), "competitor");
    expect(competitors!.profiles).toEqual([]);
    expect(competitors!.limitations).toContain("No competitors could be validated from the retrieved evidence.");
  });

  it("reports failed and partial discovery", async () => {
    const failed = contextFor(await competitorRun({ failing: [...COMPETITOR_DISCOVERY_DIMENSIONS] }), "competitor").competitors!;
    expect(failed.discovery).toBe("failed");
    expect(failed.profiles).toEqual([]);
    expect(failed.limitations).toContain("Competitor discovery searches failed, so no competitors are known.");

    const partial = contextFor(await competitorRun({ failing: ["nicheCompetitors"] }), "competitor").competitors!;
    expect(partial.discovery).toBe("partial");
    expect(partial.profiles.map((p) => p.name)).not.toContain("Nomad Hub");
    expect(partial.limitations).toContain("Some competitor discovery searches failed, so competitors may be missing.");
  });
});

describe("competitor projection: other steps", () => {
  it("gives pricing structured pricing evidence instead of a competitor view", async () => {
    const context = contextFor(await competitorRun(), "pricing");
    expect(context.competitors).toBeUndefined();
    const evidence = context.pricingEvidence!;
    expect(evidence.research).toBe("complete");
    expect(evidence.competitors.filter((c) => c.status === "published").map((c) => c.name)).toEqual(["Rio Café", "Nomad Hub"]);
    expect(evidence.competitors.map((c) => c.status)).toEqual(["published", "published", "unavailable", "unavailable"]);
  });

  it("gives comparison steps only findings on their topics", async () => {
    const projected = projectResearchForAgents(await competitorRun(), NOW);
    for (const agent of ["market", "brand", "website", "marketing", "growth", "launch"] as const) {
      const competitors = projected[agent]?.competitors;
      expect(competitors?.view).toBe("comparison");
      expect(competitors?.profiles).toEqual([]);
      expect(competitors!.findings.length).toBeGreaterThan(0);
    }
    expect(projected.brand!.competitors!.findings.some((f) => f.topic === "location")).toBe(false);
    expect(projected.marketing!.competitors!.findings.some((f) => f.topic === "offer")).toBe(false);
  });

  it("keeps derived findings grounded in included findings", async () => {
    const projected = projectResearchForAgents(await competitorRun(), NOW);
    for (const context of Object.values(projected)) {
      const seen = new Set<string>();
      for (const f of context.competitors?.findings ?? []) {
        if (f.kind === "observation") expect(f.sourceRefs.length).toBeGreaterThan(0);
        else expect(f.basedOn.length > 0 && f.basedOn.every((ref) => seen.has(ref))).toBe(true);
        seen.add(f.ref);
      }
    }
  });

  it("gives steps without a competitor view no competitor context", async () => {
    const projected = projectResearchForAgents(await competitorRun(), NOW);
    for (const agent of ["persona", "email", "whatsapp", "seo", "pricing"] as const) expect(projected[agent]?.competitors).toBeUndefined();
    for (const agent of ["persona", "competitor", "market", "brand"] as const) expect(projected[agent]?.pricingEvidence).toBeUndefined();
  });

  it("omits the comparison when no competitor was validated", async () => {
    const projected = projectResearchForAgents(await researchRun(), NOW);
    expect(projected.brand?.competitors).toBeUndefined();
    expect(projected.market?.competitors).toBeUndefined();
  });
});

describe("competitor projection: limits and safety", () => {
  it("respects the agent caps and the shared source budget", async () => {
    const projected = projectResearchForAgents(await competitorRun(), NOW);
    for (const context of Object.values(projected)) {
      expect(context.sources.length).toBeLessThanOrEqual(AGENT_RESEARCH_LIMITS.maxSources);
      expect(context.competitors?.profiles.length ?? 0).toBeLessThanOrEqual(AGENT_RESEARCH_LIMITS.maxCompetitors);
      expect(context.competitors?.findings.length ?? 0).toBeLessThanOrEqual(AGENT_RESEARCH_LIMITS.maxCompetitorFindings);
      expect(new Set(context.sources.map((s) => s.ref)).size).toBe(context.sources.length);
    }
  });

  it("is deterministic", async () => {
    expect(projectResearchForAgents(await competitorRun(), NOW)).toEqual(projectResearchForAgents(await competitorRun(), NOW));
  });

  it("renders competitors with references, rules and no internal identifiers", async () => {
    const run = await competitorRun();
    const competitorPrompt = renderResearchContext(contextFor(run, "competitor"));
    expect(competitorPrompt).toContain("Validated competitors");
    expect(competitorPrompt).toMatch(/- \[C1\] Rio Café · riocafe\.al · direct · medium confidence · \[S\d+\]/);
    expect(competitorPrompt).toContain('150 ALL ("');
    expect(competitorPrompt).toContain("Competitor comparison");
    expect(competitorPrompt).toContain(COMPETITOR_GUIDANCE[0]);
    expect(competitorPrompt).not.toMatch(/guide\.example\.org|instagram|beans-wholesale|cars\.al/);

    const pricingPrompt = renderResearchContext(contextFor(run, "pricing"));
    expect(pricingPrompt).not.toContain("Validated competitors");
    expect(pricingPrompt).not.toContain("Listing:");

    for (const prompt of [competitorPrompt, pricingPrompt]) expect(prompt).not.toMatch(/\b(src|ev|cmp|cf|cl)_[0-9a-f]{12}\b/);
  });
});
