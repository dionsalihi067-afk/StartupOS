import type { Brand, Website, WebsitePage, WebsiteSection } from "@/lib/types";
import { clip, parseWebsiteSpec, SLUG_PATTERN, type WebsiteSectionSpec, type WebsiteSpec } from "@/lib/website/model";
import { themeFromBrand } from "@/lib/website/theme";

/**
 * Compatibility between the website specification and the page list stored
 * by earlier versions. New packages store the spec and derive the legacy
 * fields from it; old packages are converted so one renderer serves both.
 */

export interface WebsiteCore {
  spec: WebsiteSpec;
  pages: WebsitePage[];
  navItems: { label: string; href: string }[];
  footerColumns: { title: string; links: { label: string; href: string }[] }[];
}

function legacySection(s: WebsiteSectionSpec): WebsiteSection {
  switch (s.type) {
    case "hero":
      return { id: s.id, type: "hero", heading: s.heading, subheading: s.subheading, primaryCta: s.primaryCta?.label, secondaryCta: s.secondaryCta?.label };
    case "features":
      return { id: s.id, type: "features", heading: s.heading, subheading: s.intro, items: s.items.map((i) => ({ title: i.title, description: i.description ?? "" })) };
    case "offer":
      return { id: s.id, type: "services", heading: s.heading, subheading: s.intro, items: s.items.map((i) => ({ title: i.title, description: i.description ?? "" })) };
    case "pricing":
      return {
        id: s.id,
        type: "pricing",
        heading: s.heading,
        subheading: s.intro,
        items: s.tiers.map((t) => ({ title: t.price ? `${t.name} — ${t.price}${t.cadence}` : t.name, description: t.description ?? "" })),
      };
    case "about":
      return { id: s.id, type: "about", heading: s.heading, body: s.body };
    case "faq":
      return { id: s.id, type: "faq", heading: s.heading, items: s.items.map((i) => ({ title: i.question, description: i.answer })) };
    case "contact":
      return { id: s.id, type: "contact", heading: s.heading, subheading: s.intro, items: s.details.map((d) => ({ title: d.label, description: d.value })) };
    case "cta":
      return { id: s.id, type: "cta", heading: s.heading, subheading: s.subheading, primaryCta: s.cta.label };
  }
}

export function toWebsiteCore(spec: WebsiteSpec): WebsiteCore {
  return {
    spec,
    pages: spec.pages.map((p) => ({ slug: p.slug, title: p.seo.title, metaDescription: p.seo.description, sections: p.sections.map(legacySection) })),
    navItems: spec.navigation,
    footerColumns: [{ title: spec.siteName, links: spec.navigation }],
  };
}

/**
 * Converts a website stored before specifications existed. Sections that held
 * template filler (statistics, testimonials) and budget-derived prices are not
 * carried over, and no contact details are assumed.
 */
export function specFromLegacy(website: Website, brand: Brand): WebsiteSpec | null {
  const pages = website.pages.filter((p) => SLUG_PATTERN.test(p.slug));
  const slugs = new Set(pages.map((p) => p.slug));
  const target = slugs.has("/contact") ? "/contact" : "/";
  const link = (label: string | undefined) => (label?.trim() ? { label: clip(label, 40), href: target } : undefined);
  const items = (s: WebsiteSection) =>
    (s.items ?? []).filter((i) => i.title.trim()).slice(0, 12).map((i) => ({ title: clip(i.title, 120), ...(i.description.trim() ? { description: clip(i.description, 400) } : {}) }));

  const convert = (s: WebsiteSection): WebsiteSectionSpec | null => {
    if (!s.heading.trim()) return null;
    const base = { id: clip(s.id || s.type, 40), heading: clip(s.heading, 100) };
    switch (s.type) {
      case "hero": {
        const primaryCta = link(s.primaryCta);
        return { type: "hero", ...base, heading: clip(s.heading, 140), ...(s.subheading ? { subheading: clip(s.subheading, 320) } : {}), ...(primaryCta ? { primaryCta } : {}) };
      }
      case "features":
      case "services": {
        const list = items(s);
        if (list.length === 0) return null;
        return s.type === "features" ? { type: "features", ...base, items: list.slice(0, 6) } : { type: "offer", ...base, items: list };
      }
      case "about":
        return s.body?.trim() ? { type: "about", ...base, body: clip(s.body, 1200) } : null;
      case "faq": {
        const qa = items(s).filter((i) => i.description).slice(0, 8).map((i) => ({ question: clip(i.title, 200), answer: clip(i.description ?? "", 600) }));
        return qa.length > 0 ? { type: "faq", ...base, items: qa } : null;
      }
      case "contact":
        return { type: "contact", ...base, details: [], channelsPending: true };
      case "cta": {
        const cta = link(s.primaryCta);
        return cta ? { type: "cta", ...base, heading: clip(s.heading, 140), ...(s.subheading ? { subheading: clip(s.subheading, 240) } : {}), cta } : null;
      }
      default:
        return null;
    }
  };

  const specPages = pages
    .map((p, i) => {
      const label = clip(p.slug === "/" ? "Home" : (p.title.split("—")[0] ?? p.title).trim() || p.slug, 40);
      return {
        id: `page-${i + 1}`,
        slug: p.slug,
        label,
        seo: { title: clip(p.title || label, 70), description: clip(p.metaDescription || p.title || label, 170), canonicalPath: p.slug },
        sections: p.sections.map(convert).filter((s): s is WebsiteSectionSpec => s !== null).slice(0, 10),
      };
    })
    .filter((p) => p.sections.length > 0)
    .sort((a, b) => (a.slug === "/" ? -1 : b.slug === "/" ? 1 : 0));

  return parseWebsiteSpec({
    version: 1,
    siteName: clip(brand.name, 80),
    ...(brand.slogan ? { tagline: clip(brand.slogan, 160) } : {}),
    language: "en",
    theme: themeFromBrand(brand),
    primaryCta: { label: "Contact", href: target },
    navigation: specPages.slice(0, 6).map((p) => ({ label: p.label, href: p.slug })),
    pages: specPages.slice(0, 6),
  });
}

/** The spec to render: the stored one when valid, otherwise a conversion of the legacy pages. */
export function websiteSpecOf(website: Website, brand: Brand): WebsiteSpec | null {
  return (website.spec ? parseWebsiteSpec(website.spec) : null) ?? specFromLegacy(website, brand);
}
