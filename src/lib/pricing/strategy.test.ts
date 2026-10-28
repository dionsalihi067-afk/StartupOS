import { describe, expect, it } from "vitest";
import { detectIndustry } from "@/lib/engine/industry";
import { NO_RESEARCH_EVIDENCE } from "@/lib/pricing/evidence";
import type { PricingEvidence } from "@/lib/pricing/model";
import { toPricingStrategy } from "@/lib/pricing/output";
import { buildPricingStrategy, CUSTOM_QUOTE, readPositioning, UNPRICED } from "@/lib/pricing/strategy";
import type { BusinessInput } from "@/lib/types";
import { pricingEvidence } from "@/test/pricing";
import { sampleInput } from "@/test/research";

const strategy = (input: BusinessInput, evidence: PricingEvidence = NO_RESEARCH_EVIDENCE) =>
  buildPricingStrategy(input, detectIndustry(input.idea), evidence);
const prices = (r: ReturnType<typeof strategy>) => r.tiers.map((t) => `${t.price}${t.cadence}`);

const subscription = (overrides: Parameters<typeof sampleInput>[0] = {}) =>
  sampleInput({
    business: { idea: "Online fitness coaching app", category: "software", type: "online" },
    model: { revenue: ["subscription"] },
    ...overrides,
  });
const monthlyEur = pricingEvidence([{ prices: ["€19/month"] }, { prices: ["€29/month"] }, { prices: ["€59/month"] }]);

describe("pricing strategy without evidence", () => {
  it("leaves prices unpriced instead of inventing them", () => {
    const r = strategy(sampleInput());
    expect(r.anchor).toEqual({ basis: "none", reason: "noEvidence" });
    expect(r.tiers.map((t) => t.price)).toEqual([UNPRICED, UNPRICED, UNPRICED]);
    expect(r.tiers.every((t) => t.value === null && t.cadence === "")).toBe(true);
    expect(r.confidence).toBe("low");
    expect(r.limitations).toContain("No research was supplied, so no competitor pricing evidence was used.");
    expect(r.limitations.at(-1)).toMatch(/^Willingness to pay has not been researched/);
  });

  it("never uses the budget as a price", () => {
    const low = strategy(sampleInput({ model: { revenue: ["oneTime"], budget: "€100" } }));
    const high = strategy(sampleInput({ model: { revenue: ["oneTime"], budget: "€5000" } }));
    expect(high.tiers).toEqual(low.tiers);
    expect(JSON.stringify(toPricingStrategy(high))).not.toContain("5000");
  });

  it("never assumes a currency from the location", () => {
    const r = strategy(sampleInput({ business: { location: "Tirana" }, offer: { priceRange: "300-600" } }));
    expect(r.currency).toEqual({ currency: null, currencySymbol: null, basis: null });
    expect(prices(r)).toEqual(["300", "450", "600"]);
    expect(r.limitations).toContain("No currency was stated, so prices are shown without one.");
  });

  it("uses a custom-quote placeholder for custom pricing", () => {
    const r = strategy(sampleInput({ model: { revenue: ["custom"] } }));
    expect(r.model).toBe("Custom quotes with reference packages");
    expect(r.tiers.map((t) => t.price)).toEqual([CUSTOM_QUOTE, CUSTOM_QUOTE, CUSTOM_QUOTE]);
  });
});

