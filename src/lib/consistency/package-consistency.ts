import { buildBusinessProfile, type BusinessModelKind } from "@/lib/engine/profile";
import type { BusinessPackage, Competitor } from "@/lib/types";

/**
 * Deterministic cross-deliverable checks. Catches the failure modes that
 * schema validation alone cannot: off-sector competitors, model/pricing
 * mismatches, fabricated market claims, and empty "complete" social drafts.
 * No LLM calls.
 */

export type ConsistencySeverity = "error" | "warning";

export type ConsistencyIssueId =
  | "offSectorCompetitor"
  | "platformCompetitor"
  | "pricingModelMismatch"
  | "fabricatedMarketClaim"
  | "duplicateSocialPosts"
  | "emptySocialDraft"
  | "websiteIgnoresOffer"
  | "strategyIgnoresOffer"
  | "currencyMismatch";

/** Directory / map aggregators mistaken for rival businesses. */
const PLATFORM_COMPETITOR =
  /\b(?:findglocal|mapquest|yellow\s*pages|find\s+local\s+businesses|directory|listings?\s+include|printable\s+directions|map\s+and\s+directions)\b/i;

export interface ConsistencyIssue {
  id: ConsistencyIssueId;
  severity: ConsistencySeverity;
  detail: string;
}

const FABRICATED =
  /\b(?:trusted by (?:thousands|millions)|industry-leading|guaranteed results|most trusted|#1 in (?:the )?market|used by \d[\d,]*%?\+?\s*(?:customers|users|clients))\b/i;

/** Sector words that must not appear as clothing/retail competitors. */
const RETAIL_OFF_SECTOR =
  /\b(?:bank|banking|newspaper|newsroom|insurance|insurer|hospital|clinic|telecom|airline|airport|university|government|ministry|law\s+firm|attorney)\b/i;

const FOOD_OFF_SECTOR =
  /\b(?:bank|banking|newspaper|insurance|saas|software\s+company|law\s+firm|car\s+dealership|auto\s+parts)\b/i;

const SAAS_OFF_SECTOR =
  /\b(?:boutique|restaurant|cafe|café|bakery|clothing\s+store|grocery|supermarket|barbershop)\b/i;

function offerBlob(pkg: BusinessPackage): string {
  const d = pkg.input.discovery;
  return [pkg.input.idea, d?.business.offering, d?.offer.main, pkg.brand.name, pkg.brand.slogan].filter(Boolean).join(" ");
}

function competitorText(c: Competitor): string {
  return `${c.name} ${c.description} ${c.website ?? ""}`;
}

function offSectorPattern(kind: BusinessModelKind, offer: string): RegExp | null {
  if (kind === "product" || /cloth|fashion|apparel|boutique|streetwear|veshje|retail|shop|store/i.test(offer)) {
    return RETAIL_OFF_SECTOR;
  }
  if (kind === "foodVenue" || /coffee|cafe|café|restaurant|bakery|food|furrë|kafene/i.test(offer)) {
    return FOOD_OFF_SECTOR;
  }
  if (kind === "saas" || /saas|software|invoicing|scheduling|crm|subscription\s+software/i.test(offer)) {
    return SAAS_OFF_SECTOR;
  }
  return null;
}

function expectedPricingShape(kind: BusinessModelKind): RegExp | null {
  if (kind === "saas") return /subscription|seat|month|mrr|arr|tier|plan/i;
  if (kind === "product") return /unit|sku|retail|wholesale|margin|cogs|inventory|price/i;
  if (kind === "professionalService" || kind === "localService") return /hour|project|retainer|session|package|fee|rate/i;
  if (kind === "foodVenue") return /menu|cover|ticket|dish|item|average\s+check/i;
  return null;
}

function normalizeCaption(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 160);
}

/** Returns consistency issues for a structurally valid package. */
export function assessPackageConsistency(pkg: BusinessPackage): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const profile = buildBusinessProfile(pkg.input);
  const offer = offerBlob(pkg);
  const offerTerms = offer
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4)
    .slice(0, 12);

  const offSector = offSectorPattern(profile.modelKind, offer);
  if (pkg.competitors.available) {
    for (const c of pkg.competitors.competitors) {
      const text = competitorText(c);
      if (PLATFORM_COMPETITOR.test(text) || PLATFORM_COMPETITOR.test(c.website ?? "")) {
        issues.push({
          id: "platformCompetitor",
          severity: "error",
          detail: `"${c.name}" looks like a directory or map listing, not a competitor business`,
        });
        continue;
      }
      if (offSector?.test(text)) {
        issues.push({
          id: "offSectorCompetitor",
          severity: "error",
          detail: `"${c.name}" does not match this business sector`,
        });
      }
    }
  }

  const pricingBlob = JSON.stringify(pkg.pricing);
  const pricingShape = expectedPricingShape(profile.modelKind);
  if (pricingShape && pkg.pricing && !pricingShape.test(pricingBlob)) {
    // Only warn — deterministic templates may use generic labels.
    issues.push({
      id: "pricingModelMismatch",
      severity: "warning",
      detail: `Pricing language may not match a ${profile.modelKind} business`,
    });
  }

  const strategyBlob = pkg.strategy ? JSON.stringify(pkg.strategy) : "";
  const marketingBlob = JSON.stringify(pkg.marketing);
  const websiteBlob = JSON.stringify(pkg.website);
  const scan = `${strategyBlob}\n${marketingBlob}\n${websiteBlob}\n${pkg.brand.description}`;
  if (FABRICATED.test(scan)) {
    issues.push({
      id: "fabricatedMarketClaim",
      severity: "error",
      detail: "Package contains unverifiable market-leadership or customer-count claims",
    });
  }

  const captions = pkg.marketing.instagram?.map((p) => normalizeCaption(p.caption ?? "")) ?? [];
  const nonEmpty = captions.filter(Boolean);
  if (pkg.marketing.instagram && pkg.marketing.instagram.length > 0 && nonEmpty.length === 0) {
    issues.push({ id: "emptySocialDraft", severity: "error", detail: "Social posts exist but captions are empty" });
  }
  const seen = new Set<string>();
  for (const c of nonEmpty) {
    if (seen.has(c)) {
      issues.push({ id: "duplicateSocialPosts", severity: "warning", detail: "Two or more social posts share the same caption" });
      break;
    }
    seen.add(c);
  }

  if (offerTerms.length > 0) {
    const siteText = websiteBlob.toLowerCase();
    const hits = offerTerms.filter((t) => siteText.includes(t)).length;
    if (hits === 0) {
      issues.push({
        id: "websiteIgnoresOffer",
        severity: "warning",
        detail: "Website copy does not mention distinctive offer terms from the business idea",
      });
    }
    if (pkg.strategy) {
      const sHits = offerTerms.filter((t) => strategyBlob.toLowerCase().includes(t)).length;
      if (sHits === 0) {
        issues.push({
          id: "strategyIgnoresOffer",
          severity: "warning",
          detail: "Strategy text does not mention distinctive offer terms from the business idea",
        });
      }
    }
  }

  const budgetCurrency = profile.budget?.currency;
  if (budgetCurrency && pkg.strategy?.financials?.currency && pkg.strategy.financials.currency !== budgetCurrency) {
    issues.push({
      id: "currencyMismatch",
      severity: "warning",
      detail: `Financials use ${pkg.strategy.financials.currency} while the profile budget is ${budgetCurrency}`,
    });
  }

  return issues;
}

export function hasConsistencyErrors(issues: readonly ConsistencyIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
