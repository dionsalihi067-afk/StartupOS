import { assessPackageConsistency, hasConsistencyErrors } from "@/lib/consistency/package-consistency";
import { buildBusinessProfile, contextReadiness } from "@/lib/engine/profile";
import type { AgentKey, AgentLogEntry, BusinessPackage, MarketingStrategy } from "@/lib/types";

/**
 * Truthful generation outcome for a package that was structurally valid enough to keep.
 * Failed generations (invalid package / fatal pipeline) never reach this assessment.
 *
 * - success: complete enough and specific enough to use without a material caveat banner
 * - provisional: structurally valid draft that still needs owner review (thin context, generic copy, or unverified market claims)
 * - degraded: core sections fell back or consistency errors — usable but limited
 */
export type GenerationOutcome = "success" | "provisional" | "degraded";

/** Stable limitation codes; UI maps them to copy. Not raw provider messages. */
export type GenerationLimitation =
  | "criticalFallback"
  | "researchLimited"
  | "logoUnavailable"
  | "optionalFallback"
  | "consistencyWarnings"
  | "genericContent"
  | "needsOwnerReview"
  | "thinEvidence";

export interface GenerationQuality {
  outcome: GenerationOutcome;
  limitations: GenerationLimitation[];
}

/** Core product sections — fallback/error here means the result is usable but limited. */
const CRITICAL_KEYS = new Set<AgentKey>([
  "brand",
  "design",
  "website",
  "pricing",
  "marketing",
  "growth",
  "strategy",
  "competitor",
]);

/** Legacy display-label fallback when agentKey is absent (historical packages). */
const CRITICAL_LABELS = new Set([
  "Brand Agent",
  "Design Agent",
  "Website Agent",
  "Pricing Agent",
  "Marketing Agent",
  "Growth Agent",
  "Strategy Agent",
  "Competitor Agent",
]);

const RESEARCH_KEYS = new Set<AgentKey>(["competitor", "market", "pricing"]);
const RESEARCH_LABELS = new Set(["Competitor Agent", "Market Research Agent", "Pricing Agent"]);

/** Notes that mean research/search limits, not a broken core generation. */
const RESEARCH_LIMIT_NOTES = [
  "search-not-configured",
  "research-no-competitors",
  "research-no-results",
  "research-search-failed",
  "research-failed",
  "no-results",
  "research",
];

const LOGO_LIMIT_NOTES = ["image-gen-not-configured", "image-", "image-storage"];

/** Industry-stock phrases that often leak into "generic" packages when offer context is ignored. */
const STOCK_TOPIC_MARKERS = [
  "behind the kitchen",
  "ingredient spotlights",
  "customer favorites",
  "seasonal specials",
  "meet the team",
  "transformation stories",
  "form tutorials",
  "recovery tips",
  "meal prep ideas",
  "coach spotlights",
  "routine guides",
  "skin-type advice",
  "product comparisons",
  "before & after",
  "product breakdowns",
  "aftercare tips",
  "trend reports",
  "client spotlights",
  "product deep-dives",
  "customer case studies",
  "industry benchmarks",
  "how-to guides",
  "changelog",
  "styling guides",
  "behind the design",
  "material stories",
  "seasonal lookbooks",
  "client results",
  "industry insights",
  "frameworks & playbooks",
  "team expertise",
  "faqs answered",
  "student wins",
  "quick tutorials",
  "common mistakes",
  "curriculum previews",
  "career advice",
  "before & after projects",
  "maintenance tips",
  "cost guides",
  "customer reviews",
  "seasonal checklists",
  "buying guides",
  "inspection checklists",
  "running-cost comparisons",
  "customer handovers",
  "destination guides",
  "itinerary ideas",
  "guest stories",
  "seasonal highlights",
  "practical travel tips",
  "delivery tips for sellers",
  "coverage updates",
  "packaging advice",
  "behind the route",
  "harvest updates",
  "meet the farm",
  "neighbourhood guides",
  "market updates",
  "featured listings",
  "owner advice",
  "customer stories",
  "behind the scenes",
  "tips & guides",
  "product highlights",
  "team spotlights",
  "brand stories",
];

function noteTokens(note: string | undefined): string[] {
  if (!note) return [];
  return note.split(/,\s*/).map((n) => n.trim()).filter(Boolean);
}

function isResearchLimitNote(note: string): boolean {
  return RESEARCH_LIMIT_NOTES.some((prefix) => note === prefix || note.startsWith(prefix));
}

function isLogoLimitNote(note: string): boolean {
  return LOGO_LIMIT_NOTES.some((prefix) => note === prefix || note.startsWith(prefix));
}

/** Partial logo success still produced a usable asset — not "unavailable". */
function isPartialLogoSuccess(entry: AgentLogEntry): boolean {
  const tokens = noteTokens(entry.note);
  return tokens.length > 0 && tokens.every((t) => t.startsWith("partial:"));
}