describe("subscription pricing", () => {
  it("anchors on the median monthly entry price with three competitors", () => {
    const r = strategy(subscription(), monthlyEur);
    expect(r.model).toBe("Tiered subscription (good-better-best)");
    expect(r.anchor).toMatchObject({ basis: "competitorEvidence", method: "median", reference: 29 });
    expect(r.currency).toMatchObject({ currency: "EUR", basis: "competitorEvidence" });
    expect(r.tiers.map((t) => t.name)).toEqual(["Starter", "Growth", "Pro"]);
    expect(prices(r)).toEqual(["€17.50/month", "€29/month", "€52/month"]);
    expect(r.tiers.find((t) => t.highlighted)?.name).toBe("Growth");
    expect(r.confidence).toBe("medium");
    expect(r.limitations).toContain("No price positioning was stated, so a mid-market position was assumed.");
    expect(r.rationale).toContain("not observed market prices");
  });

  it("positions premium above and accessible below the observed prices", () => {
    const premium = strategy(subscription({ market: { positioning: "Premium, high-end coaching" } }), monthlyEur);
    const accessible = strategy(subscription({ market: { positioning: "Affordable for students" } }), monthlyEur);
    expect(premium.anchor).toMatchObject({ method: "high", reference: 59 });
    expect(prices(premium)).toEqual(["€44/month", "€74/month", "€133/month"]);
    expect(accessible.anchor).toMatchObject({ method: "low", reference: 19 });
    expect(prices(accessible)).toEqual(["€11/month", "€18/month", "€32/month"]);
    expect(premium.rationale).toContain("premium position");
  });

  it("does not compare monthly plans with yearly or one-time prices", () => {
    const r = strategy(subscription(), pricingEvidence([{ prices: ["€290/year"] }, { prices: [["€99", "Lifetime €99 one-time"]] }]));
    expect(r.anchor).toEqual({ basis: "none", reason: "incompatible" });
    expect(r.tiers.every((t) => t.price === UNPRICED)).toBe(true);
    expect(r.limitations.join(" ")).toContain("different billing basis");
  });

  it("does not anchor on competitor prices in another currency than the owner's budget", () => {
    const r = strategy(subscription({ model: { revenue: ["subscription"], budget: "€8,000" } }), pricingEvidence([{ prices: ["£22/month"] }, { prices: ["£30/month"] }]));
    expect(r.anchor).toEqual({ basis: "none", reason: "otherCurrency" });
    expect(r.tiers.every((t) => t.price === UNPRICED)).toBe(true);
    expect(r.limitations.join(" ")).toContain("different currency from the owner's budget");
    const sameCurrency = strategy(subscription({ model: { revenue: ["subscription"], budget: "€8,000" } }), monthlyEur);
    expect(sameCurrency.anchor).toMatchObject({ basis: "competitorEvidence" });
    const noStatedCurrency = strategy(subscription({ model: { revenue: ["subscription"], budget: "8000" } }), pricingEvidence([{ prices: ["£22/month"] }]));
    expect(noStatedCurrency.anchor).toMatchObject({ basis: "competitorEvidence" });
  });

  it("calls one priced competitor a single data point", () => {
    const r = strategy(subscription(), pricingEvidence([{ prices: ["€25/month"] }, {}]));
    expect(r.anchor).toMatchObject({ method: "single", reference: 25 });
    expect(r.confidence).toBe("low");
    expect(r.limitations).toContain("Only one competitor publishes prices: a single data point, not a market range.");
  });

  it("supports freemium and per-seat plans from the owner's own price", () => {
    const r = strategy(
      subscription({ offer: { priceRange: "€10-30 per month", details: { pricingModel: ["freemium", "perSeat"] } } }),
      monthlyEur,
    );
    expect(r.anchor.basis).toBe("ownerRange");
    expect(r.tiers.map((t) => t.name)).toEqual(["Free", "Growth", "Pro"]);
    expect(prices(r)).toEqual(["Free", "€20/user/month", "€30/user/month"]);
  });

  it("follows a hybrid model with the recurring part as the tier structure", () => {
    const r = strategy(subscription({ model: { revenue: ["oneTime", "subscription"] } }));
    expect(r.revenue).toEqual({ primary: "subscription", secondary: ["oneTime"], stated: true });
    expect(toPricingStrategy(r).upsells[0]).toBe("One-time add-ons sold alongside the main offer");
  });

  it("prices one-off sales with repeat purchases as an add-on, not as monthly plans", () => {
    const shop = sampleInput({ business: { idea: "Skincare brand", category: "ecommerce", type: "online" }, model: { revenue: ["oneTime", "recurring"] } });
    const r = strategy(shop, pricingEvidence([{ prices: ["€18"] }, { prices: ["€24"] }, { prices: ["€30"] }]));
    expect(r.revenue).toEqual({ primary: "oneTime", secondary: ["recurring"], stated: true });
    expect(r.model).toBe("Tiered packages (good-better-best)");
    expect(prices(r).every((p) => !p.includes("month"))).toBe(true);
    expect(toPricingStrategy(r).upsells[0]).toBe("A recurring plan for regular customers");
  });
});

