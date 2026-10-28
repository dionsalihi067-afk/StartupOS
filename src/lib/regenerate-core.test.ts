import { describe, expect, it } from "vitest";
import { makePackage } from "@/test/db";
import { makeWebsiteCore } from "@/test/website";
import { GENERATED_SECTIONS, getAffectedSections, SECTION_DEPENDENCIES } from "@/lib/dependencies";
import {
  applySectionPatch,
  applySectionPatches,
  normalizeSectionSelection,
  verbalFromBrand,
  type SectionPatch,
} from "@/lib/regenerate-core";

describe("normalizeSectionSelection", () => {
  it("accepts valid generated sections and returns pipeline order", () => {
    expect(normalizeSectionSelection(["marketing", "website", "marketing"])).toEqual({
      ok: true,
      sections: ["website", "marketing"],
    });
  });

  it("rejects publisher, unknown ids, empty lists, and non-arrays", () => {
    expect(normalizeSectionSelection([])).toEqual({ ok: false, reason: "empty" });
    expect(normalizeSectionSelection("website")).toEqual({ ok: false, reason: "invalid" });
    expect(normalizeSectionSelection(["publisher"])).toEqual({ ok: false, reason: "invalid" });
    expect(normalizeSectionSelection(["website", "nope"])).toEqual({ ok: false, reason: "invalid" });
    expect(normalizeSectionSelection([123])).toEqual({ ok: false, reason: "invalid" });
  });

  it("is deterministic for the same set regardless of input order", () => {
    const a = normalizeSectionSelection(["launch", "brand", "seo"]);
    const b = normalizeSectionSelection(["seo", "launch", "brand"]);
    expect(a).toEqual(b);
  });
});

describe("scoped package merge", () => {
  it("regenerating one section leaves unrelated sections intact", () => {
    const pkg = makePackage();
    const before = structuredClone(pkg);
    const next = applySectionPatch(pkg, {
      section: "pricing",
      pricing: { ...pkg.pricing, model: "New model", rationale: "Fresh" },
    });

    expect(next.pricing.model).toBe("New model");
    expect(next.brand).toEqual(before.brand);
    expect(next.website).toEqual(before.website);
    expect(next.marketing).toEqual(before.marketing);
    expect(next.persona).toEqual(before.persona);
    expect(next.competitors).toEqual(before.competitors);
    expect(next.marketResearch).toEqual(before.marketResearch);
    expect(next.growth).toEqual(before.growth);
    expect(next.launch).toEqual(before.launch);
    expect(next.input).toEqual(before.input);
  });

  it("updates website and marketing together while preserving the rest", () => {
    const pkg = makePackage();
    const before = structuredClone(pkg);
    const patches: SectionPatch[] = [
      {
        section: "website",
        website: makeWebsiteCore("New Home"),
      },
      {
        section: "marketing",
        marketing: {
          strategy: { ...pkg.marketing.strategy, positioning: "New positioning" },
          instagram: [],
          facebookAds: [],
        },
      },
    ];
    const next = applySectionPatches(pkg, patches);

    expect(next.website.pages[0]?.title).toBe("New Home");
    expect(next.website.seo).toEqual(before.website.seo);
    expect(next.marketing.strategy.positioning).toBe("New positioning");
    expect(next.marketing.email).toEqual(before.marketing.email);
    expect(next.marketing.whatsapp).toEqual(before.marketing.whatsapp);
    expect(next.brand).toEqual(before.brand);
    expect(next.pricing).toEqual(before.pricing);
    expect(next.launch).toEqual(before.launch);
  });

  it("preserves logo when applying a design patch", () => {
    const pkg = makePackage({
      brand: {
        ...makePackage().brand,
        logo: {
          generated: true,
          imageUrl: "https://example.test/logo.png",
          iconUrl: "https://example.test/icon.png",
          prompt: "p",
          model: "m",
          status: "generated",
          concept: "c",
        },
      },
    });
    const redesigned = {
      ...pkg.brand,
      slogan: "Redesigned",
      logo: {
        generated: false,
        imageUrl: "",
        iconUrl: "",
        prompt: "",
        model: null,
        status: "unavailable" as const,
        concept: "should not win",
      },
    };
    const next = applySectionPatch(pkg, { section: "design", brand: redesigned });
    expect(next.brand.slogan).toBe("Redesigned");
    expect(next.brand.logo.imageUrl).toBe("https://example.test/logo.png");
    expect(next.brand.logo.generated).toBe(true);
  });

  it("points a website patch built before a logo change at the saved logo, not the replaced one", () => {
    const logo = (n: number) => ({
      generated: true,
      imageUrl: `/api/assets/ast_${String(n).repeat(32)}`,
      iconUrl: `/api/assets/ast_${String(n).repeat(32)}`,
      prompt: "p",
      model: "m",
      status: "generated" as const,
      concept: "c",
    });
    const base = makePackage();
    const before = makePackage({ brand: { ...base.brand, logo: logo(1) }, website: { ...base.website, ...makeWebsiteCore("Old Home") } });
    const staleWebsite = makeWebsiteCore("New Home");
    staleWebsite.spec = { ...staleWebsite.spec!, theme: { ...staleWebsite.spec!.theme, logoUrl: logo(1).imageUrl } };

    const latest = applySectionPatch(before, { section: "logo", logo: logo(2) });
    expect(latest.website.spec?.theme.logoUrl).toBe(logo(2).imageUrl);

    const next = applySectionPatch(latest, { section: "website", website: staleWebsite });
    expect(next.website.pages[0]?.title).toBe("New Home");
    expect(next.website.spec?.theme.logoUrl).toBe(logo(2).imageUrl);
    expect(JSON.stringify(next)).not.toContain(logo(1).imageUrl);
  });

  it("applies brand verbal fields without wiping palette or logo", () => {
    const pkg = makePackage();
    const verbal = {
      ...verbalFromBrand(pkg.brand),
      name: "Nova",
      slogan: "Fresh start",
      logoConcept: "A spark",
    };
    const next = applySectionPatch(pkg, { section: "brand", verbal });
    expect(next.brand.name).toBe("Nova");
    expect(next.brand.slogan).toBe("Fresh start");
    expect(next.brand.palette).toEqual(pkg.brand.palette);
    expect(next.brand.typography).toEqual(pkg.brand.typography);
    expect(next.brand.logo.concept).toBe("A spark");
  });
});

describe("dependency integration for regeneration offers", () => {
  it("maps a customer domain change to the registry's customer-dependent sections", () => {
    const expected = GENERATED_SECTIONS.filter((s) => SECTION_DEPENDENCIES[s].some((d) => d === "customer"));
    expect(getAffectedSections(["customer"])).toEqual(expected);
    expect(getAffectedSections([])).toEqual([]);
  });
});
