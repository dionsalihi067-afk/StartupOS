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
  multiSearch: vi.fn(async () => ({ provider: null, queries: [], results: [] })),
}));

import { createContext, type GenerationContext } from "@/lib/agents/context";
import { runPricingAgent } from "@/lib/agents/pricing";
import { runResearch } from "@/lib/research/engine";
import type { ResearchRunResult } from "@/lib/research/model";
import { multiSearch } from "@/lib/services/search";
import { competitorResults, researchRun, sampleInput } from "@/test/research";

const NOW = new Date("2026-10-08T13:00:00.000Z");
const input = sampleInput();

function context(research?: ResearchRunResult, useLlm = false): GenerationContext {
  const ctx = createContext(input, { research, now: NOW });
  ctx.useLlm = useLlm;
  return ctx;
}

beforeEach(() => {
  llm.prompts.length = 0;
  llm.response = null;
  vi.mocked(multiSearch).mockClear();
});

describe("pricing agent", () => {
  it("grounds the deterministic strategy in validated competitor prices", async () => {
    const out = await runPricingAgent(context(await researchRun({ results: competitorResults() })));
    expect(out.source).toBe("deterministic");
    const { tiers, grounding } = out.data;
    // The only comparable group (one-off prices) is Rio Café's single ALL price; Nomad Hub's per-day price is not compared.
    expect(tiers.map((t) => `${t.name} ${t.price}${t.cadence}`)).toEqual(["Entry 90 ALL", "Standard 150 ALL", "Premium 270 ALL"]);
    expect(grounding?.evidence).toBe("observed");
    expect(grounding?.observations).toEqual([
      { competitor: "Rio Café", domain: "riocafe.al", price: "150 ALL" },
      { competitor: "Nomad Hub", domain: "nomadhub.co.uk", price: "€8/day" },
    ]);
    expect(grounding?.limitations).toContain("Only two competitors publish prices, which is not a market distribution.");
    expect(grounding?.limitations).toContain("Competitor prices use different currencies and were not converted.");
    expect(out.data.rationale).toContain("the one observed price among 1 competitor listing ALL (no billing period stated) prices");
    expect(multiSearch).not.toHaveBeenCalled();
  });

  it("recommends a structure without prices when there is no evidence", async () => {
    for (const [research, status] of [
      [undefined, "notResearched"],
      [await runResearch(input, null), "researchFailed"],
      [await researchRun(), "unavailable"],
    ] as const) {
      const out = await runPricingAgent(context(research));
      expect(out.data.tiers.map((t) => t.price)).toEqual(["To be validated", "To be validated", "To be validated"]);
      expect(out.data.grounding?.evidence).toBe(status);
      expect(out.data.grounding?.observations).toEqual([]);
    }
    expect(multiSearch).not.toHaveBeenCalled();
  });

  it("prompts the model once with pricing evidence, the rules and only pricing research", async () => {
    await runPricingAgent(context(await researchRun({ results: competitorResults() }), true));
    expect(llm.prompts).toHaveLength(1);
    const { system, user } = llm.prompts[0]!;
    expect(system).toContain("Never invent prices");
    expect(user).toContain("PRICING ENGINE");
    expect(user).toContain("Budget (launch constraint only, not a price signal)");
    expect(user).toContain("Recommended tiers (StartupOS strategy, not market data; keep these prices exactly):");
    expect(user).toContain("- Standard: 150 ALL (highlighted)");
    expect(user).not.toMatch(/customerNeeds signal|demand signal|Validated competitors|Listing:/);
    expect(user).not.toMatch(/\b(src|ev|cmp|cl|ps)_[0-9a-f]{12}\b/);
    expect(multiSearch).not.toHaveBeenCalled();
  });

  it("keeps engine prices when the model invents prices", async () => {
    llm.response = {
      rationale: "Competitors charge 200 ALL on average.",
      tiers: [
        { name: "Espresso", price: "999 ALL", tagline: "A quick coffee." },
        { name: "Daily", tagline: "Costs 120 ALL." },
        { name: "Remote day", tagline: "Work all day with refills." },
      ],
      psychology: ["Use 150 ALL as the reference price", "Market standard is 180 ALL"],
      upsells: ["Pastry pairing"],
    };
    const out = await runPricingAgent(context(await researchRun({ results: competitorResults() }), true));
    expect(out.source).toBe("llm");
    expect(out.data.tiers.map((t) => `${t.name} ${t.price}`)).toEqual(["Espresso 90 ALL", "Daily 150 ALL", "Remote day 270 ALL"]);
    expect(out.data.tiers[1]!.tagline).not.toContain("120");
    expect(out.data.rationale).not.toContain("200 ALL");
    expect(out.data.psychology).toEqual(["Use 150 ALL as the reference price"]);
    expect(out.data.grounding?.evidence).toBe("observed");
  });

  it("falls back to the engine output when the model output is unusable", async () => {
    llm.response = { tiers: "not a list" };
    const research = await researchRun({ results: competitorResults() });
    const out = await runPricingAgent(context(research, true));
    expect(out.source).toBe("deterministic");
    expect(out.data).toEqual((await runPricingAgent(context(research))).data);
  });
});
