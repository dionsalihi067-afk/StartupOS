import { describe, expect, it } from "vitest";
import { parseWebsiteSpec, SLUG_PATTERN, WEBSITE_SECTION_TYPES, type WebsiteSpec } from "@/lib/website/model";
import { parseBusinessPackage } from "@/lib/package-schema";
import { makePackage } from "@/test/db";
import { makeWebsiteCore, makeWebsiteSpec } from "@/test/website";

const valid = (): WebsiteSpec => structuredClone(makeWebsiteSpec());

describe("website specification schema", () => {
  it("accepts a generated specification", () => {
    expect(parseWebsiteSpec(valid())).not.toBeNull();
  });

  it("has a small fixed set of section types", () => {
    expect(WEBSITE_SECTION_TYPES).toEqual(["hero", "features", "offer", "pricing", "about", "faq", "contact", "cta"]);
  });

  it("rejects unknown section types", () => {
    const spec = valid() as unknown as { pages: { sections: unknown[] }[] };
    spec.pages[0]!.sections.push({ type: "testimonials", id: "t", heading: "Loved by 500 customers" });
    expect(parseWebsiteSpec(spec)).toBeNull();
  });

  it("rejects sections that are missing required content", () => {
    const spec = valid() as unknown as { pages: { sections: Record<string, unknown>[] }[] };
    spec.pages[0]!.sections[0] = { type: "hero", id: "hero", heading: "  " };
    expect(parseWebsiteSpec(spec)).toBeNull();
  });

  it("rejects duplicate slugs", () => {
    const spec = valid();
    spec.pages.push({ ...spec.pages[0]!, id: "copy" });
    expect(parseWebsiteSpec(spec)).toBeNull();
  });

  it("validates slugs", () => {
    for (const ok of ["/", "/about", "/our-menu", "/a/b"]) expect(SLUG_PATTERN.test(ok)).toBe(true);
    for (const bad of ["", "about", "/About", "/about/", "//evil.com", "/a b", "/a--b", "https://x.com", "javascript:alert(1)", "/../x"]) {
      expect(SLUG_PATTERN.test(bad)).toBe(false);
    }
    const spec = valid();
    spec.pages[1] = { ...spec.pages[1]!, slug: "/Contact Us", seo: { ...spec.pages[1]!.seo, canonicalPath: "/Contact Us" } };
    expect(parseWebsiteSpec(spec)).toBeNull();
  });

  it("requires the homepage first", () => {
    const spec = valid();
    spec.pages.reverse();
    expect(parseWebsiteSpec(spec)).toBeNull();
  });

  it("rejects links to unknown pages or external URLs", () => {
    const external = valid();
    external.primaryCta = { label: "Book", href: "https://wa.me/123" };
    expect(parseWebsiteSpec(external)).toBeNull();

    const unknown = valid();
    unknown.navigation.push({ label: "Shop", href: "/shop" });
    expect(parseWebsiteSpec(unknown)).toBeNull();
  });

  it("rejects invalid SEO", () => {
    const longTitle = valid();
    longTitle.pages[0]!.seo.title = "x".repeat(71);
    expect(parseWebsiteSpec(longTitle)).toBeNull();

    const emptyDescription = valid();
    emptyDescription.pages[0]!.seo.description = "";
    expect(parseWebsiteSpec(emptyDescription)).toBeNull();

    const canonical = valid();
    canonical.pages[0]!.seo.canonicalPath = "/elsewhere";
    expect(parseWebsiteSpec(canonical)).toBeNull();
  });

  it("rejects unsafe theme values", () => {
    const color = valid();
    color.theme.colors.primary = "red; background:url(x)";
    expect(parseWebsiteSpec(color)).toBeNull();

    for (const logoUrl of ["javascript:alert(1)", "//evil.com/x.png", "data:image/svg+xml;base64,PHN2Zz4="]) {
      const spec = valid();
      spec.theme.logoUrl = logoUrl;
      expect(parseWebsiteSpec(spec)).toBeNull();
    }
  });

  it("is enforced when a business package is persisted", () => {
    const website = { ...makePackage().website, ...makeWebsiteCore("Home") };
    expect(parseBusinessPackage(makePackage({ website }))).not.toBeNull();
    const injected = { ...website, spec: { ...website.spec, primaryCta: { label: "Book", href: "javascript:alert(1)" } } };
    expect(parseBusinessPackage(makePackage({ website: injected }))).toBeNull();
  });

  it("rejects malformed input", () => {
    for (const value of [null, undefined, "", 42, [], {}, { version: 2 }, { ...valid(), pages: [] }]) {
      expect(parseWebsiteSpec(value)).toBeNull();
    }
  });
});
