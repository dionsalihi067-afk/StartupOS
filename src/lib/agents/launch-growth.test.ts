import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createContext, type GenerationContext } from "@/lib/agents/context";
import { runGrowthAgent } from "@/lib/agents/growth";
import { runLaunchAgent } from "@/lib/agents/launch";
import { runMarketingAgent } from "@/lib/agents/marketing";
import { marketingLlmSchema } from "@/lib/schemas";
import { discoverySchema, toEngineFields, type Discovery } from "@/lib/discovery";
import { computeFinancials } from "@/lib/finance/model";
import type { BusinessInput } from "@/lib/types";
import { makePackage } from "@/test/db";

const brand = makePackage().brand;

function input(overrides: Partial<{ [K in keyof Discovery]: Partial<Discovery[K]> }>): BusinessInput {
  const d = discoverySchema.parse({
    business: { idea: "A new business", stage: "idea", type: "online", category: "general", location: "Prishtina", ...overrides.business },
    customer: { ideal: "Local customers", type: "b2c", ...overrides.customer },
    offer: { status: "planned" },
    model: { revenue: ["oneTime"], ...overrides.model },
    market: {},
    brand: { style: "Modern / Minimal", tone: "friendly", language: "en" },
    goals: { priority: "launch" },
  });
  return { ...toEngineFields(d), discovery: d };
}

function context(i: BusinessInput): GenerationContext {
  const ctx = createContext(i);
  ctx.useLlm = false;
  return ctx;
}

const allText = (value: unknown) => JSON.stringify(value);

describe("launch plan", () => {
  it("follows the owner's channels: no WhatsApp or ads they never chose", () => {
    const out = runLaunchAgent(context(input({ business: { idea: "Skincare brand", category: "ecommerce" }, model: { revenue: ["oneTime"], channels: ["website", "social"] } })), brand);
    const text = allText(out.data);
    expect(text).not.toMatch(/whatsapp/i);
    expect(text).not.toMatch(/meta ads/i);
    expect(text).toMatch(/checkout, delivery and returns/i);
    expect(text).toMatch(/cosmetic product safety/i);
  });

  it("fits a local service rather than an online shop", () => {
    const out = runLaunchAgent(
      context(input({ business: { idea: "Residential cleaning", category: "services", type: "physical" }, model: { revenue: ["oneTime"], channels: ["direct", "messaging"] } })),
      brand,
    );
    const text = allText(out.data);
    expect(text).toMatch(/service area/i);
    expect(text).toMatch(/booking and quoting/i);
    expect(text).not.toMatch(/checkout/i);
    expect(out.data.launchDay.some((t) => t.channel === "Messaging")).toBe(true);
  });

  it("fits software", () => {
    const text = allText(runLaunchAgent(context(input({ business: { idea: "Scheduling CRM", category: "software" }, model: { revenue: ["subscription"] } })), brand).data);
    expect(text).toMatch(/private beta/i);
    expect(text).toMatch(/personal data protection/i);
  });
});

describe("marketing plan", () => {
  const persona = makePackage().persona;

  it("uses the owner's channels and invents no metrics, prices or social proof", async () => {
    const out = await runMarketingAgent(
      context(input({ business: { idea: "Scheduling CRM", category: "software" }, model: { revenue: ["subscription"], channels: ["website", "direct"] } })),
      brand,
      persona,
    );
    expect(out.data.strategy.channels.map((c) => c.channel)).toEqual(["Website and search", "Direct outreach"]);
    expect(out.data.strategy.channels.reduce((sum, c) => sum + c.budgetPercent, 0)).toBe(100);
    for (const k of out.data.strategy.kpis) expect(k.target).not.toMatch(/\d+\s*%|average/i);
    for (const ad of out.data.facebookAds) expect(ad.estimatedCpc).toBe("");
    const copy = allText([out.data.instagram.map((p) => [p.headline, p.caption, p.hashtags]), out.data.facebookAds.map((a) => [a.primaryText, a.headline, a.description])]);
    expect(copy).not.toMatch(/hundreds|happy customers|loves|limited spots|already loving|#ShopLocal/i);
  });

  it("accepts budget shares written as percentages", () => {
    const parsed = marketingLlmSchema.safeParse({ channels: [{ channel: "Website", budgetPercent: "60%" }, { channel: "Direct", budgetPercent: 40 }] });
    expect(parsed.success && parsed.data.channels?.map((c) => c.budgetPercent)).toEqual([60, 40]);
    // A share that is not a number is never read as one; the channel itself is kept.
    const vague = marketingLlmSchema.parse({ channels: [{ channel: "Website", budgetPercent: "most" }, { channel: "Direct", budgetPercent: "150%" }] });
    expect(vague.channels.map((c) => c.budgetPercent)).toEqual([undefined, undefined]);
    expect(vague.channels.map((c) => c.channel)).toEqual(["Website", "Direct"]);
  });
});

describe("growth plan", () => {
  it("never invents customer counts or conversion benchmarks", async () => {
    const out = await runGrowthAgent(context(input({ business: { idea: "Bakery", category: "food", type: "physical" } })), brand);
    for (const phase of out.data.phases) {
      for (const t of phase.targets) expect(t.value).not.toMatch(/\d/);
      for (const m of phase.milestones) expect(m).not.toMatch(/\d/);
    }
    for (const stage of out.data.salesFunnel) expect(stage.conversionTarget).toBe("Measure baseline");
  });

  it("does not prescribe paid ads when the owner gave no spendable budget", async () => {
    const noBudget = await runGrowthAgent(context(input({ business: { idea: "Freelance design", category: "services" } })), brand);
    const noBudgetText = allText(noBudget.data.phases);
    expect(noBudgetText).not.toMatch(/intro ad campaign|Increase spend|Increase budget on the channel/i);
    expect(noBudgetText).toMatch(/organic/i);

    const withBudget = await runGrowthAgent(
      context(input({ business: { idea: "Freelance design", category: "services" }, model: { revenue: ["oneTime"], budget: "€3,000" } })),
      brand,
    );
    expect(allText(withBudget.data.phases)).toMatch(/intro ad campaign/i);
  });

  it("derives sales targets from the financial model's break-even", async () => {
    const ctx = context(input({ business: { idea: "Skincare brand", category: "ecommerce" } }));
    const assumptions = {
      startupCosts: [{ item: "Stock", amount: 3000, essential: true }],
      monthlyFixedCosts: [{ item: "Tools", amount: 450 }],
      revenueStreams: [{ name: "Serum", unit: "order", price: 25, variableCost: 10, monthlyUnits: { conservative: 10, base: 30, optimistic: 60 } }],
      notes: [],
    };
    ctx.strategy = {
      source: "llm",
      profile: ctx.profile,
      executive: { summary: "", problem: "", solution: "", valueProposition: "", businessModel: "", revenueStreams: [], segments: [], differentiation: [], entryStrategy: "", assumptions: [], risks: [], missingInformation: [], priorities: [] },
      financials: { status: "estimated", basis: "ai-estimate", currency: "EUR", assumptions, results: computeFinancials(assumptions, 8000), limitations: ["aiEstimate"] },
    };
    const out = await runGrowthAgent(ctx, brand);
    const later = out.data.phases.find((p) => p.window === "31-60")!;
    expect(later.targets[0]!.value).toBe("30 order / month (estimated break-even)");
  });
});
