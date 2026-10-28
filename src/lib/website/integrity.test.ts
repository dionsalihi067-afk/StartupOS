import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createContext } from "@/lib/agents/context";
import { copyBriefFromInput } from "@/lib/agents/copy-brief";
import { runMarketingAgent } from "@/lib/agents/marketing";
import { runPricingAgent } from "@/lib/agents/pricing";
import { detectIndustry } from "@/lib/engine/industry";
import { NO_RESEARCH_EVIDENCE } from "@/lib/pricing/evidence";
import { toPricingStrategy } from "@/lib/pricing/output";
import { buildPricingStrategy, UNPRICED } from "@/lib/pricing/strategy";
import { buildWebsiteSpec } from "@/lib/website/builder";
import { discoverySchema, toEngineFields, type Discovery } from "@/lib/discovery";
import type { BusinessInput } from "@/lib/types";
import { makePackage } from "@/test/db";

function input(overrides: Partial<{ [K in keyof Discovery]: Partial<Discovery[K]> }> = {}): BusinessInput {
  const d = discoverySchema.parse({
    business: { idea: "A new business", stage: "idea", type: "online", category: "general", location: "Prishtina, Kosovo", ...overrides.business },
    customer: { ideal: "Local customers", type: "b2c", ...overrides.customer },
    offer: { status: "planned", ...overrides.offer },
    model: { revenue: ["oneTime"], ...overrides.model },
    market: { ...overrides.market },
    brand: { style: "Modern / Minimal", tone: "friendly", language: "en", ...overrides.brand },
    goals: { priority: "launch", ...overrides.goals },
  });
  return { ...toEngineFields(d), discovery: d };
}

const brand = makePackage().brand;
const persona = makePackage().persona;
const allText = (value: unknown) => JSON.stringify(value);
const FABRICATED =
  /\b(?:trusted by thousands|industry-leading|guaranteed results|most popular|best value|chosen by most|priority support|standard support|personal service|satisfaction guaranteed|\+\d{6,}|@[\w.-]+\.\w+)\b/i;

describe("website integrity", () => {
  it("grounds hero and features in offering, audience and owner facts", () => {
    const i = input({
      business: { name: "Rrota", idea: "Mobile bike repair", offering: "On-site bike repairs", category: "services", type: "physical", stage: "idea", location: "Prishtina, Kosovo" },
      offer: { status: "planned", main: "Flat-rate tune-ups", differentiator: "We come to your office" },
      customer: { ideal: "Office commuters", type: "b2c", problem: "cannot visit a shop mid-week", need: "Same-day fixes" },
    });
    const facts = copyBriefFromInput(i);
    const spec = buildWebsiteSpec({ input: i, brand: { ...brand, name: "Rrota" }, pricing: { model: "", rationale: "", tiers: [], psychology: [], upsells: [] } });
    const text = allText(spec);
    expect(facts.offering).toBe("Flat-rate tune-ups");
    expect(text).toMatch(/Flat-rate tune-ups|Office commuters|We come to your office|cannot visit a shop/i);
    expect(text).toMatch(/Want to learn more about Rrota/i);
    expect(text).not.toMatch(FABRICATED);
    expect(text).not.toMatch(/https?:|wa\.me|tel:/i);
  });

  it("omits fabricated contact details and market claims when location is unknown", () => {
    const i: BusinessInput = {
      idea: "Handmade notebooks",
      audience: "Journal keepers",
      location: "",
      budget: "flexible",
      style: "Modern / Minimal",
    };
    const spec = buildWebsiteSpec({ input: i, brand, pricing: { model: "", rationale: "", tiers: [], psychology: [], upsells: [] } });
    const contact = spec.pages.flatMap((p) => p.sections).find((s) => s.type === "contact" && s.id === "contact");
    expect(contact?.type === "contact" && contact.details).toEqual([]);
    expect(allText(spec)).not.toMatch(/Kosovo|Prishtin|€|EUR|Tirana/i);
    expect(allText(spec)).not.toMatch(FABRICATED);
  });

  it("labels website pricing as suggested and never invents contact channels", () => {
    const i = input({
      business: { idea: "Scheduling CRM", category: "software", type: "online", stage: "preparing" },
      offer: { status: "planned", main: "Monthly scheduling subscriptions", priceRange: "€9-29 per month" },
      model: { revenue: ["subscription"] },
    });
    const pricing = toPricingStrategy(buildPricingStrategy(i, detectIndustry(i.idea), NO_RESEARCH_EVIDENCE));
    const spec = buildWebsiteSpec({ input: i, brand, pricing });
    const pricingSection = spec.pages.flatMap((p) => p.sections).find((s) => s.type === "pricing");
    expect(pricingSection?.type).toBe("pricing");
    if (pricingSection?.type === "pricing") expect(pricingSection.note).toMatch(/Suggested packages/i);
    expect(allText(spec)).not.toMatch(/Most Popular|Chosen by Most|Best Value/i);
  });
});

