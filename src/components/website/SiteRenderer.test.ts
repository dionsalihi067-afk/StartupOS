import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteRenderer, themeFontsHref } from "@/components/website/SiteRenderer";
import { WEBSITE_SECTION_TYPES, websiteSpecSchema, type WebsiteSectionSpec, type WebsiteSpec } from "@/lib/website/model";
import { buildPublishableWebsite } from "@/lib/website/publish";
import { makeWebsiteSpec } from "@/test/website";

const labels = {
  navigation: "Site navigation",
  contactPending: "Add contact details before publishing.",
  homeAria: "Home",
  menuLabel: "Menu",
};

const ALL_SECTIONS: WebsiteSectionSpec[] = [
  { type: "hero", id: "hero", heading: "Hero heading", subheading: "Hero sub", primaryCta: { label: "Contact us", href: "/contact" } },
  { type: "features", id: "features", heading: "Features heading", items: [{ title: "Feature one", description: "Feature text" }] },
  { type: "offer", id: "offer", heading: "Offer heading", items: [{ title: "Offer one" }] },
  {
    type: "pricing",
    id: "pricing",
    heading: "Pricing heading",
    tiers: [
      { name: "Basic", price: "1.200 ALL", cadence: "/month", features: ["One"], highlighted: true },
      { name: "Custom", cadence: "", features: [], highlighted: false },
    ],
  },
  { type: "about", id: "about", heading: "About heading", body: "About body" },
  { type: "faq", id: "faq", heading: "FAQ heading", items: [{ question: "Question one?", answer: "Answer one." }] },
  { type: "contact", id: "contact", heading: "Contact heading", details: [], channelsPending: true },
  { type: "cta", id: "cta", heading: "CTA heading", cta: { label: "Start", href: "/contact" } },
];

function render(spec: WebsiteSpec, pageIndex = 0, opts: { publicSlug?: string; mobile?: boolean } = {}) {
  const built = buildPublishableWebsite(spec);
  if (!built.ok) throw new Error("invalid test website");
  return renderToStaticMarkup(
    createElement(SiteRenderer, {
      site: built.site,
      page: built.site.pages[pageIndex]!,
      labels,
      publicSlug: opts.publicSlug,
      mobile: opts.mobile,
    }),
  );
}

function singlePage(sections: WebsiteSectionSpec[]): WebsiteSpec {
  const base = makeWebsiteSpec();
  return websiteSpecSchema.parse({
    ...base,
    primaryCta: { label: "Contact", href: "/contact" },
    navigation: [
      { label: "Home", href: "/" },
      { label: "Contact", href: "/contact" },
    ],
    pages: [
      { ...base.pages[0]!, sections },
      base.pages.find((p) => p.slug === "/contact") ?? {
        id: "contact",
        slug: "/contact",
        label: "Contact",
        seo: { title: "Contact", description: "Contact page description here.", canonicalPath: "/contact" },
        sections: [{ type: "contact", id: "c", heading: "Contact", details: [], channelsPending: true }],
      },
    ],
  });
}

