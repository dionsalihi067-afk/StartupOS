import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const search = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/search")>()),
  multiSearch: vi.fn(async () => {
    search.calls += 1;
    return { provider: null, queries: [], results: [] };
  }),
}));

import { makePackage } from "@/test/db";
import { makeWebsiteCore } from "@/test/website";
import type { GenerationContext } from "@/lib/agents/context";
import type { VerbalIdentity } from "@/lib/agents/brand";
import { applySectionPatches, applyRegenerationMeta } from "@/lib/regenerate-core";
import { regenerateSelectedSections, type SectionRunner } from "@/lib/regenerate";
import type { GeneratedSectionId } from "@/lib/dependencies";
import { parseBusinessPackage } from "@/lib/package-schema";
import { competitorResults, researchRun } from "@/test/research";

const NOW = new Date("2026-10-08T13:00:00.000Z");

function runnerMap(
  handlers: Partial<Record<GeneratedSectionId, SectionRunner>>,
): SectionRunner {
  return async (section, ctx, verbal) => {
    const handler = handlers[section];
    if (!handler) throw new Error(`unexpected section ${section}`);
    return handler(section, ctx, verbal);
  };
}

describe("regenerateSelectedSections", () => {
  it("isolates failures: successful patches apply, failed sections produce no patch", async () => {
    const pkg = makePackage();
    const before = structuredClone(pkg);

    const runner = runnerMap({
      website: async () => ({
        patch: {
          section: "website",
          website: makeWebsiteCore("Regen Home"),
        },
        output: { data: null, source: "deterministic" },
      }),
      marketing: async () => {
        throw new Error("marketing boom");
      },
      seo: async () => ({
        patch: {
          section: "seo",
          seo: { ...pkg.website.seo, title: "Regen SEO" },
        },
        output: { data: null, source: "deterministic" },
      }),
    });

    const result = await regenerateSelectedSections(pkg, ["website", "marketing", "seo"], runner);

    expect(result.succeeded).toEqual(["website", "seo"]);
    expect(result.failed).toEqual(["marketing"]);
    expect(result.patches.map((p) => p.section)).toEqual(["website", "seo"]);

    const merged = applyRegenerationMeta(applySectionPatches(pkg, result.patches), result.outcomes);
    expect(merged.website.pages[0]?.title).toBe("Regen Home");
    expect(merged.website.seo.title).toBe("Regen SEO");
    expect(merged.marketing).toEqual(before.marketing);
    expect(merged.brand).toEqual(before.brand);
    expect(merged.pricing).toEqual(before.pricing);
  });

  it("runs selected sections in canonical pipeline order", async () => {
    const order: GeneratedSectionId[] = [];
    const runner: SectionRunner = async (section) => {
      order.push(section);
      if (section === "persona") {
        return {
          patch: { section: "persona", persona: { ...makePackage().persona, name: "Sam" } },
          output: { data: null, source: "deterministic" },
        };
      }
      return {
        patch: { section: "pricing", pricing: { ...makePackage().pricing, model: "x" } },
        output: { data: null, source: "deterministic" },
      };
    };

    await regenerateSelectedSections(makePackage(), ["pricing", "persona"], runner);
    expect(order).toEqual(["persona", "pricing"]);
  });

  it("seeds upstream context from the existing package for dependent agents", async () => {
    const pkg = makePackage({
      brand: { ...makePackage().brand, name: "Existing Brand" },
      persona: { ...makePackage().persona, name: "Existing Persona" },
    });
    let seenBrand: string | undefined;
    let seenPersona: string | undefined;

    const runner: SectionRunner = async (section, ctx: GenerationContext, _verbal: VerbalIdentity) => {
      seenBrand = ctx.brand?.name;
      seenPersona = ctx.persona?.name;
      return {
        patch: {
          section: "marketing",
          marketing: {
            strategy: { ...pkg.marketing.strategy, positioning: "from-context" },
            instagram: [],
            facebookAds: [],
          },
        },
        output: { data: null, source: "deterministic" },
      };
    };

    await regenerateSelectedSections(pkg, ["marketing"], runner);
    expect(seenBrand).toBe("Existing Brand");
    expect(seenPersona).toBe("Existing Persona");
  });
});

describe("regenerateSelectedSections with research", () => {
  const marketingPatch = (pkg: ReturnType<typeof makePackage>) => ({
    patch: {
      section: "marketing" as const,
      marketing: { strategy: { ...pkg.marketing.strategy, positioning: "regenerated" }, instagram: [], facebookAds: [] },
    },
    output: { data: null, source: "deterministic" as const },
  });

  it("gives the selected agent the same research projection as full generation", async () => {
    const pkg = makePackage();
    const research = await researchRun();
    let seen: GenerationContext["research"];
    const runner: SectionRunner = async (_section, ctx) => {
      seen = ctx.research;
      return marketingPatch(pkg);
    };

    const result = await regenerateSelectedSections(pkg, ["marketing"], runner, { research, now: NOW });
    expect(result.succeeded).toEqual(["marketing"]);
    expect(seen?.marketing?.status).toBe("complete");
    expect(seen?.marketing?.facts.length).toBeGreaterThan(0);
    expect(seen?.marketing?.facts.every((f) => ["customer", "positioning", "market"].includes(f.category))).toBe(true);
    expect(seen?.design).toBeUndefined();
  });

  it("still works without research", async () => {
    const pkg = makePackage();
    let seen: GenerationContext["research"] | "unset" = "unset";
    const runner: SectionRunner = async (_section, ctx) => {
      seen = ctx.research;
      return marketingPatch(pkg);
    };
    const result = await regenerateSelectedSections(pkg, ["marketing"], runner);
    expect(result.succeeded).toEqual(["marketing"]);
    expect(seen).toBeUndefined();
  });

  it("runs only the selected sections and leaves unrelated sections unchanged", async () => {
    const pkg = makePackage();
    const before = structuredClone(pkg);
    const ran: GeneratedSectionId[] = [];
    const runner: SectionRunner = async (section) => {
      ran.push(section);
      return marketingPatch(pkg);
    };

    const result = await regenerateSelectedSections(pkg, ["marketing"], runner, { research: await researchRun(), now: NOW });
    expect(ran).toEqual(["marketing"]);

    const merged = applySectionPatches(pkg, result.patches);
    expect(merged.marketing.strategy.positioning).toBe("regenerated");
    expect(merged.brand).toEqual(before.brand);
    expect(merged.pricing).toEqual(before.pricing);
    expect(merged.competitors).toEqual(before.competitors);
    expect(merged.marketResearch).toEqual(before.marketResearch);
    expect(merged.persona).toEqual(before.persona);
    expect(pkg).toEqual(before);
  });
});

