import { describe, expect, it } from "vitest";
import type { AgentKey, BusinessInput } from "@/lib/types";
import {
  DEPENDENCY_DOMAINS,
  GENERATED_SECTIONS,
  SECTION_DEPENDENCIES,
  getAffectedSections,
  getChangedDependencyDomains,
  isGeneratedSectionId,
  type DependencyDomain,
  type GeneratedSectionId,
} from "@/lib/dependencies";

describe("section dependency architecture", () => {
  it("returns no sections when no domains changed", () => {
    expect(getAffectedSections([])).toEqual([]);
  });

  it("maps a customer change to exactly the customer-dependent sections", () => {
    const expected = GENERATED_SECTIONS.filter((s) => SECTION_DEPENDENCIES[s].some((d) => d === "customer"));
    expect(getAffectedSections(["customer"])).toEqual(expected);
    expect(getAffectedSections(["customer"])).not.toContain("design");
  });

  it("maps a brand change to brand-dependent sections only", () => {
    const result = getAffectedSections(["brand"]);
    expect(result).toEqual(GENERATED_SECTIONS.filter((s) => SECTION_DEPENDENCIES[s].some((d) => d === "brand")));
    expect(result).toContain("brand");
    expect(result).toContain("design");
    expect(result).toContain("logo");
    expect(result).not.toContain("competitor");
    expect(result).not.toContain("growth");
  });

  it("maps a market change to market-dependent sections only", () => {
    const result = getAffectedSections(["market"]);
    // Pricing reads the owner's desired positioning (market.positioning); strategy reads the whole market.
    expect(result).toEqual(["competitor", "market", "pricing", "strategy"]);
    expect(result).not.toContain("email");
  });

  it("maps a goals change to goals-dependent sections only", () => {
    expect(getAffectedSections(["goals"])).toEqual(["strategy", "growth", "launch"]);
  });

  it("unions multiple domains without duplicates", () => {
    const fromCustomer = new Set(getAffectedSections(["customer"]));
    const fromOffer = new Set(getAffectedSections(["offer"]));
    const union = GENERATED_SECTIONS.filter((s) => fromCustomer.has(s) || fromOffer.has(s));
    expect(getAffectedSections(["customer", "offer"])).toEqual(union);
    expect(new Set(getAffectedSections(["customer", "offer"])).size).toBe(union.length);
  });

  it("is deterministic regardless of domain input order", () => {
    const a = getAffectedSections(["customer", "offer", "goals"]);
    const b = getAffectedSections(["goals", "offer", "customer"]);
    expect(a).toEqual(b);
  });

  it("keeps pipeline order even when later domains are listed first", () => {
    const result = getAffectedSections(["goals", "brand"]);
    const indexes = result.map((s) => GENERATED_SECTIONS.indexOf(s));
    expect(indexes).toEqual([...indexes].sort((x, y) => x - y));
  });

  it("registers every generated section as a real AgentKey and omits publisher", () => {
    const agentKeys: AgentKey[] = [
      "brand",
      "design",
      "logo",
      "website",
      "seo",
      "marketing",
      "email",
      "whatsapp",
      "pricing",
      "strategy",
      "competitor",
      "market",
      "persona",
      "growth",
      "launch",
      "publisher",
    ];
    for (const section of GENERATED_SECTIONS) {
      expect(agentKeys).toContain(section);
      expect(isGeneratedSectionId(section)).toBe(true);
    }
    expect(isGeneratedSectionId("publisher")).toBe(false);
    expect((GENERATED_SECTIONS as readonly string[]).includes("publisher")).toBe(false);
  });

  it("covers every dependency domain at least once and uses only known domains", () => {
    const used = new Set<DependencyDomain>();
    for (const section of GENERATED_SECTIONS) {
      for (const domain of SECTION_DEPENDENCIES[section]) {
        expect(DEPENDENCY_DOMAINS).toContain(domain);
        used.add(domain);
      }
    }
    for (const domain of DEPENDENCY_DOMAINS) expect(used.has(domain)).toBe(true);
  });
});

describe("getChangedDependencyDomains", () => {
  const base: BusinessInput = {
    idea: "Coffee shop",
    audience: "Remote workers",
    location: "Tirana",
    budget: "€10,000",
    style: "Modern / Minimal",
  };

  it("detects core-field changes when discovery is absent", () => {
    expect(getChangedDependencyDomains(base, { ...base, audience: "Students" })).toEqual(["customer"]);
    expect(getChangedDependencyDomains(base, { ...base, style: "Bold / Energetic" })).toEqual(["brand"]);
    expect(getChangedDependencyDomains(base, { ...base, budget: "€1" })).toEqual(["model"]);
    expect(getChangedDependencyDomains(base, base)).toEqual([]);
  });

  it("returns empty when two identical discovery payloads are compared", () => {
    const withDiscovery: BusinessInput = {
      ...base,
      discovery: {
        business: {
          name: "Drita",
          idea: base.idea,
          offering: "Coffee",
          stage: "idea",
          type: "physical",
          category: "food",
          location: base.location,
        },
        customer: { ideal: base.audience, type: "b2c", problem: "", need: "", geography: "" },
        offer: {
          main: "Coffee",
          others: "",
          priceRange: "",
          priceUnknown: true,
          differentiator: "",
          status: "planned",
          details: {},
        },
        model: {
          revenue: ["oneTime"],
          budget: base.budget,
          budgetUnknown: false,
          channels: ["store"],
          currentRevenue: "",
          currentCustomers: "",
        },
        market: { competitors: "", alternatives: "", positioning: "", difference: "", challenges: "" },
        brand: {
          style: base.style,
          references: "",
          colors: "",
          avoidColors: "",
          tone: "calm",
          language: "sq",
          notes: "",
        },
        goals: { goal: "", priority: "launch", outcome: "", timeframe: undefined },
      },
    };
    expect(getChangedDependencyDomains(withDiscovery, structuredClone(withDiscovery))).toEqual([]);

    const edited = structuredClone(withDiscovery);
    edited.discovery!.customer.ideal = "Freelancers";
    expect(getChangedDependencyDomains(withDiscovery, edited)).toEqual(["customer"]);
  });
});

/** Compile-time exhaustiveness: every GeneratedSectionId is keyed in the registry. */
const _registryKeys: Record<GeneratedSectionId, unknown> = SECTION_DEPENDENCIES;
void _registryKeys;