describe("pricing integrity", () => {
  it("does not invent package features or popularity, and uses quote CTAs when unpriced", () => {
    const i = input({
      business: { idea: "Residential cleaning", category: "services", type: "physical" },
      offer: { status: "planned", main: "Weekly home cleans" },
      model: { revenue: ["oneTime"] },
    });
    const pricing = toPricingStrategy(buildPricingStrategy(i, detectIndustry(i.idea), NO_RESEARCH_EVIDENCE));
    expect(pricing.tiers.every((t) => t.price === UNPRICED)).toBe(true);
    expect(pricing.tiers.map((t) => t.cta)).toEqual(["Request a quote", "Request a quote", "Talk to us"]);
    expect(allText(pricing.tiers)).not.toMatch(/Priority support|Standard support|Personal service|Most Popular|guaranteed/i);
    expect(allText(pricing.tiers)).toMatch(/Weekly home cleans/i);
    expect(allText(pricing.psychology)).toMatch(/strategy, not evidence of popularity/i);
    expect(allText(pricing.psychology)).not.toMatch(/at a discount once/i);
  });

  it("keeps suggested status when prices are anchored, without hardcoding Kosovo", () => {
    const i = input({
      business: { idea: "Online fitness coaching", category: "software", type: "online", location: "Remote" },
      offer: { status: "planned", main: "Coaching subscriptions", priceRange: "€20-40 per month" },
      model: { revenue: ["subscription"] },
    });
    const pricing = toPricingStrategy(buildPricingStrategy(i, detectIndustry(i.idea), NO_RESEARCH_EVIDENCE));
    expect(pricing.grounding?.priceBasis).toBe("ownerRange");
    expect(allText(pricing)).toMatch(/€/);
    expect(allText(pricing)).not.toMatch(/Kosovo/i);
    expect(pricing.tiers.some((t) => t.highlighted)).toBe(true);
    expect(allText(pricing.tiers)).not.toMatch(/Most Popular|Chosen by Most Customers/i);
  });
});

describe("marketing ↔ website ↔ pricing consistency", () => {
  it("keeps offering and location aligned and invents no confirmed prices in marketing", async () => {
    const i = input({
      business: {
        name: "Drita",
        idea: "Specialty coffee for remote workers",
        offering: "Pour-over and workspace seating",
        category: "food",
        type: "physical",
        stage: "preparing",
        location: "Tirana, Albania",
      },
      offer: { status: "planned", main: "Specialty pour-over coffee", differentiator: "Roasted in-house" },
      customer: { ideal: "Remote workers", type: "b2c", problem: "noisy cafés" },
      model: { revenue: ["oneTime"], channels: ["store", "social"], budget: "€5,000" },
    });
    const ctx = createContext(i);
    ctx.useLlm = false;
    const marketing = await runMarketingAgent(ctx, { ...brand, name: "Drita" }, persona);
    const pricing = await runPricingAgent(ctx);
    const website = buildWebsiteSpec({ input: i, brand: { ...brand, name: "Drita" }, pricing: pricing.data });

    expect(allText(marketing.data)).toMatch(/pour-over|coffee|Drita/i);
    expect(allText(marketing.data)).toMatch(/Tirana/i);
    expect(allText(website)).toMatch(/pour-over|coffee|Drita|Tirana/i);
    expect(allText(pricing.data)).toMatch(/pour-over|coffee/i);
    expect(allText(marketing.data)).not.toMatch(/Kosovo/i);
    expect(allText(website)).not.toMatch(/Kosovo/i);
    expect(allText(marketing.data)).not.toMatch(/\b€\d|\d+\s*%\s*off|limited time|testimonial/i);
    expect(pricing.data.grounding?.priceBasis).toBe("none");
    expect(allText(website)).toMatch(/Roasted in-house|Remote workers|noisy/i);
  });
});
