import type { Brand, SeoStructure, WebsitePage } from "@/lib/types";
import type { AgentOutput, GenerationContext } from "@/lib/agents/context";

/**
 * SEO Agent — builds a complete on-page SEO structure: metadata, keyword set,
 * Open Graph fields, URL slug map, JSON-LD structured data, and a sitemap.
 */
export function runSeoAgent(ctx: GenerationContext, brand: Brand, pages: WebsitePage[]): AgentOutput<SeoStructure> {
  const { input, industry } = ctx;
  const city = input.location.split(",")[0]!.trim();
  const lower = industry.label.toLowerCase();

  const keywords = [
    `${lower} ${city}`,
    `best ${lower} in ${city}`,
    `${input.audience.toLowerCase()} ${lower}`,
    `${brand.name.toLowerCase()}`,
    `${lower} near me`,
    `affordable ${lower} ${city}`,
    `premium ${lower} ${city}`,
    `${industry.valueProps[0]?.toLowerCase() ?? lower}`,
  ];

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: brand.name,
    description: brand.description,
    slogan: brand.slogan,
    areaServed: input.location,
    address: { "@type": "PostalAddress", addressLocality: city },
    knowsAbout: industry.contentTopics,
  };

  return {
    data: {
      title: `${brand.name} — ${brand.slogan}`.slice(0, 60),
      metaDescription: `${brand.description}`.slice(0, 158),
      keywords,
      ogTitle: `${brand.name} | ${industry.label} in ${city}`,
      ogDescription: brand.slogan,
      slugStructure: pages.map((p) => ({ page: p.title.split("—")[0]!.trim(), slug: p.slug })),
      jsonLd,
      sitemap: pages.map((p) => p.slug),
    },
    source: "deterministic",
  };
}
