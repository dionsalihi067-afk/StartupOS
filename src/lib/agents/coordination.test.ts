/**
 * Deterministic evaluation of cross-agent handoffs: strategy priorities must
 * shape growth and launch; marketing must consume the persona it is given.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/client", () => ({ generateJson: vi.fn(), isLlmConfigured: () => true }));

import { generateJson } from "@/lib/ai/client";
import { createContext } from "@/lib/agents/context";
import { runGrowthAgent, strategyActionsForWindow } from "@/lib/agents/growth";
import { runLaunchAgent } from "@/lib/agents/launch";
import { personaBrief, runMarketingAgent } from "@/lib/agents/marketing";
import { computeFinancials } from "@/lib/finance/model";
import type { BusinessStrategy, CustomerPersona } from "@/lib/types";
import { makePackage } from "@/test/db";

const pkg = makePackage();

const STRATEGY_ACTION = "Confirm supplier and product safety documents";

function withStrategy() {
  const ctx = createContext(pkg.input);
  ctx.useLlm = false;
  const assumptions = {
    startupCosts: [{ item: "Stock", amount: 3000, essential: true }],
    monthlyFixedCosts: [{ item: "Tools", amount: 450 }],
    revenueStreams: [
      {
        name: "Serum",
        unit: "order",
        price: 25,
        variableCost: 10,
        monthlyUnits: { conservative: 10, base: 30, optimistic: 60 },
      },
    ],
    notes: [],
  };
  const strategy: BusinessStrategy = {
    source: "template",
    profile: ctx.profile,
    executive: {
      summary: "Launch carefully with real supplier checks before spending on ads.",
      problem: "Buyers distrust unverified cosmetics.",
      solution: "Documented safety and a clear first offer.",
      valueProposition: "Honest skincare with traceable suppliers.",
      businessModel: "One-time product sales.",
      revenueStreams: ["Product sales"],
      segments: [{ name: "Busy adults", need: "Simple routines" }],
      differentiation: ["Supplier transparency"],
      entryStrategy: "Start with a small batch and warm network.",
      assumptions: ["Customers will buy after reading safety docs"],
      risks: [{ risk: "Supplier delay", mitigation: "Backup supplier" }],
      missingInformation: ["Exact unit cost"],
      priorities: [
        {
          window: "0-30",
          action: STRATEGY_ACTION,
          priority: "high",
          outcome: "Supplier chosen",
          dependsOn: "",
          resources: "2 weeks",
          metric: "Signed supplier",
          assumption: "",
        },
        {
          window: "31-60",
          action: "Open online store with analytics",
          priority: "high",
          outcome: "Store live",
          dependsOn: "Supplier",
          resources: "€500",
          metric: "Store live",
          assumption: "",
        },
        {
          window: "61-90",
          action: "Run first measured campaign",
          priority: "medium",
          outcome: "First orders",
          dependsOn: "Store",
          resources: "€300",
          metric: "Orders",
          assumption: "",
        },
      ],
    },
    financials: {
      status: "estimated",
      basis: "ai-estimate",
      currency: "EUR",
      assumptions,
      results: computeFinancials(assumptions, 8000),
      limitations: ["aiEstimate"],
    },
  };
  ctx.strategy = strategy;
  return ctx;
}

describe("strategy → growth coordination", () => {
  it("exposes strategy actions per window in priority order", () => {
    const ctx = withStrategy();
    expect(strategyActionsForWindow(ctx, "0-30")).toEqual([STRATEGY_ACTION]);
    expect(strategyActionsForWindow(ctx, "31-60")[0]).toMatch(/online store/i);
  });

  it("puts executive 0-30 actions into growth milestones and objective", async () => {
    const out = await runGrowthAgent(withStrategy(), pkg.brand);
    expect(out.source).toBe("deterministic");
    const first = out.data.phases.find((p) => p.window === "0-30")!;
    expect(first.milestones).toContain(STRATEGY_ACTION);
    expect(first.objective).toContain(STRATEGY_ACTION);
  });

  it("keeps strategy milestones when the LLM rewrites a phase", async () => {
    const ctx = withStrategy();
    ctx.useLlm = true;
    vi.mocked(generateJson).mockResolvedValue({
      source: "llm",
      data: {
        phases: [
          { window: "0-30", title: "Foundation", milestones: ["Website live"], targets: [{ metric: "Paying customers", value: "Measure baseline" }] },
          { window: "31-60", title: "Traction", milestones: ["Referral program live"] },
          { window: "61-90", title: "Scale", milestones: ["Quarterly plan set"] },
        ],
      },
    });
    const out = await runGrowthAgent(ctx, pkg.brand);
    expect(out.source).toBe("llm");
    expect(out.data.phases[0]!.milestones[0]).toBe(STRATEGY_ACTION);
    expect(out.data.phases[0]!.milestones).toContain("Website live");
  });
});

describe("strategy → launch coordination", () => {
  it("adds high-priority 0-30 strategy actions to prelaunch and checklist", () => {
    const out = runLaunchAgent(withStrategy(), pkg.brand);
    expect(out.data.prelaunch.some((t) => t.task === STRATEGY_ACTION)).toBe(true);
    expect(out.data.checklist.some((c) => c.item === STRATEGY_ACTION)).toBe(true);
    expect(out.data.summary).toContain(STRATEGY_ACTION);
  });
});

describe("persona → marketing coordination", () => {
  it("includes persona pain and goals in deterministic messaging", async () => {
    const persona: CustomerPersona = {
      ...pkg.persona,
      name: "Lira",
      goals: ["Find a simple morning routine"],
      painPoints: ["overwhelmed by 10-step routines"],
      occupation: "Nurse",
      age: "28–40",
    };
    const ctx = createContext(pkg.input);
    ctx.useLlm = false;
    const out = await runMarketingAgent(ctx, pkg.brand, persona);
    const messaging = out.data.strategy.messaging.join(" ");
    expect(messaging).toMatch(/overwhelmed by 10-step routines/i);
    expect(messaging).toMatch(/Lira/i);
    expect(messaging).toMatch(/simple morning routine/i);
  });

  it("passes persona facts into the LLM prompt", async () => {
    const persona: CustomerPersona = {
      ...pkg.persona,
      name: "Lira",
      archetype: "The Practical Buyer",
      age: "28–40",
      occupation: "Nurse",
      goals: ["Find a simple morning routine"],
      painPoints: ["overwhelmed by 10-step routines"],
      objections: ["Is it worth the price?"],
    };
    const ctx = createContext(pkg.input);
    ctx.useLlm = true;
    vi.mocked(generateJson).mockClear();
    vi.mocked(generateJson).mockResolvedValue({
      source: "llm",
      data: { positioning: "Calm skincare for busy people.", messaging: ["Simple routines"] },
    });
    await runMarketingAgent(ctx, pkg.brand, persona);
    const call = vi.mocked(generateJson).mock.calls.at(-1)![0]!;
    expect(call.user).toContain(personaBrief(persona));
    expect(call.user).toMatch(/overwhelmed by 10-step routines/i);
    expect(call.system).toMatch(/persona/i);
  });
});
