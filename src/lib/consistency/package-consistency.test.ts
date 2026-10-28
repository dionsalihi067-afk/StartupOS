import { describe, expect, it } from "vitest";
import { assessPackageConsistency, hasConsistencyErrors } from "@/lib/consistency/package-consistency";
import type { BusinessPackage } from "@/lib/types";
import { sampleInput } from "@/test/research";

/** Minimal package shaped for consistency checks only (not a full schema fixture). */
function pkg(over: Record<string, unknown> = {}): BusinessPackage {
  const input = sampleInput({
    business: {
      name: "Veshje",
      idea: "Online clothing brand selling streetwear",
      type: "online",
      category: "ecommerce",
      location: "Prishtina, Kosovo",
    },
    customer: { ideal: "Young adults 18-30", type: "b2c" },
  });
  return {
    id: "biz_test",
    createdAt: new Date().toISOString(),
    input,
    brand: {
      name: "Veshje",
      slogan: "Streetwear for the city",
      description: "Streetwear clothing for young adults in Kosovo.",
      personality: ["bold"],
      values: ["local"],
      voice: "direct",
      palette: [],
      typography: { heading: "Inter", body: "Inter", googleFontsHref: "" },
      logo: { status: "placeholder" },
    },
    website: {
      pages: [{ slug: "/", title: "Home", metaDescription: "Streetwear", sections: [{ id: "h1", type: "hero", heading: "Streetwear clothing" }] }],
      seo: { title: "Veshje", metaDescription: "Streetwear", ogTitle: "Veshje", keywords: ["streetwear"], sitemap: ["/"], jsonLd: {} },
      navItems: [],
      footerColumns: [],
    },
    marketing: {
      strategy: {
        positioning: "Streetwear for Kosovo youth",
        messaging: ["Wear local"],
        channels: [],
        kpis: [],
        contentPillars: [],
      },
      instagram: [
        { id: "1", format: "single", headline: "New drop", caption: "Fresh streetwear hoodies in Prishtina.", cta: "Shop", hashtags: [], creativeSvg: "" },
        { id: "2", format: "single", headline: "City fit", caption: "Built for nights out in the city.", cta: "See more", hashtags: [], creativeSvg: "" },
      ],
      facebookAds: [],
      email: { sequences: [] },
      whatsapp: { name: "chat", goal: "help", nodes: [] },
    },
    competitors: {
      available: true,
      status: "ok",
      provider: "test",
      queries: [],
      marketOverview: "Local clothing",
      competitors: [
        {
          name: "Urban Thread",
          type: "direct",
          category: "clothing",
          description: "Clothing boutique in Prishtina",
          website: "https://urban.example",
          strengths: [],
          weaknesses: [],
        },
      ],
      swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
      differentiation: [],
      opportunityGaps: [],
      sources: [],
    },
    marketResearch: { status: "ok", provider: null, queries: [], insights: [], sources: [] },
    pricing: { model: "retail", rationale: "Unit retail pricing with gross margin", tiers: [], psychology: [], upsells: [] },
    persona: { name: "A", archetype: "", age: "20", occupation: "student", bio: "", goals: [], painPoints: [], channels: [], objections: [], quote: "" },
    salesFunnel: [],
    growth: [],
    launch: { checklist: [], timeline: [] },
    strategy: {
      executive: {
        summary: "Streetwear brand for young adults in Kosovo.",
        problem: "Hard to find local streetwear",
        solution: "Online clothing drops",
        valueProposition: "Local streetwear",
        businessModel: "Product retail",
        revenueStreams: ["product sales"],
        segments: [{ name: "Youth", need: "Clothes" }],
        differentiation: ["local"],
        entryStrategy: "Instagram",
        assumptions: [],
        risks: [],
        missingInformation: [],
        priorities: [],
      },
      financials: { status: "insufficient", basis: "none", currency: "EUR", assumptions: null, results: null, limitations: [] },
    },
    meta: { engine: "deterministic", searchProvider: null, durationMs: 1, agentLog: [] },
    ...over,
  } as unknown as BusinessPackage;
}

describe("assessPackageConsistency", () => {
  it("rejects a bank listed as a clothing competitor", () => {
    const issues = assessPackageConsistency(
      pkg({
        competitors: {
          available: true,
          status: "ok",
          provider: "test",
          queries: [],
          marketOverview: "",
          competitors: [
            {
              name: "Raiffeisen Bank",
              type: "direct",
              category: "banking",
              description: "Retail banking services in Kosovo",
              website: "https://bank.example",
              strengths: [],
              weaknesses: [],
            },
          ],
          swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
          differentiation: [],
          opportunityGaps: [],
          sources: [],
        },
      }),
    );
    expect(issues.some((i) => i.id === "offSectorCompetitor")).toBe(true);
    expect(hasConsistencyErrors(issues)).toBe(true);
  });

  it("rejects directory/map aggregators listed as clothing competitors", () => {
    const issues = assessPackageConsistency(
      pkg({
        competitors: {
          available: true,
          status: "ok",
          provider: "test",
          queries: [],
          marketOverview: "",
          competitors: [
            {
              name: "Find Local Businesses",
              type: "uncertain",
              category: "",
              description: "Find clothing stores in Fushë-Kosova. Listings include Moda Italia Store.",
              website: "https://www.findglocal.com/XK/Fush%C3%AB-Kosova/245321-6",
              strengths: [],
              weaknesses: [],
            },
            {
              name: "MapQuest",
              type: "uncertain",
              category: "",
              description: "Kosovo Grocery, Bronx NY — printable directions",
              website: "https://www.mapquest.com/us/new-york/kosovo-grocery-541322577",
              strengths: [],
              weaknesses: [],
            },
          ],
          swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
          differentiation: [],
          opportunityGaps: [],
          sources: [],
        },
      }),
    );
    expect(issues.filter((i) => i.id === "platformCompetitor")).toHaveLength(2);
    expect(hasConsistencyErrors(issues)).toBe(true);
  });

  it("flags fabricated market claims", () => {
    const base = pkg();
    const issues = assessPackageConsistency(
      pkg({ brand: { ...base.brand, description: "Trusted by thousands of customers across the region." } }),
    );
    expect(issues.some((i) => i.id === "fabricatedMarketClaim")).toBe(true);
  });

  it("flags duplicate social captions", () => {
    const base = pkg();
    const issues = assessPackageConsistency(
      pkg({
        marketing: {
          ...base.marketing,
          instagram: [
            { id: "1", format: "single", headline: "A", caption: "Same caption here.", cta: "Go", hashtags: [], creativeSvg: "" },
            { id: "2", format: "single", headline: "B", caption: "Same caption here.", cta: "Go", hashtags: [], creativeSvg: "" },
          ],
        },
      }),
    );
    expect(issues.some((i) => i.id === "duplicateSocialPosts")).toBe(true);
  });

  it("passes a coherent clothing package", () => {
    expect(hasConsistencyErrors(assessPackageConsistency(pkg()))).toBe(false);
  });
});
