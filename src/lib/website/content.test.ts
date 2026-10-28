import { describe, expect, it } from "vitest";
import { buildWebsiteSpec } from "@/lib/website/builder";
import { isSafeCopy, mergeWebsiteContent } from "@/lib/website/content";
import { specFromLegacy, toWebsiteCore, websiteSpecOf } from "@/lib/website/legacy";
import { parseWebsiteSpec, type WebsiteSpec } from "@/lib/website/model";
import { makePackage } from "@/test/db";
import { sampleInput } from "@/test/research";

const pkg = makePackage();
const base = buildWebsiteSpec({
  input: sampleInput({
    customer: { ideal: "Remote workers", need: "Quiet space" },
    offer: { main: "Espresso", others: "Pastries", differentiator: "Roasted daily" },
    brand: { language: "en" },
  }),
  brand: pkg.brand,
  pricing: pkg.pricing,
});
const sectionOf = <T extends WebsiteSpec["pages"][number]["sections"][number]["type"]>(spec: WebsiteSpec, type: T) =>
  spec.pages.flatMap((p) => p.sections).find((s): s is Extract<typeof s, { type: T }> => s.type === type);

describe("model copy safety", () => {
  it("accepts plain grounded copy", () => {
    expect(isSafeCopy("Coffee roasted every morning for people who work remotely.")).toBe(true);
    expect(isSafeCopy("Kafe e pjekur çdo mëngjes.")).toBe(true);
  });

  it("rejects unsupported claims, prices, links, contacts and markup", () => {
    for (const unsafe of [
      "Trusted by 500 customers",
      "Over 10 years of experience",
      "Rated 5 stars",
      "★★★★★",
      "Award-winning espresso",
      "Certified organic",
      "Satisfaction guaranteed",
      "The #1 café in Tirana",
      "98% of guests return",
      "Mbi 10 vjet përvojë",
      "Espresso from €2",
      "Only 150 ALL per cup",
      "Visit https://example.com",
      "Write to hello@example.com",
      "Call +355 69 123 4567",
      "<script>alert(1)</script>",
      "javascript:alert(1)",
      "Official partner of Nestlé",
      "Licensed and insured since 2019",
      "As seen in Forbes",
      "ISO 9001 certified",
      "Rruga e Dibrës 12",
      "Open Mon–Fri 08:00–18:00",
      "Case study: Ana grew revenue 40%",
    ]) {
      expect(isSafeCopy(unsafe), unsafe).toBe(false);
    }
  });
});