function isCritical(entry: AgentLogEntry): boolean {
  if (entry.agentKey) return CRITICAL_KEYS.has(entry.agentKey);
  return CRITICAL_LABELS.has(entry.agent);
}

function isResearchAgent(entry: AgentLogEntry): boolean {
  if (entry.agentKey) return RESEARCH_KEYS.has(entry.agentKey);
  return RESEARCH_LABELS.has(entry.agent);
}

function isLogoAgent(entry: AgentLogEntry): boolean {
  return entry.agentKey === "logo" || entry.agent === "Logo Agent";
}

function classifyEntry(entry: AgentLogEntry): GenerationLimitation | null {
  if (entry.status === "ok") return null;

  // One of two logo assets failed but a generated logo exists — do not flag unavailable here;
  // assessGenerationQuality checks brand.logo.status for the real truth.
  if (isLogoAgent(entry) && isPartialLogoSuccess(entry)) return null;

  const tokens = noteTokens(entry.note);
  const researchOnly = tokens.length > 0 && tokens.every(isResearchLimitNote);
  const logoOnly =
    isLogoAgent(entry) || (tokens.length > 0 && tokens.every((t) => isLogoLimitNote(t) || isResearchLimitNote(t)));

  if (isLogoAgent(entry) || (logoOnly && !isCritical(entry))) {
    return "logoUnavailable";
  }
  if (researchOnly && isResearchAgent(entry)) {
    return "researchLimited";
  }
  if (isCritical(entry)) return "criticalFallback";
  return "optionalFallback";
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4),
  );
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hit = 0;
  for (const w of a) if (b.has(w)) hit++;
  return hit / Math.min(a.size, b.size);
}

/** True when marketing pillars look like stock industry topics rather than this offer. */
export function marketingLooksGeneric(
  strategy: Pick<MarketingStrategy, "contentPillars" | "calendar" | "positioning"> | undefined,
  offer: string,
  audience: string,
): boolean {
  if (!strategy?.contentPillars?.length) return false;
  const offerTokens = tokenize(`${offer} ${audience}`);
  const pillarBlob = strategy.contentPillars
    .map((p) => `${p.pillar} ${p.description} ${p.sampleTopics.join(" ")}`)
    .join(" ")
    .toLowerCase();
  const stockHits = STOCK_TOPIC_MARKERS.filter((m) => pillarBlob.includes(m)).length;
  if (stockHits >= 3) return true;

  const pillarTokens = tokenize(pillarBlob);
  // Offer-specific copy should share meaningful tokens with the owner's words.
  if (offerTokens.size >= 3 && overlapRatio(offerTokens, pillarTokens) < 0.12 && stockHits >= 1) {
    return true;
  }

  const calendarThemes = (strategy.calendar ?? []).map((w) => w.theme.toLowerCase());
  const calendarStock = calendarThemes.filter((t) => STOCK_TOPIC_MARKERS.some((m) => t.includes(m) || m.includes(t))).length;
  return calendarStock >= 3 && overlapRatio(offerTokens, tokenize(calendarThemes.join(" "))) < 0.12;
}

function brandLooksGeneric(
  brand: Pick<BusinessPackage["brand"], "description" | "mission" | "slogan">,
  offer: string,
  audience: string,
): boolean {
  const blob = `${brand.description} ${brand.mission} ${brand.slogan}`.toLowerCase();
  const offerTokens = tokenize(`${offer} ${audience}`);
  if (offerTokens.size < 2) return false;
  // Generic industry boilerplate often says "brand focused on" + industry label without offer terms.
  const vague = /\b(done right|reimagined|come first|made simple|genuine care|without compromise)\b/i.test(blob);
  return vague && overlapRatio(offerTokens, tokenize(blob)) < 0.15;
}

function researchIsThin(pkg: Pick<BusinessPackage, "competitors" | "marketResearch">): boolean {
  const comps = pkg.competitors;
  const market = pkg.marketResearch;
  const noComps =
    !comps.available ||
    comps.status === "search-not-configured" ||
    comps.status === "error" ||
    comps.status === "no-results" ||
    (comps.competitors?.length ?? 0) === 0;
  const noMarket =
    !market.available ||
    market.status === "search-not-configured" ||
    market.status === "error" ||
    market.status === "no-results" ||
    (!(market.trends?.length) && !(market.demandSignals?.length) && !(market.sources?.length));
  return noComps && noMarket;
}

/**
 * Deterministic quality assessment from package metadata and a few package fields.
 * Safe for historical packages that lack `meta.quality` (callers may store the result).
 * Does not use network or LLM calls.
 *
 * Separates execution health (fallbacks/errors) from content usefulness (specificity,
 * evidence, owner-context gaps). A structurally valid but generic package is never
 * an unqualified `success`.
 */