describe("site renderer", () => {
  it("renders every section type with a page-level heading", () => {
    expect(ALL_SECTIONS.map((s) => s.type)).toEqual(WEBSITE_SECTION_TYPES);
    const html = render(singlePage(ALL_SECTIONS));
    for (const text of [
      "Hero heading",
      "Feature one",
      "Offer one",
      "1.200 ALL",
      "/month",
      "About body",
      "Question one?",
      "Contact heading",
      labels.contactPending,
      "CTA heading",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('<h1 id="sos-hero-title">Hero heading</h1>');
    expect(html).toContain('aria-label="Site navigation"');
    expect(html).toContain('href="#sos-main"');
    expect(html).toContain("sos-btn sos-btn-primary");
  });

  it("gives every page exactly one h1, also when it does not start with a hero", () => {
    const spec = makeWebsiteSpec();
    for (let i = 0; i < spec.pages.length; i++) {
      const html = render(spec, i);
      expect(html.match(/<h1[\s>]/g) ?? [], `page ${spec.pages[i]!.slug}`).toHaveLength(1);
    }
    const about = render(singlePage([{ type: "about", id: "about", heading: "About us", body: "Body" }]));
    expect(about).toContain("<h1>About us</h1>");
  });

  it("renders sections with only required fields", () => {
    const html = render(
      singlePage([
        { type: "hero", id: "hero", heading: "Only heading" },
        { type: "offer", id: "offer", heading: "Offer", items: [{ title: "Item" }] },
        { type: "contact", id: "contact", heading: "Contact", details: [], channelsPending: false },
      ]),
    );
    expect(html).toContain("Only heading");
    expect(html).not.toContain(labels.contactPending);
  });

  it("resolves published paths when a public slug is provided", () => {
    const html = render(singlePage(ALL_SECTIONS), 0, { publicSlug: "kafeja" });
    expect(html).toContain('href="/s/kafeja"');
    expect(html).toContain('href="/s/kafeja/contact"');
    expect(html).not.toContain('href="/contact"');
  });

  it("marks the current page in navigation and keeps preview links site-relative", () => {
    const spec = makeWebsiteSpec();
    const html = render(spec, 0);
    expect(html).toContain('aria-current="page"');
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]).filter((h) => h && h !== "#sos-main");
    for (const href of hrefs) expect(spec.pages.map((p) => p.slug)).toContain(href);
  });

  it("forces the mobile layout class for the workspace preview", () => {
    const html = render(singlePage(ALL_SECTIONS), 0, { mobile: true });
    expect(html).toContain("sos-force-mobile");
    expect(html).toContain("Menu");
  });

  it("shows the owner's hero photo full-bleed with its description, and nothing when there is none", () => {
    const base = makeWebsiteSpec();
    const hero = base.pages[0]!.sections[0]!;
    if (hero.type !== "hero") throw new Error("expected a hero first");
    const src = `/api/assets/ast_${"a".repeat(32)}`;
    const withPhoto = websiteSpecSchema.parse({
      ...base,
      pages: [{ ...base.pages[0]!, sections: [{ ...hero, image: { src, alt: "Our bakery counter" } }, ...base.pages[0]!.sections.slice(1)] }, ...base.pages.slice(1)],
    });
    const html = render(withPhoto);
    expect(html).toContain('class="sos-hero sos-hero-photo"');
    expect(html).toContain(`src="${src}"`);
    expect(html).toContain('alt="Our bakery counter"');
    expect(html).toContain('<img class="sos-hero-media"');
    expect(render(base)).not.toContain('<img class="sos-hero-media"');
    expect(render(base)).not.toContain('class="sos-hero sos-hero-photo"');
  });

  it("renders wide-screen navigation outside the collapsible mobile menu", () => {
    const html = render(singlePage(ALL_SECTIONS));
    const wide = html.match(/<nav[^>]*sos-nav-wide[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(html.indexOf("sos-nav-wide")).toBeLessThan(html.indexOf("<details"));
    expect(wide).toContain("sos-header-cta");
    expect(wide).not.toContain("<details");
    expect(html).toContain("@media (min-width:721px){  .sos-menu{display:none}}");
    expect(html).toContain(".sos-site.sos-force-mobile .sos-nav-wide{display:none}");
  });

  it("keeps the brand flexible so long names share the header row with the menu", () => {
    const html = render(singlePage(ALL_SECTIONS));
    expect(html).toContain("flex:1 1 0%");
    expect(html).toContain(".sos-menu{margin:0;flex:0 0 auto}");
  });

  it("renders model text as text, never as markup", () => {
    const html = render(singlePage([{ type: "about", id: "about", heading: "<img src=x onerror=alert(1)>", body: "<script>alert(1)</script>" }]));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/<iframe|javascript:|<[^>]+\sonerror=/i);
  });

  it("neutralizes javascript contact action hrefs even if they bypass schema", () => {
    const base = makeWebsiteSpec();
    const contact = {
      type: "contact" as const,
      id: "c",
      heading: "Contact",
      details: [],
      channelsPending: false,
      // Intentionally invalid — defense in depth for renderer
      actions: [{ kind: "email" as const, label: "Email us", href: "javascript:alert(1)" }],
    };
    const built = buildPublishableWebsite({
      ...base,
      pages: base.pages.map((p) => (p.slug === "/contact" ? { ...p, sections: [contact] } : p)),
    });
    // Publish may reject invalid actions; if it accepts, renderer must still neutralize.
    if (!built.ok) {
      expect(built.ok).toBe(false);
      return;
    }
    const page = built.site.pages.find((p) => p.slug === "/contact")!;
    const html = renderToStaticMarkup(
      createElement(SiteRenderer, { site: built.site, page, labels }),
    );
    expect(html).not.toMatch(/href=["']javascript:/i);
  });

  it("builds a Google Fonts href only for non-system theme fonts", () => {
    const spec = makeWebsiteSpec();
    expect(themeFontsHref(spec.theme)).toContain("fonts.googleapis.com");
    expect(themeFontsHref({ ...spec.theme, fonts: { heading: "system-ui", headingFallback: "sans-serif", body: "sans-serif", bodyFallback: "sans-serif" } })).toBeNull();
  });
});
