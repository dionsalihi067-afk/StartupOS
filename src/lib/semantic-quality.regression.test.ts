/**
 * Business-specific semantic consistency regressions (deterministic; no live providers).
 * Fixtures A/B/C from the verification phase — assert sector fit across profile,
 * competitors, strategy, pricing, marketing, and website without hardcoding answers
 * into production logic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { assessPackageConsistency, hasConsistencyErrors } from "@/lib/consistency/package-consistency";
import { buildBusinessProfile, contextReadiness } from "@/lib/engine/profile";
import { assessGenerationQuality } from "@/lib/generation-quality";
import { orchestrate } from "@/lib/orchestrator";
import { parseBusinessPackage } from "@/lib/package-schema";
import type { ResearchEvidence, ResearchSource } from "@/lib/research/model";
import { validateCandidate } from "@/lib/research/competitors/validate";
import type { BusinessPackage, OrchestrationEvent } from "@/lib/types";
import { sampleInput } from "@/test/research";

beforeEach(() => {
  for (const key of ["OPENAI_API_KEY", "TAVILY_API_KEY", "SERPER_API_KEY", "BRAVE_API_KEY"]) vi.stubEnv(key, "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function generate(input: ReturnType<typeof sampleInput>): Promise<BusinessPackage> {
  let result: BusinessPackage | undefined;
  for await (const event of orchestrate(input) as AsyncGenerator<OrchestrationEvent>) {
    if (event.type === "complete") result = event.result;
    if (event.type === "error") throw new Error("generation failed");
  }
  if (!result) throw new Error("generation did not complete");
  return result;
}

function candidate(url: string, title: string, excerpt: string): [ResearchSource, ResearchEvidence] {
  const source: ResearchSource = {
    id: "src_sem_001",
    url,
    domain: new URL(url).hostname.replace(/^www\./, ""),
    title,
    snippet: excerpt,
    retrievedAt: "2026-10-27T12:00:00.000Z",
    queryIds: ["localCompetitors"],
  };
  return [source, { id: "ev_sem_001", sourceId: source.id, excerpt, category: "competitor", queryIds: ["localCompetitors"] }];
}

/** Invented contact / social-proof patterns that must not appear when the owner gave none. */
const FABRICATED_CONTACT =
  /\b(?:\+?\d{2,3}[\s.-]?\d{2,3}[\s.-]?\d{3,4}[\s.-]?\d{3,4}|trusted by (?:thousands|millions)|guaranteed results|"[^"]{20,}"\s*—\s*[A-Z][a-z]+ [A-Z][a-z]+)\b/i;

