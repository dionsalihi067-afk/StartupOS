import type { ResearchEvidence, ResearchSource } from "@/lib/research/model";
import type { RejectionReason } from "@/lib/research/competitors/model";
import { businessSupplySignals, foldText, matchTerms, servesConsumers } from "@/lib/research/competitors/signals";

/**
 * Deterministic competitor-candidate validation. A search result is only a
 * candidate: it must be an identifiable business's own page, with evidence,
 * that mentions what the business context offers. Articles, listicles,
 * directories, marketplaces, social platforms and suppliers are rejected.
 */

/** Hosts where each subdomain is a separate site (tenant), so the full hostname is the identity. */
const SHARED_HOSTS = [
  "wixsite.com", "blogspot.com", "myshopify.com", "business.site", "github.io", "wordpress.com",
  "squarespace.com", "webflow.io", "carrd.co", "netlify.app", "vercel.app", "godaddysites.com",
];
/** Second-level labels used under country TLDs (example.co.uk, example.com.al). */
const COUNTRY_SECOND_LEVEL = new Set(["co", "com", "net", "org", "gov", "edu", "ac", "or", "ne", "gob", "biz"]);

/** Registrable domain: shop.example.com and www.example.com are the same business. */
export function canonicalDomain(domain: string): string {
  const host = domain.toLowerCase().replace(/^(www\d*|m)\./, "");
  if (SHARED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return host;
  const labels = host.split(".");
  const last = labels.at(-1) ?? "";
  const second = labels.at(-2) ?? "";
  const keep = labels.length >= 3 && last.length === 2 && COUNTRY_SECOND_LEVEL.has(second) ? 3 : 2;
  return labels.slice(-keep).join(".");
}

/** Platforms that host or list businesses but are not competitors themselves (matched on any TLD). */
const PLATFORM_LABELS = new Set([
  "wikipedia", "wikimedia", "wikidata", "reddit", "quora", "youtube", "facebook", "instagram", "tiktok",
  "linkedin", "pinterest", "twitter", "x", "medium", "substack", "amazon", "ebay", "etsy", "alibaba",
  "aliexpress", "temu", "yelp", "tripadvisor", "google", "bing", "yahoo", "foursquare", "yellowpages",
  "trustpilot", "glassdoor", "indeed", "crunchbase", "g2", "capterra", "producthunt", "booking", "airbnb",
  "expedia", "wolt", "ubereats", "doordash", "deliveroo", "glovoapp", "justeat", "grubhub", "zomato",
  "opentable", "groupon", "fiverr", "upwork", "craigslist", "gumtree", "olx", "thumbtack", "apple",
  // Directories / map aggregators seen in live clothing-boutique research (not rival boutiques).
  "findglocal", "mapquest", "here", "openstreetmap", "osm", "bingplaces", "paginegialle", "infobel",
  "hotfrog", "cylex", "brownbook", "spoke", "zoominfo", "apollo",
  "maps", "googlemaps", "applemaps", "waze", "kompass", "europa", "europages", "dnb", "bloomberg",
]);

/** Titles/names that identify the platform listing itself, not a tenant business. */
const PLATFORM_NAME =
  /\b(?:find\s+local\s+businesses|findglocal|mapquest|yellow\s*pages|google\s+maps|bing\s+places|openstreetmap|tripadvisor|yelp|foursquare|printable\s+directions)\b/i;

/** Government, military and academic hosts (agency.gov, service.gov.uk, ox.ac.uk) describe places and sectors; they are not businesses. */
const INSTITUTIONAL_LABELS = new Set(["gov", "mil", "edu", "ac"]);

function isInstitutionalHost(domain: string): boolean {
  const labels = domain.toLowerCase().split(".");
  return labels.slice(-2).some((label) => INSTITUTIONAL_LABELS.has(label));
}

/** Downloadable documents (reports, factsheets, menus) are not a business's own site. */
const DOCUMENT_PATH = /\.(?:pdf|docx?|xlsx?|pptx?|odt|rtf)$/i;

const ARTICLE_PATH =
  /\/(?:blog|blogs|news|article|articles|magazine|press|stories|story|forum|forums|questions|wiki|guide|guides|review|reviews|top|best|list|lists|listings|directory|location|locations|search|tag|tags|category|categories)(?:\/|$)|\/\d{4}\/\d{1,2}(?:\/|$)/i;
const ARTICLE_TITLE =
  /^\s*\d+\s+\p{L}|^\s*(?:the\s+)?(?:best|top)\b|\b(?:top|best)\s+\d+\b|\b\d+\s+(?:best|top|great)\b|\b\d+\s+(?:listings?|results?|places)\b|^\s*find\s+(?:a|an|the)\b|\bfind\s+local\s+businesses?\b|\bclothing\s+stores?\s+in\b|\b(?:vs\.?|versus)\b|\bhow to\b|\bguide\b|\breviews?\b|\bnews\b|\blist of\b|\branking\b|\bdirectory\b|\bnear (?:me|you)\b|\bwhat is\b|\bprintable\s+directions\b|\bmap\s+and\s+directions\b/iu;
const SUPPLIER = /\b(?:wholesale\w*|suppliers?|manufacturers?|distributors?)\b/i;

/**
 * When the offer is clearly in one sector, reject candidates whose own page
 * describes a different sector (e.g. a bank for a clothing boutique). Lexical
 * offer-term matching alone can still pass when a national brand mentions the
 * city and a generic word like "shop".
 */
const SECTOR_MISMATCH: { offer: RegExp; foreign: RegExp }[] = [
  {
    offer: /\b(?:cloth(?:ing|es)?|fashion|apparel|boutique|streetwear|footwear|sneakers?|hoodie|veshje)\b/i,
    foreign:
      /\b(?:bank|banking|newspaper|newsroom|insurance|insurer|hospital|clinic|telecom|airline|university|ministry|law\s+firm|grocery|supermarket|bronx|auto\s+repair|mechanic|dealership|car\s+dealer)\b/i,
  },
  {
    offer: /\b(?:coffee|cafe|café|restaurant|bakery|bistro|pizzeria|food\s+truck|kafene|restorant|furrë)\b/i,
    foreign: /\b(?:bank|banking|newspaper|insurance|saas|software\s+company|law\s+firm|car\s+rental|dealership)\b/i,
  },
  {
    offer: /\b(?:saas|software|invoicing|scheduling\s+tool|crm|subscription\s+software)\b/i,
    foreign: /\b(?:boutique|restaurant|cafe|café|bakery|clothing\s+store|barbershop|grocery)\b/i,
  },
];

export type CandidateCheck = { ok: true; matchedTerms: string[] } | { ok: false; reason: RejectionReason };

export type CandidateOptions = {
  /** The new business itself sells to businesses, so business suppliers are genuine competitors. */
  businessMarket?: boolean;
};

/**
 * A site that only sells to businesses (an explicit supplier word, or two separate business-supply
 * statements) and shows no sign of serving consumers. A producer that also runs a shop is not one.
 */
function isBusinessSupplierOnly(text: string): boolean {
  const supplies = SUPPLIER.test(foldText(text)) || businessSupplySignals(text) >= 2;
  return supplies && !servesConsumers(text);
}

/** True when the host is a known directory, map, social, or marketplace platform — not a rival business. */
export function isPlatformHost(domainOrUrl: string): boolean {
  try {
    const host = domainOrUrl.includes("://") ? new URL(domainOrUrl).hostname : domainOrUrl;
    const registrable = canonicalDomain(host);
    const label = registrable.split(".")[0] ?? "";
    return PLATFORM_LABELS.has(label) || isInstitutionalHost(host);
  } catch {
    return false;
  }
}

/**
 * Lightweight gate for live-search rows (title/url/snippet) before they become
 * confirmed competitors. Does not invent verification — only rejects clear junk.
 */
export function rejectSearchArtifact(args: {
  title: string;
  url: string;
  snippet?: string;
  offerTerms?: readonly string[];
}): { ok: true } | { ok: false; reason: RejectionReason } {
  const { title, url, snippet = "", offerTerms = [] } = args;
  if (isPlatformHost(url) || PLATFORM_NAME.test(title) || PLATFORM_NAME.test(`${title} ${snippet}`)) {
    return { ok: false, reason: "platform" };
  }
  let path = "/";
  try {
    path = new URL(url).pathname;
  } catch {
    return { ok: false, reason: "insufficientEvidence" };
  }
  if (ARTICLE_PATH.test(path) || DOCUMENT_PATH.test(path) || ARTICLE_TITLE.test(title)) {
    return { ok: false, reason: "article" };
  }
  const text = `${title} ${snippet}`;
  if (offerTerms.length) {
    const offerText = offerTerms.join(" ");
    for (const rule of SECTOR_MISMATCH) {
      if (rule.offer.test(offerText) && rule.foreign.test(text)) {
        return { ok: false, reason: "irrelevant" };
      }
    }
    if (matchTerms(offerTerms, text).length === 0) {
      return { ok: false, reason: "irrelevant" };
    }
  }
  return { ok: true };
}

/** Checks a candidate that has evidence (candidates without evidence are rejected before this). */
export function validateCandidate(
  source: ResearchSource,
  evidence: ResearchEvidence,
  terms: readonly string[],
  options: CandidateOptions = {},
): CandidateCheck {
  if (isPlatformHost(source.domain) || PLATFORM_NAME.test(source.title)) {
    return { ok: false, reason: "platform" };
  }

  const path = new URL(source.url).pathname;
  if (ARTICLE_PATH.test(path) || DOCUMENT_PATH.test(path) || ARTICLE_TITLE.test(source.title)) {
    return { ok: false, reason: "article" };
  }

  const text = `${source.title} ${evidence.excerpt}`;
  if (PLATFORM_NAME.test(text)) return { ok: false, reason: "platform" };

  const supplierInContext = options.businessMarket || terms.some((t) => SUPPLIER.test(t));
  if (!supplierInContext && isBusinessSupplierOnly(text)) return { ok: false, reason: "supplier" };

  const offerText = terms.join(" ");
  for (const rule of SECTOR_MISMATCH) {
    if (rule.offer.test(offerText) && rule.foreign.test(text)) {
      return { ok: false, reason: "irrelevant" };
    }
  }

  const matchedTerms = matchTerms(terms, text);
  if (matchedTerms.length === 0) return { ok: false, reason: "irrelevant" };
  return { ok: true, matchedTerms };
}