describe("service, one-time and commission pricing", () => {
  const service = (overrides: Parameters<typeof sampleInput>[0] = {}) =>
    sampleInput({ business: { idea: "Wedding photography", category: "services", type: "physical" }, model: { revenue: ["oneTime"] }, ...overrides });

  it("prices service packages from one-off competitor prices", () => {
    const r = strategy(service(), pricingEvidence([{ prices: ["€800"] }, { prices: ["€1.200"] }, { prices: ["€1.500"] }]));
    expect(r.model).toBe("Tiered packages (good-better-best)");
    expect(r.tiers.map((t) => t.name)).toEqual(["Basic", "Standard", "Premium"]);
    expect(prices(r)).toEqual(["€720", "€1200", "€2160"]);
  });

  it("does not anchor one-off packages on monthly competitor prices", () => {
    const r = strategy(service(), monthlyEur);
    expect(r.anchor).toEqual({ basis: "none", reason: "incompatible" });
  });

  it("uses the owner's expected price and currency before competitor evidence", () => {
    const r = strategy(service({ offer: { priceRange: "1500 deri 3000 lekë" } }), monthlyEur);
    expect(r.currency).toMatchObject({ currency: "ALL", basis: "ownerRange" });
    expect(prices(r)).toEqual(["1500 ALL", "2250 ALL", "3000 ALL"]);
    expect(r.basisNote).toContain("owner's own estimate rather than market data");
  });

  it("ignores the price range when the owner has not decided one", () => {
    const r = strategy(service({ offer: { priceRange: "€500", priceUnknown: true } }));
    expect(r.anchor.basis).toBe("none");
  });

  it("leaves commission rates to be validated unless the owner stated one", () => {
    const none = strategy(sampleInput({ model: { revenue: ["commission"] } }), monthlyEur);
    expect(none.model).toBe("Commission-based pricing");
    expect(none.anchor).toEqual({ basis: "none", reason: "commission" });
    expect(none.tiers.map((t) => [t.name, t.price])).toEqual([["Standard", UNPRICED], ["Featured", UNPRICED]]);

    const stated = strategy(sampleInput({ model: { revenue: ["commission"] }, offer: { priceRange: "10-15%" } }));
    expect(prices(stated)).toEqual(["10% per sale", "15% per sale"]);
  });

  it("keeps the previous category-based structure for legacy inputs", () => {
    const legacy: BusinessInput = { ...sampleInput(), discovery: undefined };
    expect(strategy(legacy).revenue.stated).toBe(false);
  });
});

describe("positioning", () => {
  it("reads positioning from the owner's answers and states conflicts", () => {
    expect(readPositioning("Luxury experience", "")).toEqual({ tier: "premium", basis: "ownerPositioning", conflicting: false });
    expect(readPositioning("", "Çmime të përballueshme")).toEqual({ tier: "accessible", basis: "ownerDifferentiator", conflicting: false });
    expect(readPositioning("Premium quality at the cheapest prices", "")).toEqual({ tier: null, basis: "ownerPositioning", conflicting: true });
    expect(readPositioning("", "")).toEqual({ tier: null, basis: null, conflicting: false });
  });

  it("applies no positioning when it conflicts", () => {
    const r = strategy(subscription({ market: { positioning: "Premium quality at the cheapest prices" } }), monthlyEur);
    expect(r.anchor).toMatchObject({ method: "median" });
    expect(r.limitations).toContain("The stated positioning names conflicting price levels, so no price positioning was applied.");
  });
});