export function assessGenerationQuality(
  pkg: Pick<BusinessPackage, "meta" | "brand" | "competitors" | "marketResearch"> & Partial<BusinessPackage>,
): GenerationQuality {
  const limitations = new Set<GenerationLimitation>();
  let critical = false;

  for (const entry of pkg.meta.agentLog) {
    const kind = classifyEntry(entry);
    if (!kind) continue;
    // A generated logo must not carry logoUnavailable from a misleading log note.
    if (kind === "logoUnavailable" && pkg.brand.logo.status === "generated") continue;
    limitations.add(kind);
    if (kind === "criticalFallback") critical = true;
  }

  if (pkg.brand.logo.status !== "generated") {
    limitations.add("logoUnavailable");
  }

  if (!pkg.competitors.available || pkg.competitors.status === "search-not-configured" || pkg.competitors.status === "error") {
    if (pkg.competitors.status === "search-not-configured" || pkg.marketResearch.status === "search-not-configured") {
      limitations.add("researchLimited");
    } else if (pkg.competitors.status === "error" || pkg.marketResearch.status === "error") {
      limitations.add("researchLimited");
    } else if (pkg.competitors.status === "no-results" || pkg.marketResearch.status === "no-results") {
      limitations.add("researchLimited");
    }
  } else if (pkg.marketResearch.status === "search-not-configured" || pkg.marketResearch.status === "error" || pkg.marketResearch.status === "no-results") {
    limitations.add("researchLimited");
  }

  // Full packages (orchestrator) also run deterministic cross-deliverable checks.
  // Only error-severity issues affect quality outcome; soft warnings stay inspectable via assessPackageConsistency.
  if (pkg.input && pkg.website && pkg.marketing && pkg.pricing) {
    const consistency = assessPackageConsistency(pkg as BusinessPackage);
    if (hasConsistencyErrors(consistency)) {
      limitations.add("consistencyWarnings");
      critical = true;
    }
  }

  // Content usefulness — never invent scores; flag explainable limitations.
  if (pkg.input) {
    const profile = buildBusinessProfile(pkg.input);
    const readiness = contextReadiness(profile);
    if (readiness.blocking.length > 0) {
      limitations.add("needsOwnerReview");
    }

    const offer =
      pkg.input.discovery?.offer.main?.trim() ||
      pkg.input.discovery?.business.offering?.trim() ||
      pkg.input.idea;
    const audience = pkg.input.audience || pkg.input.discovery?.customer.ideal || "";

    if (pkg.marketing?.strategy && marketingLooksGeneric(pkg.marketing.strategy, offer, audience)) {
      limitations.add("genericContent");
    } else if (brandLooksGeneric(pkg.brand, offer, audience)) {
      limitations.add("genericContent");
    }
  }

  if (researchIsThin(pkg)) {
    limitations.add("thinEvidence");
    // Research absence alone is not a failure — but market claims without evidence must not look verified.
    if (!limitations.has("researchLimited")) limitations.add("researchLimited");
  }

  let outcome: GenerationOutcome;
  if (critical) {
    outcome = "degraded";
  } else if (
    limitations.has("genericContent") ||
    limitations.has("needsOwnerReview") ||
    limitations.has("consistencyWarnings")
  ) {
    outcome = "provisional";
  } else {
    // researchLimited / logoUnavailable / optionalFallback / thinEvidence alone stay success
    // with listed limitations — usable drafts without implying verified market research.
    outcome = "success";
  }

  return { outcome, limitations: [...limitations] };
}

const OUTCOME_RANK: Record<GenerationOutcome, number> = {
  success: 0,
  provisional: 1,
  degraded: 2,
};

function worseOutcome(a: GenerationOutcome, b: GenerationOutcome): GenerationOutcome {
  return OUTCOME_RANK[a] >= OUTCOME_RANK[b] ? a : b;
}

function asOutcome(value: unknown): GenerationOutcome | null {
  return value === "success" || value === "provisional" || value === "degraded" ? value : null;
}

/**
 * Read-time quality for UI/API. Merges stored meta.quality with a fresh
 * assessGenerationQuality so older "success" rows cannot hide newly detected
 * consistency/critical/generic limitations. Never upgrades a stored weaker
 * outcome to a stronger one. Lifecycle status (ready/failed) stays separate.
 */
export function packageQuality(pkg: BusinessPackage): GenerationQuality {
  const stored = pkg.meta.quality;
  const derived = assessGenerationQuality(pkg);
  const storedOutcome = asOutcome(stored?.outcome);
  if (!storedOutcome) {
    return derived;
  }

  const storedLimitations = Array.isArray(stored?.limitations)
    ? stored.limitations.filter((l): l is GenerationLimitation => typeof l === "string")
    : [];
  const limitations = new Set<GenerationLimitation>([...storedLimitations, ...derived.limitations]);
  return {
    outcome: worseOutcome(storedOutcome, derived.outcome),
    limitations: [...limitations],
  };
}
