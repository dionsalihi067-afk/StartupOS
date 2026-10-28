import type { Brand, SeoStructure, WebsitePage } from "@/lib/types";
import type { AgentOutput, GenerationContext } from "@/lib/agents/context";
import { knownMarketLocation } from "@/lib/agents/copy-brief";

/**
 * SEO Agent — builds a complete on-page SEO structure: metadata, keyword set,
 * Open Graph fields, URL slug map, JSON-LD structured data, and a sitemap.
 * Schema.org type and local keywords follow the canonical profile so an
 * online-only business is not described as a storefront.
 *
 * Titles and descriptions are page-aware heuristics from the owner's offer,
 * audience and location — not a single slogan formula. Search volumes, difficulty
 * and verified rankings are never invented. Research snippets may seed keywords
 * when present; they are never treated as verified SERP data.
 */

/** Prefer the owner's offer wording over a broad industry label for keywords. */
export function seoFocusTerms(ctx: GenerationContext): string[] {
  const d = ctx.input.discovery;
  const raw = [
    d?.offer.main?.trim(),
    d?.business.offering?.trim(),
    d?.business.category === "ecommerce" || /cloth|fashion|apparel|boutique|veshje/i.test(ctx.input.idea)
      ? "clothing boutique"
      : null,
    ctx.profile.modelKind === "localService" && /repair|mechanic|mekanik|workshop/i.test(ctx.input.idea)
      ? "auto repair"
      : null,
    ctx.profile.modelKind === "professionalService" && /web|software|digital|agency/i.test(ctx.input.idea)
      ? "web development agency"
      : null,
    ctx.profile.modelKind === "saas" ? "software" : null,
  ].filter((t): t is string => Boolean(t && t.length >= 3));

  const terms = raw
    .flatMap((t) => t.split(/[,/;|]/).map((s) => s.trim().toLowerCase()))
    .filter((t) => t.length >= 3 && t.length <= 48 && !/e-?commerce\s*&\s*retail/i.test(t));

  if (terms.length) return [...new Set(terms)].slice(0, 4);

  const label = ctx.industry.label.toLowerCase();
  // Avoid dumping a multi-word industry brand as the only keyword seed.
  if (/e-?commerce|retail|general/i.test(label)) {
    const idea = ctx.input.idea.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
    const words = idea.split(/\s+/).filter((w) => w.length >= 4).slice(0, 4);
    return words.length ? [words.join(" ")] : [label];
  }
  return [label];
}

/** Pull short phrase seeds from research claims when available — never volumes or rankings. */
function researchKeywordSeeds(ctx: GenerationContext): string[] {
  const slice = ctx.research?.seo;
  if (!slice?.facts?.length) return [];
  return slice.facts
    .map((f) => f.statement.trim())
    .filter((s) => s.length >= 8 && s.length <= 80)
    .flatMap((s) => {
      const words = s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4);
      return words.length >= 2 ? [words.slice(0, 4).join(" ")] : [];
    })
    .slice(0, 3);
}

