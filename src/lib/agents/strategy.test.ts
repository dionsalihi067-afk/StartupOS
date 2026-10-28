import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const llm = vi.hoisted(() => ({
  prompts: [] as { system: string; user: string }[],
  /** Responses by call kind: the executive call or the financial assumptions call. */
  executive: null as unknown,
  financials: null as unknown,
}));

vi.mock("@/lib/ai/client", () => ({
  isLlmConfigured: () => false,
  generateJson: vi.fn(async (opts: { system: string; user: string }) => {
    llm.prompts.push({ system: opts.system, user: opts.user });
    const isFinance = opts.system.includes("financial planner");
    const response = !isFinance ? llm.executive : Array.isArray(llm.financials) ? llm.financials.shift() : llm.financials;
    return response === null ? { data: null, source: "none", note: "llm-unavailable" } : { data: response, source: "llm" };
  }),
}));

import { createContext } from "@/lib/agents/context";
import { runStrategyAgent } from "@/lib/agents/strategy";
import { discoverySchema, toEngineFields } from "@/lib/discovery";
import type { BusinessInput } from "@/lib/types";

function cosmetics(budget = "€8,000"): BusinessInput {
  const d = discoverySchema.parse({
    business: { idea: "Direct-to-consumer skincare brand", name: "Lume", stage: "idea", type: "online", category: "ecommerce", location: "Kosovo" },
    customer: { ideal: "Adults interested in skincare", type: "b2c" },
    offer: { status: "planned" },
    model: { revenue: ["oneTime"], budget, channels: ["website", "social"] },
    market: {},
    brand: { style: "Modern / Minimal", tone: "calm", language: "en" },
    goals: { priority: "launch" },
  });
  return { ...toEngineFields(d), discovery: d };
}

const executive = {
  summary: "Lume sells a small range of skincare products online to adults in Kosovo, starting with one hero product.",
  problem: "Hard to find trustworthy skincare locally.",
  solution: "A focused online range with clear ingredient information.",
  valueProposition: "Simple, transparent skincare.",
  businessModel: "One-time product sales online.",
  revenueStreams: ["Product sales"],
  segments: [{ name: "Adults interested in skincare", need: "Trustworthy products" }],
  differentiation: ["Ingredient transparency"],
  entryStrategy: "Launch on Instagram with a pre-order list.",
  assumptions: ["Customers will buy skincare online"],
  risks: [{ risk: "Cosmetics rules", mitigation: "Verify notification requirements before selling" }],
  missingInformation: ["Supplier"],
  priorities: [
    { window: "0-30", action: "Confirm supplier and product safety documents", priority: "high", outcome: "Supplier chosen", dependsOn: "", resources: "2 weeks", metric: "Signed supplier", assumption: "" },
    { window: "31-60", action: "Open online store", priority: "high", outcome: "Store live", dependsOn: "Supplier", resources: "€500", metric: "Store live", assumption: "" },
    { window: "61-90", action: "Run first campaign", priority: "medium", outcome: "First orders", dependsOn: "Store", resources: "€300", metric: "Orders", assumption: "" },
  ],
};

const financials = (startupTotal: number) => ({
  startupCosts: [
    { item: "Initial inventory", amount: startupTotal - 1000 },
    { item: "Store setup", amount: 1000 },
  ],
  monthlyFixedCosts: [{ item: "Tools and ads", amount: 400 }],
  revenueStreams: [{ name: "Serum", unit: "order", price: 25, variableCost: 9, monthlyUnits: { conservative: 15, base: 40, optimistic: 90 } }],
  notes: ["Product cost is an estimate until a supplier quotes."],
});

function context(input: BusinessInput, useLlm = true) {
  const ctx = createContext(input);
  ctx.useLlm = useLlm;
  return ctx;
}

beforeEach(() => {
  llm.prompts.length = 0;
  llm.executive = null;
  llm.financials = null;
});