describe("semantic quality regressions A/B/C", () => {
  describe("A — clothing boutique in Fushë Kosovë", () => {
    const input = sampleInput({
      business: {
        name: "Atelier FK",
        idea: "Clothing boutique selling women's and men's apparel",
        type: "physical",
        category: "ecommerce",
        location: "Fushë Kosovë, Kosovo",
        offering: "Clothing and accessories",
      },
      customer: { ideal: "Local adults shopping for everyday fashion", type: "b2c", geography: "Fushë Kosovë" },
      offer: { main: "Ready-to-wear clothing", priceUnknown: true },
      model: { revenue: ["oneTime"], budgetUnknown: true },
      market: {},
    });

    it("distinguishes provided facts from missing information", () => {
      const profile = buildBusinessProfile(input);
      expect(["product", "localService", "general"]).toContain(profile.modelKind);
      const readiness = contextReadiness(profile);
      expect(readiness.ready).toBe(true);
      expect(profile.facts.some((f) => f.key === "market" && f.basis === "provided")).toBe(true);
      // Owner marked price unknown — priceRange must not be labelled as a provided fact.
      const price = profile.facts.find((f) => f.key === "priceRange");
      expect(!price || price.basis !== "provided" || !price.value.trim()).toBe(true);
      expect(profile.missing.length).toBeGreaterThan(0);
    });

    it("rejects banks, newspapers, and unrelated marketplaces as clothing competitors", () => {
      const terms = ["clothing", "boutique", "apparel", "fashion", "veshje"];
      expect(
        validateCandidate(
          ...candidate("https://bank.example/", "TEB Bank Kosovo", "Retail banking and loans in Fushë Kosovë."),
          terms,
        ),
      ).toMatchObject({ ok: false, reason: "irrelevant" });
      expect(
        validateCandidate(
          ...candidate("https://news.example/", "Kosovo Daily Newspaper", "Regional newspaper covering Fushë Kosovë fashion week."),
          terms,
        ),
      ).toMatchObject({ ok: false, reason: "irrelevant" });
      expect(
        validateCandidate(...candidate("https://amazon.com/fashion", "Amazon Fashion", "Marketplace clothing."), terms),
      ).toMatchObject({ ok: false, reason: "platform" });
    });

    it("flags off-sector competitors in package consistency", () => {
      const base = {
        id: "biz_fk",
        createdAt: new Date().toISOString(),
        input,
        brand: {
          name: "Atelier FK",
          slogan: "Local fashion",
          description: "Clothing boutique in Fushë Kosovë.",
          personality: [],
          values: [],
          voice: "warm",
          palette: [],
          typography: { heading: "Inter", body: "Inter", googleFontsHref: "" },
          logo: { status: "placeholder" },
        },
        website: {
          pages: [{ slug: "/", title: "Home", metaDescription: "Boutique", sections: [{ id: "h", type: "hero", heading: "Clothing boutique" }] }],
          seo: { title: "Atelier FK", metaDescription: "Boutique", ogTitle: "Atelier FK", keywords: ["clothing"], sitemap: ["/"], jsonLd: {} },
          navItems: [],
          footerColumns: [],
        },
        marketing: {
          strategy: { positioning: "Local clothing", messaging: ["Apparel"], channels: [], kpis: [], contentPillars: [] },
          instagram: [{ id: "1", format: "single", headline: "New", caption: "Fresh clothing arrivals in Fushë Kosovë.", cta: "Visit", hashtags: [], creativeSvg: "" }],
          facebookAds: [],
          email: { sequences: [] },
          whatsapp: { name: "chat", goal: "help", nodes: [] },
        },
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
              description: "Banking services in Kosovo",
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
        marketResearch: { status: "ok", provider: null, queries: [], insights: [], sources: [] },
        pricing: { model: "retail", rationale: "Unit retail pricing", tiers: [], psychology: [], upsells: [] },
        persona: { name: "A", archetype: "", age: "28", occupation: "", bio: "", goals: [], painPoints: [], channels: [], objections: [], quote: "" },
        salesFunnel: [],
        growth: [],
        launch: { checklist: [], timeline: [] },
        strategy: {
          executive: {
            summary: "Clothing boutique",
            problem: "Limited local fashion choice",
            solution: "Curated apparel",
            valueProposition: "Local clothing",
            businessModel: "Retail product",
            revenueStreams: ["product sales"],
            segments: [{ name: "Locals", need: "Clothes" }],
            differentiation: ["local"],
            entryStrategy: "Walk-in",
            assumptions: [],
            risks: [],
            missingInformation: [],
            priorities: [],
          },
          financials: { status: "insufficient", basis: "none", currency: "EUR", assumptions: null, results: null, limitations: [] },
        },
        meta: { engine: "deterministic", searchProvider: null, durationMs: 1, agentLog: [] },
      } as unknown as BusinessPackage;

      const issues = assessPackageConsistency(base);
      expect(issues.some((i) => i.id === "offSectorCompetitor")).toBe(true);
      expect(hasConsistencyErrors(issues)).toBe(true);
      expect(assessGenerationQuality(base).limitations).toContain("consistencyWarnings");
    });

    it("deterministic generation keeps Fushë Kosovë clothing context and does not invent contacts", { timeout: 120_000 }, async () => {
      const pkg = await generate(input);
      const parsed = parseBusinessPackage(pkg);
      expect(parsed).not.toBeNull();
      const p = parsed!;
      expect(p.input.location).toMatch(/Fushë Kosovë/i);
      expect(p.input.idea).toMatch(/clothing|apparel|boutique/i);
      expect(p.competitors.available).toBe(false);
      expect(p.competitors.competitors).toEqual([]);
      const blob = JSON.stringify(p);
      expect(blob).not.toMatch(FABRICATED_CONTACT);
      expect(blob).not.toMatch(/\b(?:Raiffeisen|TEB Bank|newspaper)\b/i);
      expect(hasConsistencyErrors(assessPackageConsistency(p))).toBe(false);
    });
  });

  describe("B — local B2B web-development agency", () => {
    const input = sampleInput({
      business: {
        name: "Studio Kodra",
        idea: "B2B web development agency building websites and digital services for local businesses",
        type: "online",
        category: "services",
        location: "Prishtina, Kosovo",
        offering: "Website development, landing pages, and related digital services",
      },
      customer: { ideal: "Local SMEs that need a professional website", type: "b2b", geography: "Kosovo" },
      offer: { main: "Custom website development projects", status: "planned" },
      model: { revenue: ["oneTime"], channels: ["website", "partners"] },
    });

    it("classifies as a professional service and keeps agency language across deliverables", { timeout: 120_000 }, async () => {
      const profile = buildBusinessProfile(input);
      expect(profile.modelKind).toBe("professionalService");

      const pkg = await generate(input);
      const p = parseBusinessPackage(pkg)!;
      expect(p.input.idea).toMatch(/web development|digital/i);
      expect(p.input.discovery?.customer.type).toBe("b2b");

      const blob = `${JSON.stringify(p.strategy)}\n${JSON.stringify(p.pricing)}\n${JSON.stringify(p.marketing)}\n${JSON.stringify(p.website)}\n${JSON.stringify(p.growth)}`;
      expect(blob.toLowerCase()).toMatch(/web|website|digital|agency|project|client/);
      expect(blob).not.toMatch(/subscription\s+MRR|seat-based SaaS|monthly recurring software/i);
      expect(hasConsistencyErrors(assessPackageConsistency(p))).toBe(false);
    });
  });

  describe("C — small SaaS product", () => {
    const input = sampleInput({
      business: {
        name: "FaturaGo",
        idea: "SaaS invoicing software for freelancers with subscription access",
        type: "online",
        category: "software",
        location: "Berlin, Germany",
        offering: "Cloud invoicing and payment tracking software",
      },
      customer: { ideal: "Freelancers and solo operators", type: "b2c", geography: "Europe" },
      offer: { main: "Monthly subscription to invoicing software", status: "planned" },
      model: { revenue: ["subscription"], channels: ["website"] },
    });

    it("classifies as SaaS and keeps subscription economics in generated package", { timeout: 120_000 }, async () => {
      const profile = buildBusinessProfile(input);
      expect(profile.modelKind).toBe("saas");

      const pkg = await generate(input);
      const p = parseBusinessPackage(pkg)!;
      expect(p.input.discovery?.model.revenue).toContain("subscription");

      const pricingBlob = JSON.stringify(p.pricing).toLowerCase();
      const strategyBlob = JSON.stringify(p.strategy).toLowerCase();
      const growthBlob = JSON.stringify(p.growth).toLowerCase();
      const combined = `${pricingBlob}\n${strategyBlob}\n${growthBlob}\n${JSON.stringify(p.marketing).toLowerCase()}`;
      expect(combined).toMatch(/subscription|seat|month|mrr|arr|tier|plan|trial|onboard|retention|churn/);
      expect(combined).not.toMatch(/wholesale inventory|menu item|cover charge|walk-in retail shelf/i);
      expect(hasConsistencyErrors(assessPackageConsistency(p))).toBe(false);
    });
  });
});
