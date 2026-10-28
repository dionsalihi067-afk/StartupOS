import { describe, expect, it } from "vitest";
import { discoverySchema, toEngineFields, type Discovery } from "@/lib/discovery";
import { detectIndustry, detectInputIndustry } from "@/lib/engine/industry";
import { buildBusinessProfile, contextReadiness, parseBudget, renderProfile } from "@/lib/engine/profile";
import type { BusinessInput } from "@/lib/types";

function input(overrides: Partial<{ [K in keyof Discovery]: Partial<Discovery[K]> }>): BusinessInput {
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

describe("parseBudget", () => {
  it("reads common budget formats without inventing money", () => {
    expect(parseBudget("€8,000")).toEqual({ amount: 8000, currency: "EUR", currencyBasis: "provided" });
    expect(parseBudget("8.000 EUR")).toMatchObject({ amount: 8000, currency: "EUR" });
    expect(parseBudget("15000", "Kosovo")).toEqual({ amount: 15000, currency: "EUR", currencyBasis: "assumed" });
    expect(parseBudget("3k")).toMatchObject({ amount: 3000 });
    expect(parseBudget("$2.5k")).toMatchObject({ amount: 2500, currency: "USD" });
    expect(parseBudget("500 000 lekë", "Tirana")).toMatchObject({ amount: 500000, currency: "ALL", currencyBasis: "provided" });
    expect(parseBudget("200000", "Tirana, Albania")).toMatchObject({ currency: "ALL", currencyBasis: "assumed" });
  });

  it("uses the lower bound of a range", () => {
    expect(parseBudget("€5,000-€8,000")?.amount).toBe(5000);
  });

  it("returns null when no amount was given", () => {
    expect(parseBudget("flexible")).toBeNull();
    expect(parseBudget("not sure yet")).toBeNull();
    expect(parseBudget(undefined)).toBeNull();
    expect(parseBudget("")).toBeNull();
  });

  it("reads an explicit zero as a budget of 0, distinct from no budget", () => {
    expect(parseBudget("0", "Kosovo")).toEqual({ amount: 0, currency: "EUR", currencyBasis: "assumed" });
    expect(parseBudget("€0")).toEqual({ amount: 0, currency: "EUR", currencyBasis: "provided" });
    expect(parseBudget("zero")).toMatchObject({ amount: 0 });
    expect(parseBudget("0 lekë", "Tirana")).toMatchObject({ amount: 0, currency: "ALL" });
    expect(parseBudget("asgjë")).toMatchObject({ amount: 0 });
  });

  it("does not read the English word 'all' as Albanian lek", () => {
    expect(parseBudget("3000 all in", "Prishtina")).toMatchObject({ currency: "EUR", currencyBasis: "assumed" });
  });
});

describe("industry detection", () => {
  it("separates cosmetics products from salon services", () => {
    expect(detectIndustry("Natural skincare serums sold online").key).toBe("cosmetics");
    expect(detectIndustry("A nail and lash salon").key).toBe("beauty");
  });

  it("matches whole words, not substrings", () => {
    // "care" inside "skincare" and "bar" inside "barrier" must not pick unrelated profiles.
    expect(detectIndustry("Barrier repair skincare").key).toBe("cosmetics");
  });

  it("uses the discovery category as a tie-breaker, not an override", () => {
    const saas = input({ business: { idea: "Scheduling and CRM tool for small service businesses", category: "software" } });
    expect(detectInputIndustry(saas).key).toBe("tech");
  });
});

describe("buildBusinessProfile", () => {
  it("A: cosmetics D2C e-commerce is a product business with cosmetics safety considerations", () => {
    const i = input({
      business: { idea: "Direct-to-consumer cosmetics and skincare brand", category: "ecommerce", type: "online", stage: "idea" },
      customer: { ideal: "Adults interested in skincare" },
      model: { revenue: ["oneTime"], budget: "€8,000", channels: ["website", "social"] },
    });
    const p = buildBusinessProfile(i);
    expect(p.modelKind).toBe("product");
    expect(p.industryKey).toBe("cosmetics");
    expect(p.budget).toEqual({ amount: 8000, currency: "EUR", currencyBasis: "provided" });
    expect(p.considerations).toContain("cosmeticsSafety");
    expect(p.considerations).toContain("personalData");
    expect(p.facts.find((f) => f.key === "salesChannels")).toMatchObject({ value: "website, social", basis: "provided" });
  });

  it("B: SaaS scheduling/CRM is classified as SaaS", () => {
    const p = buildBusinessProfile(
      input({
        business: { idea: "Scheduling and CRM software for small service businesses", category: "software" },
        customer: { ideal: "Owners of small service businesses", type: "b2b" },
        model: { revenue: ["subscription"], budget: "€15,000" },
      }),
    );
    expect(p.modelKind).toBe("saas");
    expect(p.modelBasis).toBe("provided");
    expect(p.considerations).toContain("personalData");
    expect(p.considerations).not.toContain("cosmeticsSafety");
  });

  it("C: cleaning in Prishtina is a local service", () => {
    const p = buildBusinessProfile(
      input({
        business: { idea: "Residential and commercial cleaning", category: "services", type: "physical" },
        model: { revenue: ["oneTime", "recurring"], budget: "€3,000" },
      }),
    );
    expect(p.modelKind).toBe("localService");
    expect(p.budget?.amount).toBe(3000);
    expect(p.industryKey).not.toBe("beauty");
  });

  it("classifies an auto repair workshop as localService and a web agency as professionalService", () => {
    const workshop = buildBusinessProfile(
      input({
        business: { idea: "Car repair workshop and mechanic services", category: "services", type: "physical" },
        model: { revenue: ["oneTime"], budget: "€5,000" },
      }),
    );
    expect(workshop.modelKind).toBe("localService");

    const agency = buildBusinessProfile(
      input({
        business: { idea: "B2B web development agency for SMEs", category: "services", type: "online" },
        customer: { ideal: "SME owners", type: "b2b" },
        model: { revenue: ["custom"], budget: "€10,000" },
      }),
    );
    expect(agency.modelKind).toBe("professionalService");
  });

  it("D: an unusual idea gets no invented classification", () => {
    const p = buildBusinessProfile(
      input({ business: { idea: "Hand-carved chess sets made from reclaimed wood", category: "general" }, model: { revenue: ["oneTime"] } }),
    );
    expect(["product", "general"]).toContain(p.modelKind);
    expect(p.budget).toBeNull();
    expect(p.missing).toContain("budget");
    expect(p.facts.find((f) => f.key === "budget")?.basis).toBe("unavailable");
  });

  it("does not read soap or chocolate bars as a bar that serves alcohol", () => {
    const soap = buildBusinessProfile(
      input({ business: { idea: "Handmade natural soap bars sold online", category: "ecommerce" }, offer: { main: "Handmade natural soap bars" } }),
    );
    expect(soap.considerations).toContain("cosmeticsSafety");
    expect(soap.considerations).not.toContain("alcoholTobacco");

    const legacy = buildBusinessProfile({ idea: "Chocolate bars and a bar of soap gift box", audience: "Gift buyers", location: "Tirana", budget: "", style: "Modern / Minimal" });
    expect(legacy.modelKind).not.toBe("foodVenue");
    expect(legacy.considerations).not.toContain("alcoholTobacco");

    const cocktailBar = buildBusinessProfile(input({ business: { idea: "A cocktail bar in the old town", category: "food", type: "physical" } }));
    expect(cocktailBar.considerations).toContain("alcoholTobacco");
    expect(buildBusinessProfile(input({ business: { idea: "Wine bars and tasting rooms", category: "food", type: "physical" } })).considerations).toContain("alcoholTobacco");
  });

  it("works without discovery answers (legacy input)", () => {
    const p = buildBusinessProfile({ idea: "Marketplace connecting buyers with local farmers", audience: "Families", location: "Tirana", budget: "flexible", style: "Modern / Minimal" });
    expect(p.modelKind).toBe("marketplace");
    expect(p.sellsOnline).toBeNull();
    expect(p.budget).toBeNull();
  });

  it("renders facts with their basis and lists what is missing", () => {
    const text = renderProfile(buildBusinessProfile(input({ business: { idea: "Bakery", category: "food", type: "physical" } })));
    expect(text).toContain("market: Prishtina, Kosovo (owner-provided)");
    expect(text).toMatch(/Not provided by the owner.*budget/);
  });

  it("keeps a specific owner offer distinct from a broad industry label", () => {
    const p = buildBusinessProfile(
      input({
        business: { idea: "Seasonal streetwear boutique", category: "ecommerce", type: "online" },
        offer: { status: "planned", main: "Seasonal hoodies and limited-drop streetwear" },
      }),
    );
    const offer = p.facts.find((f) => f.key === "offer");
    expect(offer?.value).toMatch(/hoodies|streetwear/i);
    expect(offer?.basis).toBe("provided");
    expect(p.industryKey).toBeTruthy();
    const rendered = renderProfile(p);
    expect(rendered).toMatch(/Prefer the owner offer over the broad industry label/i);
    expect(rendered).toContain(offer!.value);
  });

  it("does not invent missing offer details when the owner left them blank", () => {
    const p = buildBusinessProfile(
      input({
        business: { idea: "A new local shop", category: "general" },
        offer: { status: "planned", main: "" },
      }),
    );
    const offer = p.facts.find((f) => f.key === "offer");
    expect(offer?.value).toBe("A new local shop");
    expect(offer?.basis).toBe("provided");
    expect(p.facts.find((f) => f.key === "budget")?.basis).toBe("unavailable");
  });

  it("contextReadiness never blocks generation and reports material gaps softly", () => {
    const complete = contextReadiness(buildBusinessProfile(input({ business: { idea: "Bakery", category: "food", type: "physical" } })));
    expect(complete.ready).toBe(true);
    expect(complete.blocking).toEqual([]);

    const sparse = contextReadiness(
      buildBusinessProfile({ idea: "Something", audience: "", location: "", budget: "", style: "Modern / Minimal" }),
    );
    expect(sparse.ready).toBe(true);
    expect(sparse.blocking).toEqual(expect.arrayContaining(["customers", "market"]));
  });
});
