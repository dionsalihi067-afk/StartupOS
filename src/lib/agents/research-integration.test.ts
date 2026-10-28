import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const llm = vi.hoisted(() => ({ prompts: [] as { system: string; user: string }[], response: null as unknown }));

vi.mock("@/lib/ai/client", () => ({
  isLlmConfigured: () => false,
  generateJson: vi.fn(async (opts: { system: string; user: string }) => {
    llm.prompts.push({ system: opts.system, user: opts.user });
    return llm.response === null ? { data: null, source: "none", note: "llm-unavailable" } : { data: llm.response, source: "llm" };
  }),
}));

vi.mock("@/lib/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/search")>()),
  // Hits must look like real offer-relevant business pages: rejectSearchArtifact drops
  // title/snippet pairs that share no terms with the owner's offer (e.g. "Agent snippet").
  multiSearch: vi.fn(async (queries: string[]) => ({
    provider: "tavily",
    queries,
    results: [
      {
        title: "Rio Specialty Coffee Tirana",
        url: "https://agent-search.test/a",
        snippet: "Neighborhood specialty coffee shop and cafe for remote workers in Tirana.",
      },
      {
        title: "Best banks near Tirana",
        url: "https://agent-search.test/junk-bank",
        snippet: "National banking directory and branch finder.",
      },
    ],
  })),
}));

import { createContext, type GenerationContext } from "@/lib/agents/context";
import { runBrandAgent } from "@/lib/agents/brand";
import { runPersonaAgent } from "@/lib/agents/persona";
import { runCompetitorAgent } from "@/lib/agents/competitor";
import { runMarketAgent } from "@/lib/agents/market";
import { runPricingAgent } from "@/lib/agents/pricing";
import { runWebsiteAgent } from "@/lib/agents/website";
import { runSeoAgent } from "@/lib/agents/seo";
import { runMarketingAgent } from "@/lib/agents/marketing";
import { runEmailAgent } from "@/lib/agents/email";
import { runGrowthAgent } from "@/lib/agents/growth";
import type { ResearchRunResult } from "@/lib/research/model";
import { runResearch } from "@/lib/research/engine";
import { RESEARCH_GUIDANCE } from "@/lib/research/prompt";
import { COMPETITOR_GUIDANCE } from "@/lib/research/prompt";
import { COMPETITOR_DISCOVERY_DIMENSIONS } from "@/lib/research/model";
import { multiSearch } from "@/lib/services/search";
import { makePackage } from "@/test/db";
import { ResearchProviderError } from "@/lib/research/provider";
import { competitorResults, fakeProvider, researchRun, sampleInput } from "@/test/research";

const NOW = new Date("2026-10-08T13:00:00.000Z");
const pkg = makePackage();
const input = sampleInput();

function llmContext(research?: ResearchRunResult): GenerationContext {
  const ctx = createContext(input, { research, now: NOW });
  ctx.useLlm = true;
  ctx.brand = pkg.brand;
  ctx.persona = pkg.persona;
  ctx.competitors = pkg.competitors;
  ctx.pricing = pkg.pricing;
  return ctx;
}

type AgentCall = (ctx: GenerationContext) => Promise<unknown>;

/** Prompt-based agents and the snippet markers their research slice must (and must not) contain. */
const AGENTS: { name: string; run: AgentCall; expected: string[]; excluded: string[] }[] = [
  { name: "market", run: (c) => runMarketAgent(c), expected: ["demand signal", "trends signal"], excluded: ["pricing signal", "competitors signal", "customerNeeds signal"] },
  { name: "persona", run: (c) => runPersonaAgent(c), expected: ["customerNeeds signal"], excluded: ["pricing signal", "competitors signal", "demand signal"] },
  { name: "pricing", run: (c) => runPricingAgent(c), expected: ["pricing signal"], excluded: ["customerNeeds signal", "competitors signal", "demand signal"] },
  { name: "brand", run: (c) => runBrandAgent(c), expected: ["positioning signal", "customerNeeds signal", "demand signal"], excluded: ["pricing signal", "competitors signal"] },
  { name: "marketing", run: (c) => runMarketingAgent(c, pkg.brand, pkg.persona), expected: ["customerNeeds signal", "positioning signal"], excluded: ["pricing signal", "competitors signal"] },
  { name: "website", run: (c) => runWebsiteAgent(c, pkg.brand, pkg.pricing), expected: ["customerNeeds signal", "positioning signal"], excluded: ["pricing signal", "competitors signal"] },
  { name: "email", run: (c) => runEmailAgent(c, pkg.brand), expected: ["customerNeeds signal", "positioning signal"], excluded: ["pricing signal", "demand signal"] },
  { name: "growth", run: (c) => runGrowthAgent(c, pkg.brand), expected: ["demand signal", "customerNeeds signal", "pricing signal"], excluded: ["competitors signal", "positioning signal"] },
];