describe("merging model copy into the deterministic structure", () => {
  it("rewrites text without changing pages, sections, links or offers", () => {
    const merged = mergeWebsiteContent(base, {
      hero: { heading: "Coffee for focused mornings", subheading: "Espresso and pastries for remote workers." },
      features: [{ title: "Roasted daily", description: "Fresh beans every morning." }],
      offer: [{ description: "Rich, balanced shots." }, { description: "Baked fresh." }],
      faq: [{ question: "What do you serve?", answer: "Espresso and pastries." }],
      cta: { heading: "Come by for a coffee" },
      pages: [{ slug: "/", seoTitle: "Kafeja — Coffee for focused mornings", seoDescription: "Espresso and pastries for remote workers." }],
    });
    expect(merged.pages.map((p) => [p.slug, p.sections.map((s) => s.type)])).toEqual(base.pages.map((p) => [p.slug, p.sections.map((s) => s.type)]));
    expect(merged.navigation).toEqual(base.navigation);
    expect(merged.primaryCta).toEqual(base.primaryCta);
    expect(sectionOf(merged, "hero")).toMatchObject({ heading: "Coffee for focused mornings", primaryCta: base.primaryCta });
    expect(sectionOf(merged, "offer")?.items).toEqual([
      { title: "Espresso", description: "Rich, balanced shots." },
      { title: "Pastries", description: "Baked fresh." },
    ]);
    expect(merged.pages[0]!.seo).toMatchObject({ title: "Kafeja — Coffee for focused mornings", canonicalPath: "/" });
    expect(parseWebsiteSpec(merged)).toEqual(merged);
  });

  it("discards unsafe or surplus model copy and keeps the deterministic text", () => {
    const merged = mergeWebsiteContent(base, {
      hero: { heading: "Trusted by 1,000 customers", subheading: "Call +355 69 123 4567" },
      features: [
        { title: "Rated 5 stars", description: "Award-winning" },
        { title: "Certified", description: "Guaranteed results" },
        { title: "Extra benefit", description: "Invented" },
      ],
      offer: [{ description: "Only €2" }, { description: "x" }, { description: "Invented third item" }],
      faq: [{ question: "Where?", answer: "Visit www.example.com" }],
      pages: [{ slug: "/", seoTitle: "x".repeat(200) }, { slug: "/new-page", seoTitle: "Injected" }],
    });
    expect(sectionOf(merged, "hero")).toEqual(sectionOf(base, "hero"));
    expect(sectionOf(merged, "features")).toEqual(sectionOf(base, "features"));
    expect(sectionOf(merged, "offer")?.items).toHaveLength(2);
    expect(sectionOf(merged, "faq")?.items[0]).toEqual(sectionOf(base, "faq")?.items[0]);
    expect(merged.pages.map((p) => p.slug)).toEqual(base.pages.map((p) => p.slug));
    expect(merged.pages[0]!.seo.title.length).toBeLessThanOrEqual(70);
    expect(JSON.stringify(merged)).not.toMatch(/Invented|Injected|€2|example\.com|\+355/);
  });
});

describe("legacy websites", () => {
  it("converts stored pages, dropping template filler and assumed contact details", () => {
    const website = {
      ...pkg.website,
      pages: [
        {
          slug: "/",
          title: "Kafeja — Slow roasted",
          metaDescription: "Coffee in Prishtinë",
          sections: [
            { id: "hero", type: "hero" as const, heading: "Slow roasted", primaryCta: "Visit us" },
            { id: "stats", type: "stats" as const, heading: "Numbers", items: [{ title: "100%", description: "Organic" }] },
            { id: "proof", type: "testimonials" as const, heading: "Loved", items: [{ title: "Ana", description: "Great" }] },
          ],
        },
        {
          slug: "/contact",
          title: "Contact — Kafeja",
          metaDescription: "",
          sections: [{ id: "contact", type: "contact" as const, heading: "Contact", items: [{ title: "Email", description: "hello@kafeja.com" }] }],
        },
      ],
    };
    const spec = specFromLegacy(website, pkg.brand);
    expect(spec).not.toBeNull();
    expect(spec!.pages.map((p) => p.slug)).toEqual(["/", "/contact"]);
    expect(spec!.pages[0]!.sections.map((s) => s.type)).toEqual(["hero"]);
    expect(JSON.stringify(spec)).not.toMatch(/100%|Loved|hello@kafeja\.com/);
    expect(sectionOf(spec!, "hero")?.primaryCta).toEqual({ label: "Visit us", href: "/contact" });
    expect(sectionOf(spec!, "contact")).toMatchObject({ details: [], channelsPending: true });
  });

  it("prefers a valid stored specification and derives the legacy fields from it", () => {
    const core = toWebsiteCore(base);
    expect(core.pages.map((p) => p.slug)).toEqual(base.pages.map((p) => p.slug));
    expect(core.navItems).toEqual(base.navigation);
    expect(websiteSpecOf({ ...pkg.website, ...core }, pkg.brand)).toEqual(base);
    const tampered = { ...pkg.website, ...core, spec: { ...base, primaryCta: { label: "x", href: "https://evil.example" } } };
    expect(websiteSpecOf(tampered, pkg.brand)?.primaryCta.href).toBe("/contact");
  });
});