function pagePurposeLabel(page: WebsitePage): string {
  const title = page.title.split("—")[0]?.trim() || page.title;
  const slug = page.slug.replace(/^\//, "") || "home";
  if (!slug || slug === "home" || page.slug === "/") return "home";
  if (/menu|product|service|feature|room|offer/i.test(slug) || /menu|product|service|feature|room/i.test(title)) {
    return "offer";
  }
  if (/about/i.test(slug) || /about/i.test(title)) return "about";
  if (/pricing|price/i.test(slug) || /pricing|price/i.test(title)) return "pricing";
  if (/contact/i.test(slug) || /contact/i.test(title)) return "contact";
  return "page";
}

/** Heuristic page title — unique per page purpose; never invents rankings. */
export function pageSeoTitle(brand: Brand, page: WebsitePage, primary: string, city: string): string {
  const purpose = pagePurposeLabel(page);
  const name = brand.name;
  switch (purpose) {
    case "home":
      return (city ? `${name} — ${primary} in ${city}` : `${name} — ${primary}`).slice(0, 60);
    case "offer":
      return `${primary} | ${name}`.slice(0, 60);
    case "about":
      return `About ${name}`.slice(0, 60);
    case "pricing":
      return `Pricing — ${name}`.slice(0, 60);
    case "contact":
      return city ? `Contact ${name} in ${city}`.slice(0, 60) : `Contact ${name}`.slice(0, 60);
    default:
      return `${page.title.split("—")[0]!.trim()} — ${name}`.slice(0, 60);
  }
}

export function pageSeoDescription(
  brand: Brand,
  page: WebsitePage,
  primary: string,
  audience: string,
  city: string,
): string {
  const purpose = pagePurposeLabel(page);
  const forAudience = audience.trim() ? ` for ${audience.trim()}` : "";
  const place = city ? ` in ${city}` : "";
  switch (purpose) {
    case "home":
      return `${brand.description}`.slice(0, 158) || `${nameSafe(brand)} offers ${primary}${forAudience}${place}.`.slice(0, 158);
    case "offer":
      return `See ${primary}${place} from ${nameSafe(brand)}${forAudience}. Details on what is included — no invented reviews.`.slice(0, 158);
    case "about":
      return `${brand.mission || brand.description}`.slice(0, 158);
    case "pricing":
      return `Pricing for ${primary} from ${nameSafe(brand)}. Figures shown are owner-provided only.`.slice(0, 158);
    case "contact":
      return `Contact ${nameSafe(brand)}${place} about ${primary}.`.slice(0, 158);
    default:
      return (page.metaDescription || brand.description).slice(0, 158);
  }
}

function nameSafe(brand: Brand): string {
  return brand.name.trim() || "this business";
}

export function runSeoAgent(ctx: GenerationContext, brand: Brand, pages: WebsitePage[]): AgentOutput<SeoStructure> {
  const { input, profile } = ctx;
  const location = knownMarketLocation(input.location);
  const city = location.split(",")[0]?.trim() ?? "";
  const focus = seoFocusTerms(ctx);
  const primary = focus[0]!;
  const audience = input.audience.trim() || input.discovery?.customer.ideal?.trim() || "";
  const researchSeeds = researchKeywordSeeds(ctx);
  const local =
    Boolean(city) &&
    (profile.modelKind === "localService" ||
      profile.modelKind === "foodVenue" ||
      profile.sellsOnline === false ||
      input.discovery?.business.type === "physical");

  const keywords = [
    city ? `${primary} ${city}` : primary,
    ...focus.slice(1, 3),
    ...researchSeeds,
    ...(local && city ? [`${primary} near me`, `${primary} in ${city}`] : [`${primary} online`]),
    audience ? `${audience.toLowerCase()} ${primary}` : "",
    brand.name.toLowerCase(),
  ].filter(Boolean);
  const uniqueKeywords = [...new Set(keywords.map((k) => k.trim().toLowerCase()))].slice(0, 12);

  // knowsAbout must describe this offer — not shared industry blog topics.
  const knowsAbout = [...new Set([...focus, ...researchSeeds.map((s) => s.slice(0, 48))])].slice(0, 6);

  const home = pages.find((p) => p.slug === "/" || /home/i.test(p.title)) ?? pages[0];
  const siteTitle = home
    ? pageSeoTitle(brand, home, primary, city)
    : (city ? `${brand.name} — ${primary} in ${city}` : `${brand.name} — ${primary}`).slice(0, 60);
  const siteDescription = home
    ? pageSeoDescription(brand, home, primary, audience, city)
    : `${brand.description}`.slice(0, 158);

  const jsonLd: Record<string, unknown> = local
    ? {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        name: brand.name,
        description: brand.description,
        slogan: brand.slogan,
        areaServed: location || undefined,
        ...(city ? { address: { "@type": "PostalAddress", addressLocality: city } } : {}),
        knowsAbout,
      }
    : {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: brand.name,
        description: brand.description,
        slogan: brand.slogan,
        ...(location ? { areaServed: location } : {}),
        knowsAbout,
      };

  // Enrich legacy page meta so each page is not a clone of brand.slogan.
  const enrichedPagesNote = pages.map((p) => ({
    page: p.title.split("—")[0]!.trim(),
    slug: p.slug,
    title: pageSeoTitle(brand, p, primary, city),
    description: pageSeoDescription(brand, p, primary, audience, city),
  }));

  return {
    data: {
      title: siteTitle,
      metaDescription: siteDescription,
      keywords: uniqueKeywords,
      ogTitle: city ? `${brand.name} | ${primary} in ${city}` : `${brand.name} | ${primary}`,
      ogDescription: (brand.slogan || siteDescription).slice(0, 200),
      slugStructure: enrichedPagesNote.map(({ page, slug }) => ({ page, slug })),
      jsonLd,
      sitemap: pages.map((p) => p.slug),
    },
    source: "deterministic",
    note: researchSeeds.length
      ? "seo-heuristics-with-research-seeds"
      : "seo-heuristics-no-verified-search-volumes",
  };
}