describe("strategy agent", () => {
  it("computes every financial figure from validated assumptions", async () => {
    llm.executive = executive;
    llm.financials = financials(5000);
    const out = await runStrategyAgent(context(cosmetics()));
    expect(out.source).toBe("llm");
    expect(out.note).toBeUndefined();
    const f = out.data.financials;
    expect(f.status).toBe("estimated");
    expect(f.basis).toBe("ai-estimate");
    expect(f.currency).toBe("EUR");
    expect(f.results?.totalStartupCosts).toBe(5000);
    // 400 fixed / (25 - 9) = 25 orders.
    expect(f.results?.breakEven.unitsPerMonth).toBe(25);
    expect(f.results?.budget).toMatchObject({ status: "within", budget: 8000, remainingAfterStartup: 3000 });
    expect(f.limitations).toContain("aiEstimate");
    expect(f.limitations).toContain("pricesUnverified");
    expect(out.data.executive.priorities).toHaveLength(3);
    expect(out.data.profile.modelKind).toBe("product");
  });

  it("passes the owner's budget and model to the language model", async () => {
    llm.executive = executive;
    llm.financials = financials(5000);
    await runStrategyAgent(context(cosmetics()));
    const finance = llm.prompts.find((p) => p.system.includes("financial planner"))!;
    expect(finance.user).toContain("no more than 8000 EUR");
    expect(finance.user).toContain("product");
    expect(finance.system).toContain("Do not calculate");
  });

  it("flags plans that exceed the budget instead of hiding it", async () => {
    llm.executive = executive;
    llm.financials = financials(4000);
    const out = await runStrategyAgent(context(cosmetics("€3,000")));
    expect(out.data.financials.results?.budget.status).toBe("over");
    expect(out.data.financials.limitations).toContain("overBudget");
  });

  it("asks once for a corrected plan when startup costs exceed the budget", async () => {
    llm.executive = executive;
    llm.financials = [financials(3300), financials(2600)];
    const out = await runStrategyAgent(context(cosmetics("€3,000")));
    const financePrompts = llm.prompts.filter((p) => p.system.includes("financial planner"));
    expect(financePrompts).toHaveLength(2);
    expect(financePrompts[1]!.user).toContain("added up to 3300 EUR, which is more than the 3000 EUR budget");
    expect(out.data.financials.results?.budget).toMatchObject({ status: "within", startupCosts: 2600 });
    expect(out.data.financials.limitations).not.toContain("overBudget");
  });

  it("keeps the smaller shortfall and reports it when the correction is still over budget", async () => {
    llm.executive = executive;
    llm.financials = [
      {
        ...financials(3600),
        notes: [
          "This plan fits within the 3000 EUR budget.",
          "Costs stay below the budget.",
          "Kostot fillestare janë brenda buxhetit prej 3000 EUR.",
          "Supplier prices are estimates.",
        ],
      },
      financials(4200),
    ];
    const out = await runStrategyAgent(context(cosmetics("€3,000")));
    expect(llm.prompts.filter((p) => p.system.includes("financial planner"))).toHaveLength(2);
    const f = out.data.financials;
    expect(f.results?.budget).toMatchObject({ status: "over", startupCosts: 3600, shortfall: 600 });
    expect(f.limitations).toContain("overBudget");
    expect(f.assumptions?.notes).toEqual(["Supplier prices are estimates."]);
  });

  it("does not ask for a correction or report a shortfall when the budget is missing", async () => {
    llm.executive = executive;
    llm.financials = [financials(9000), financials(1000)];
    const out = await runStrategyAgent(context(cosmetics("")));
    expect(llm.prompts.filter((p) => p.system.includes("financial planner"))).toHaveLength(1);
    expect(out.data.financials.results?.budget).toMatchObject({ status: "unknown", budget: null, shortfall: null });
    expect(out.data.financials.limitations).toContain("noBudget");
  });

  it("treats an explicit zero budget as zero money, not as a missing budget", async () => {
    llm.executive = executive;
    llm.financials = [financials(1500), financials(1200)];
    const out = await runStrategyAgent(context(cosmetics("0")));
    const prompts = llm.prompts.filter((p) => p.system.includes("financial planner"));
    expect(prompts[0]!.user).toContain("budget 0");
    expect(prompts).toHaveLength(2);
    expect(out.data.financials.results?.budget).toMatchObject({ status: "over", budget: 0, startupCosts: 1200, shortfall: 1200 });
    expect(out.data.financials.limitations).not.toContain("noBudget");
  });

  it("does not reuse competitor prices from another currency as local prices", async () => {
    llm.executive = executive;
    llm.financials = financials(5000);
    const ctx = context(cosmetics());
    ctx.pricing = { model: "Tiered packages", rationale: "", tiers: [{ name: "Entry", price: "$255", cadence: "", description: "", features: [], highlighted: false }], psychology: [], upsells: [] } as never;
    const out = await runStrategyAgent(ctx);
    const finance = llm.prompts.find((p) => p.system.includes("financial planner"))!;
    expect(finance.user).toContain("another currency (USD)");
    expect(finance.user).not.toContain("use these exactly");
    expect(out.data.financials.limitations).toContain("foreignPriceEvidence");
  });

  it("adapts the budget rule when the budget changes", async () => {
    llm.executive = executive;
    llm.financials = financials(2500);
    await runStrategyAgent(context(cosmetics("€3,000")));
    expect(llm.prompts.find((p) => p.system.includes("financial planner"))!.user).toContain("no more than 3000 EUR");
  });

  it("marks financials insufficient on malformed output rather than inventing numbers", async () => {
    llm.executive = executive;
    llm.financials = { startupCosts: "lots", revenueStreams: [] };
    const out = await runStrategyAgent(context(cosmetics()));
    expect(out.data.financials).toMatchObject({ status: "insufficient", basis: "none", results: null, assumptions: null, limitations: ["invalidOutput"] });
    expect(out.note).toBe("financials-unavailable");
  });

  it("keeps a valid financial model when the notes come back as an object (notes:invalid_type in a real run)", async () => {
    llm.executive = executive;
    llm.financials = {
      ...financials(5000),
      notes: { why: "Costs follow typical small-batch suppliers.", uncertain: ["Product cost until a supplier quotes", "Monthly volumes"] },
    };
    const out = await runStrategyAgent(context(cosmetics()));
    expect(out.note).toBeUndefined();
    expect(out.data.financials.status).toBe("estimated");
    expect(out.data.financials.results?.totalStartupCosts).toBe(5000);
    expect(out.data.financials.assumptions?.notes).toEqual([
      "Costs follow typical small-batch suppliers.",
      "Product cost until a supplier quotes",
      "Monthly volumes",
    ]);
  });

  it("reports an unreachable provider as such, not as invalid output, and fills in no figures", async () => {
    llm.executive = executive;
    llm.financials = null;
    const out = await runStrategyAgent(context(cosmetics()));
    expect(out.data.financials).toMatchObject({ status: "insufficient", results: null, assumptions: null, limitations: ["providerUnavailable"] });
    expect(out.note).toBe("financials-unavailable");
  });

  it("falls back to the owner's own answers when the strategy call fails, and says so", async () => {
    llm.financials = financials(5000);
    const out = await runStrategyAgent(context(cosmetics()));
    expect(out.source).toBe("deterministic");
    expect(out.note).toBe("llm-unavailable");
    expect(out.data.source).toBe("template");
    expect(out.data.executive.summary).toContain("Lume");
    expect(out.data.executive.priorities).toEqual([]);
  });

  it("produces no financial figures without a language model", async () => {
    const out = await runStrategyAgent(context(cosmetics(), false));
    expect(llm.prompts).toHaveLength(0);
    expect(out.data.financials).toMatchObject({ status: "insufficient", results: null, limitations: ["noLlm"] });
    expect(out.data.executive.risks).toEqual([]);
  });
});
