import { describe, expect, it } from "vitest";
import { detectIndustry } from "@/lib/engine/industry";
import { NO_RESEARCH_EVIDENCE } from "@/lib/pricing/evidence";
import type { PricingEvidence } from "@/lib/pricing/model";
import { mentionsOnlyKnownPrices, mergeLlmPricing, toPricingStrategy } from "@/lib/pricing/output";
import { renderPricingContext } from "@/lib/pricing/prompt";
import { buildPricingStrategy } from "@/lib/pricing/strategy";
import { parseBusinessPackage } from "@/lib/package-schema";
import { makePackage } from "@/test/db";
import { pricingEvidence } from "@/test/pricing";
import { sampleInput } from "@/test/research";

const input = sampleInput({
  business: { idea: "Online fitness coaching app", category: "software", type: "online" },
  model: { revenue: ["subscription"] },
});
const engine = (evidence: PricingEvidence = NO_RESEARCH_EVIDENCE) => buildPricingStrategy(input, detectIndustry(input.idea), evidence);
const evidence = pricingEvidence([
  { name: "Alpha", prices: ["€19/month"] },
  { name: "Beta", prices: ["€29/month"] },
  { name: "Gamma", prices: ["€59/month"] },
  { name: "Delta" },
]);

describe("package mapping", () => {
  it("keeps the existing PricingStrategy shape and adds grounding", () => {
    const pricing = toPricingStrategy(engine(evidence));
    expect(pricing.tiers.map((t) => `${t.name} ${t.price}${t.cadence}`)).toEqual(["Starter €17.50/month", "Growth €29/month", "Pro €52/month"]);
    expect(pricing.grounding).toMatchObject({
      evidence: "observed",
      priceBasis: "competitorEvidence",
      observations: [
        { competitor: "Alpha", domain: "competitor1.example", price: "€19/month" },
        { competitor: "Beta", domain: "competitor2.example", price: "€29/month" },
        { competitor: "Gamma", domain: "competitor3.example", price: "€59/month" },
      ],
    });
    expect(pricing.grounding!.signals[0]).toBe("3 of 4 validated competitors publish prices.");
    expect(pricing.psychology).toContain("Publish prices clearly; 3 of 4 competitors found do.");
    expect(parseBusinessPackage({ ...makePackage(), pricing })?.pricing).toEqual(pricing);
  });

  it("states the evidence status for every research outcome", () => {
    expect(toPricingStrategy(engine()).grounding?.evidence).toBe("notResearched");
    expect(toPricingStrategy(engine({ research: "failed", competitors: [] })).grounding?.evidence).toBe("researchFailed");
    expect(toPricingStrategy(engine(pricingEvidence([{}]))).grounding?.evidence).toBe("unavailable");
  });

  it("still parses packages stored before grounding existed", () => {
    const old = makePackage();
    delete (old.pricing as { grounding?: unknown }).grounding;
    expect(parseBusinessPackage(old)?.pricing.grounding).toBeUndefined();
  });
});

describe("model copy", () => {
  it("accepts text with no prices or only known prices", () => {
    const allowed = new Set(["EUR|29", "ALL|150"]);
    expect(mentionsOnlyKnownPrices("Simple monthly plans.", allowed)).toBe(true);
    expect(mentionsOnlyKnownPrices("Growth at €29/month.", allowed)).toBe(true);
    expect(mentionsOnlyKnownPrices("Espresso from 150 ALL.", allowed)).toBe(true);
    expect(mentionsOnlyKnownPrices("Only €25/month.", allowed)).toBe(false);
    expect(mentionsOnlyKnownPrices("Only $29/month.", allowed)).toBe(false);
    expect(mentionsOnlyKnownPrices("Backed by €2 million in funding.", allowed)).toBe(false);
  });

  it("keeps engine prices and drops model text with invented prices", () => {
    const result = engine(evidence);
    const base = toPricingStrategy(result);
    const merged = mergeLlmPricing(result, base, {
      rationale: "The market average is €39/month, so plans sit below it.",
      tiers: [
        { name: "Starter", price: "€5", cadence: "/week", tagline: "Start for €9/month.", features: ["3 workouts a week", "Costs €12"], cta: "Join" },
        { name: "Plus", price: "€99", tagline: "Most complete plan at €29/month.", features: ["Weekly check-ins"] },
        { name: "Elite €199", tagline: "Coaching with a personal trainer." },
      ],
      psychology: ["Anchor against the €99 market standard", "Highlight the middle plan"],
      upsells: ["Nutrition plan add-on"],
    });
    expect(merged.tiers.map((t) => `${t.price}${t.cadence}`)).toEqual(base.tiers.map((t) => `${t.price}${t.cadence}`));
    expect(merged.tiers.map((t) => t.highlighted)).toEqual(base.tiers.map((t) => t.highlighted));
    expect(merged.rationale).toBe(base.rationale);
    expect(merged.tiers[0]).toMatchObject({ name: "Starter", tagline: base.tiers[0]!.tagline, features: ["3 workouts a week"], cta: "Join" });
    expect(merged.tiers[1]).toMatchObject({ name: "Plus", tagline: "Most complete plan at €29/month." });
    expect(merged.tiers[2]!.name).toBe("Pro");
    expect(merged.psychology).toEqual(["Highlight the middle plan"]);
    expect(merged.upsells).toEqual(["Nutrition plan add-on"]);
    expect(merged.grounding).toEqual(base.grounding);
  });

  it("appends the price basis to the model's rationale", () => {
    const result = engine(evidence);
    const merged = mergeLlmPricing(result, toPricingStrategy(result), { rationale: "Three simple plans keep the choice easy." });
    expect(merged.rationale).toBe(`Three simple plans keep the choice easy. ${result.basisNote}`);
  });
});

describe("pricing prompt context", () => {
  it("separates observed evidence from the recommended tiers and carries the rules", () => {
    const text = renderPricingContext(engine(evidence));
    expect(text).toContain("Observed competitor prices (evidence; verbatim, not converted):");
    expect(text).toContain("- Alpha (competitor1.example): €19/month · per month · \"€19/month\"");
    expect(text).toContain("Recommended tiers (StartupOS strategy, not market data; keep these prices exactly):");
    expect(text).toContain("Never invent competitor prices, market averages, price ranges or 'market standard' prices.");
    expect(text).not.toMatch(/\b(src|ev|cmp|ps)_[0-9a-f]{12}\b/);
  });

  it("says when no competitor prices are available", () => {
    const text = renderPricingContext(engine());
    expect(text).toContain("Observed competitor prices: none available.");
    expect(text).not.toContain("Pricing signals");
  });
});