async function promptFor(run: AgentCall, research?: ResearchRunResult): Promise<string> {
  llm.prompts.length = 0;
  await run(llmContext(research));
  expect(llm.prompts).toHaveLength(1);
  return llm.prompts[0]!.user;
}

beforeEach(() => {
  llm.prompts.length = 0;
  llm.response = null;
  vi.mocked(multiSearch).mockClear();
});

describe("research reaches research-aware agents", () => {
  for (const agent of AGENTS) {
    it(`${agent.name}: receives only its relevant research with provenance and the guidance contract`, async () => {
      const prompt = await promptFor(agent.run, await researchRun());
      expect(prompt).toContain("RESEARCH CONTEXT");
      expect(prompt).toContain("Status: complete");
      expect(prompt).toMatch(/\[S1\] example\.com — "/);
      for (const marker of agent.expected) expect(prompt).toContain(marker);
      for (const marker of agent.excluded) expect(prompt).not.toContain(marker);
      expect(prompt).toContain(RESEARCH_GUIDANCE[6]);
    });
  }

  it("keeps every prompt unchanged when no research exists", async () => {
    for (const agent of AGENTS) {
      const prompt = await promptFor(agent.run);
      expect(prompt).not.toContain("RESEARCH CONTEXT");
      expect(prompt).not.toContain(RESEARCH_GUIDANCE[0]);
    }
  });

  it("tells agents not to pretend research exists when it failed", async () => {
    const failed = await runResearch(input, null);
    const prompt = await promptFor((c) => runPricingAgent(c), failed);
    expect(prompt).toContain("Status: failed");
    expect(prompt).not.toContain("Sources:");
    expect(prompt).not.toContain("pricing signal");
    expect(prompt).toContain("Observed competitor prices: none available.");
  });

  it("flags partial research in the prompt", async () => {
    const prompt = await promptFor((c) => runPricingAgent(c), await researchRun({ failing: ["pricing"] }));
    expect(prompt).toContain("Status: partial");
    expect(prompt).toContain("No research findings relevant to this task were retrieved.");
    expect(prompt).toContain("No pricing research is available because the search failed.");
  });
});

describe("competitor agent with competitor intelligence", () => {
  const competitorRun = () => researchRun({ results: competitorResults() });
  const retrievedUrls = async () => {
    const run = await competitorRun();
    if (run.status === "failed") throw new Error(run.error);
    return new Set(run.snapshot.sources.map((s) => s.url));
  };

  it("prompts with validated profiles, competitor rules and no raw competitor snippets", async () => {
    const prompt = await promptFor((c) => runCompetitorAgent(c), await competitorRun());
    expect(prompt).toContain("Validated competitors");
    expect(prompt).toContain("[C1] Rio Café");
    expect(prompt).toContain(COMPETITOR_GUIDANCE[0]);
    expect(prompt).toContain("positioning signal");
    expect(prompt).not.toMatch(/guide\.example\.org|instagram|beans-wholesale|cars\.al|Agent search result/);
    expect(prompt).not.toContain("pricing signal");
    expect(multiSearch).not.toHaveBeenCalled();
  });

  it("builds competitors only from validated profiles when the model output is unusable", async () => {
    const out = await runCompetitorAgent(llmContext(await competitorRun()));
    const urls = await retrievedUrls();
    expect(out.note).toBe("llm-unavailable");
    expect(out.data.status).toBe("ok");
    expect(out.data.provider).toBe("fake");
    expect(out.data.queries.length).toBeGreaterThan(0);
    expect(out.data.competitors.map((c) => c.name)).toEqual(["Rio Café", "Nomad Hub", "Tea House Tirana", "Mulliri Vjetër"]);
    for (const c of out.data.competitors) {
      expect(urls.has(c.website)).toBe(true);
      expect(c.sources.every((u) => urls.has(u))).toBe(true);
      expect(c.category).toBe("");
      expect(c.strengths).toEqual([]);
    }
    expect(out.data.sources.every((s) => urls.has(s.url))).toBe(true);
  });

  it("states both counts when fewer competitors are shown than research validated", async () => {
    const ctx = llmContext(await competitorRun());
    ctx.useLlm = false;
    const intel = ctx.research!.competitor!.competitors!;
    const shown = intel.profiles.filter((p) => p.website).length;
    intel.total = intel.profiles.length + 2;
    const out = await runCompetitorAgent(ctx);
    expect(out.data.marketOverview).toContain(`Research identified ${intel.total} competitors from search listings; ${shown} of them are shown here.`);
    expect(out.data.competitors).toHaveLength(shown);
  });

  it("lets the model annotate or drop profiles by ref but never add competitors", async () => {
    llm.response = {
      marketOverview: "Specialty coffee is offered by several competitors.",
      competitors: [
        { ref: "C1", type: "direct", strengths: ["Roasts daily", "In Tirana", "extra"], weaknesses: [] },
        { ref: "C1", type: "indirect", strengths: ["duplicate"] },
        { ref: "C9", type: "direct", strengths: ["Invented"] },
      ],
      differentiation: ["Focus on remote workers"],
    };
    const out = await runCompetitorAgent(llmContext(await competitorRun()));
    expect(out.source).toBe("llm");
    expect(out.data.competitors).toHaveLength(1);
    const [rio] = out.data.competitors;
    expect(rio!.name).toBe("Rio Café");
    expect(rio!.type).toBe("direct");
    expect(rio!.website).toBe("https://www.riocafe.al/");
    expect(rio!.strengths).toEqual(["Roasts daily", "In Tirana"]);
    expect(JSON.stringify(out.data)).not.toContain("Invented");
  });

  it("lets the model classify uncertain competitors but not discard an evidence-based classification", async () => {
    const evidenceTypes = (await runCompetitorAgent(llmContext(await competitorRun()))).data.competitors.map((c) => c.type);
    llm.response = {
      competitors: [
        { ref: "C1", type: "uncertain", strengths: [] },
        { ref: "C2", type: "indirect", strengths: [] },
      ],
    };
    const out = await runCompetitorAgent(llmContext(await competitorRun()));
    expect(evidenceTypes[0]).toBe("direct");
    expect(out.data.competitors.map((c) => c.type)).toEqual(["direct", "indirect"]);
  });

  it("returns no competitors, without calling the model, when none could be validated", async () => {
    const out = await runCompetitorAgent(llmContext(await researchRun()));
    expect(out.data.status).toBe("no-results");
    expect(out.data.competitors).toEqual([]);
    expect(llm.prompts).toHaveLength(0);
    expect(multiSearch).not.toHaveBeenCalled();
  });

  it("reports an error when every discovery search failed", async () => {
    const out = await runCompetitorAgent(llmContext(await researchRun({ failing: [...COMPETITOR_DISCOVERY_DIMENSIONS] })));
    expect(out.data.status).toBe("error");
    expect(out.data.competitors).toEqual([]);
  });

  it("keeps the live-search path only when no research was supplied", async () => {
    const out = await runCompetitorAgent(llmContext());
    expect(multiSearch).toHaveBeenCalledTimes(1);
    expect(out.data.status).toBe("ok");
    expect(out.data.available).toBe(true);
    // Offer-relevant hit kept; sector-mismatched bank listing filtered by rejectSearchArtifact.
    expect(out.data.competitors.map((c) => c.website)).toEqual(["https://agent-search.test/a"]);
    expect(out.data.competitors.map((c) => c.name).join(" ")).toMatch(/coffee|rio/i);
    expect(out.data.competitors.some((c) => /bank/i.test(c.name))).toBe(false);
  });

  it("reports no-results when live search returns only irrelevant artifacts", async () => {
    vi.mocked(multiSearch).mockResolvedValueOnce({
      provider: "tavily",
      queries: ["q"],
      results: [
        {
          title: "Best banks near Tirana",
          url: "https://agent-search.test/junk-only",
          snippet: "National banking directory and branch finder.",
        },
      ],
    });
    const out = await runCompetitorAgent(llmContext());
    expect(multiSearch).toHaveBeenCalledTimes(1);
    expect(out.data.status).toBe("no-results");
    expect(out.data.available).toBe(false);
    expect(out.data.competitors).toEqual([]);
  });

  it("reports failed research explicitly instead of searching again", async () => {
    const notConfigured = await runCompetitorAgent(llmContext(await runResearch(input, null)));
    expect(notConfigured.data.status).toBe("search-not-configured");
    expect(notConfigured.data.competitors).toEqual([]);

    const failing = fakeProvider(() => {
      throw new ResearchProviderError("timeout");
    });
    const failed = await runCompetitorAgent(llmContext(await runResearch(input, failing)));
    expect(failed.data.status).toBe("error");
    expect(failed.data.competitors).toEqual([]);
    expect(failed.note).toBe("research-failed");

    expect(multiSearch).not.toHaveBeenCalled();
    expect(llm.prompts).toHaveLength(0);
  });

  it("gives pricing listed competitor prices as evidence and other agents only the comparison", async () => {
    const run = await competitorRun();
    const pricing = await promptFor((c) => runPricingAgent(c), run);
    expect(pricing).toContain("Observed competitor prices (evidence; verbatim, not converted):");
    expect(pricing).toMatch(/- Rio Café \(riocafe\.al\): from 150 ALL · /);
    expect(pricing).toMatch(/- Nomad Hub \(nomadhub\.co\.uk\): from €8\/day · per day · /);
    expect(pricing).not.toContain("Validated competitors");
    expect(pricing).not.toContain("Listing:");
    expect(pricing).not.toMatch(/\b(src|ev|cmp|cl|q)_[0-9a-f]{12}\b/);

    const marketing = await promptFor((c) => runMarketingAgent(c, pkg.brand, pkg.persona), run);
    expect(marketing).toContain("Competitor comparison");
    expect(marketing).not.toContain("Validated competitors");

    const persona = await promptFor((c) => runPersonaAgent(c), run);
    expect(persona).not.toContain("Competitor");
  });
});

describe("market agent with research", () => {
  it("builds market research from the shared research without searching", async () => {
    const run = await researchRun();
    const ctx = llmContext(run);
    ctx.useLlm = false;
    const out = await runMarketAgent(ctx);
    expect(multiSearch).not.toHaveBeenCalled();
    expect(out.data.status).toBe("ok");
    expect(out.data.sources.length).toBeGreaterThan(0);
    const retrieved = new Set(run.status === "failed" ? [] : run.snapshot.sources.map((s) => s.url));
    expect(out.data.sources.every((s) => retrieved.has(s.url))).toBe(true);
    expect(out.data.sources.some((s) => s.url.includes("agent-search.test"))).toBe(false);
  });

  it("keeps only model insights that cite known research sources", async () => {
    llm.response = {
      summary: "Demand for specialty coffee is visible in the research.",
      trends: [
        { insight: "Grounded trend", sources: ["S1"] },
        { insight: "Invented trend", sources: ["S99"] },
        { insight: "Uncited trend", sources: [] },
      ],
      demandSignals: [{ insight: "Raw URL citation", sources: ["https://invented.example/report"] }],
    };
    const out = await runMarketAgent(llmContext(await researchRun()));
    expect(out.source).toBe("llm");
    expect(out.data.trends.map((t) => t.insight)).toEqual(["Grounded trend"]);
    expect(out.data.trends[0]!.sources.every((u) => out.data.sources.some((s) => s.url === u))).toBe(true);
    expect(out.data.demandSignals).toEqual([]);
    expect(out.data.provider).toBe("fake");
    expect(out.data.queries.length).toBeGreaterThan(0);
    expect(multiSearch).not.toHaveBeenCalled();
  });

  it("states partial research and reports failed research without searching", async () => {
    const partialCtx = llmContext(await researchRun({ failing: ["trends"] }));
    partialCtx.useLlm = false;
    expect((await runMarketAgent(partialCtx)).data.summary).toContain("Research was partial");

    const failed = await runMarketAgent(llmContext(await runResearch(input, null)));
    expect(failed.data.status).toBe("search-not-configured");
    expect(failed.data.sources).toEqual([]);
    expect(multiSearch).not.toHaveBeenCalled();
    expect(llm.prompts).toHaveLength(0);
  });

  it("reports no results when research has no market evidence", async () => {
    const out = await runMarketAgent(llmContext(await researchRun({ failing: ["demand", "trends"] })));
    expect(out.data.status).toBe("no-results");
    expect(out.data.sources).toEqual([]);
    expect(multiSearch).not.toHaveBeenCalled();
  });
});

describe("deterministic agents", () => {
  it("SEO stays deterministic and may seed keywords from research without inventing volumes", async () => {
    const pages = pkg.website.pages;
    const without = runSeoAgent(llmContext(), pkg.brand, pages);
    const withResearch = runSeoAgent(llmContext(await researchRun()), pkg.brand, pages);
    expect(without.source).toBe("deterministic");
    expect(withResearch.source).toBe("deterministic");
    expect(withResearch.data.sitemap).toEqual(without.data.sitemap);
    expect(withResearch.data.slugStructure).toEqual(without.data.slugStructure);
    expect(withResearch.data.keywords.length).toBeGreaterThanOrEqual(without.data.keywords.length);
    expect(withResearch.note).toMatch(/seo-heuristics/);
    expect(llm.prompts).toHaveLength(0);
  });
});

describe("generation context", () => {
  it("has no research field when none is supplied", () => {
    expect(createContext(input).research).toBeUndefined();
    expect("research" in createContext(input)).toBe(false);
  });

  it("attaches per-agent projections, never the raw snapshot", async () => {
    const run = await researchRun();
    const ctx = createContext(input, { research: run, now: NOW });
    expect(ctx.research?.market?.status).toBe("complete");
    expect(ctx.research?.design).toBeUndefined();
    expect(JSON.stringify(ctx.research)).not.toContain('"schemaVersion"');
  });
});