describe("regenerating competitors and pricing with competitor intelligence", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rebuilds only the competitor section from validated research through the default runner", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    search.calls = 0;
    const pkg = makePackage();
    const before = structuredClone(pkg);
    const research = await researchRun({ results: competitorResults() });

    const result = await regenerateSelectedSections(pkg, ["competitor"], undefined, { research, now: NOW });
    expect(result.succeeded).toEqual(["competitor"]);
    expect(search.calls).toBe(0);

    const merged = applySectionPatches(pkg, result.patches);
    expect(merged.competitors.status).toBe("ok");
    expect(merged.competitors.competitors.map((c) => c.name)).toEqual(["Rio Café", "Nomad Hub", "Tea House Tirana", "Mulliri Vjetër"]);
    expect(merged.competitors.competitors.map((c) => c.type)).toEqual(["direct", "direct", "uncertain", "uncertain"]);
    expect(parseBusinessPackage(merged)).not.toBeNull();
    for (const key of ["brand", "persona", "pricing", "marketResearch", "marketing", "website"] as const) {
      expect(merged[key]).toEqual(before[key]);
    }
  });

  it("rebuilds only the pricing section from validated competitor prices through the default runner", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    search.calls = 0;
    const pkg = makePackage();
    const before = structuredClone(pkg);

    const result = await regenerateSelectedSections(pkg, ["pricing"], undefined, {
      research: await researchRun({ results: competitorResults() }),
      now: NOW,
    });
    expect(result.succeeded).toEqual(["pricing"]);
    expect(search.calls).toBe(0);

    const merged = applySectionPatches(pkg, result.patches);
    expect(merged.pricing.grounding?.evidence).toBe("observed");
    expect(merged.pricing.grounding?.observations.map((o) => o.price)).toEqual(["150 ALL", "€8/day"]);
    expect(parseBusinessPackage(merged)).not.toBeNull();
    for (const key of ["brand", "persona", "competitors", "marketResearch", "marketing", "website"] as const) {
      expect(merged[key]).toEqual(before[key]);
    }
  });

  it("keeps the previous pricing when pricing regeneration fails", async () => {
    const pkg = makePackage();
    const before = structuredClone(pkg);
    const runner: SectionRunner = async () => {
      throw new Error("pricing boom");
    };
    const result = await regenerateSelectedSections(pkg, ["pricing"], runner, {
      research: await researchRun({ results: competitorResults() }),
      now: NOW,
    });
    expect(result.failed).toEqual(["pricing"]);
    expect(applySectionPatches(pkg, result.patches).pricing).toEqual(before.pricing);
  });

  it("keeps the previous competitor analysis when regeneration fails", async () => {
    const pkg = makePackage();
    const before = structuredClone(pkg);
    const runner: SectionRunner = async () => {
      throw new Error("competitor boom");
    };
    const result = await regenerateSelectedSections(pkg, ["competitor"], runner, {
      research: await researchRun({ results: competitorResults() }),
      now: NOW,
    });
    expect(result.failed).toEqual(["competitor"]);
    expect(applySectionPatches(pkg, result.patches).competitors).toEqual(before.competitors);
  });
});

describe("regenerating the website", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rebuilds only the website, with a valid specification, through the default runner", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    search.calls = 0;
    const pkg = makePackage();
    const before = structuredClone(pkg);

    const result = await regenerateSelectedSections(pkg, ["website"], undefined, { research: await researchRun(), now: NOW });
    expect(result.succeeded).toEqual(["website"]);
    expect(search.calls).toBe(0);

    const merged = applySectionPatches(pkg, result.patches);
    expect(merged.website.spec?.pages[0]?.slug).toBe("/");
    expect(merged.website.spec?.siteName).toBe("Kafeja");
    expect(merged.website.pages.map((p) => p.slug)).toEqual(merged.website.spec?.pages.map((p) => p.slug));
    expect(merged.website.seo).toEqual(before.website.seo);
    expect(parseBusinessPackage(merged)).not.toBeNull();
    for (const key of ["brand", "persona", "pricing", "competitors", "marketResearch", "marketing", "growth", "launch"] as const) {
      expect(merged[key]).toEqual(before[key]);
    }
  });

  it("keeps the previous website when website regeneration fails", async () => {
    const pkg = makePackage({ website: { ...makePackage().website, ...makeWebsiteCore("Old Home") } });
    const before = structuredClone(pkg);
    const runner: SectionRunner = async () => {
      throw new Error("website boom");
    };
    const result = await regenerateSelectedSections(pkg, ["website"], runner, { now: NOW });
    expect(result.failed).toEqual(["website"]);
    expect(applySectionPatches(pkg, result.patches).website).toEqual(before.website);
  });
});
