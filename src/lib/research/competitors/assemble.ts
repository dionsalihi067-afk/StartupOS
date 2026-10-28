import { COMPETITOR_LIMITS } from "@/lib/research/limits";
import { shortHash } from "@/lib/research/normalize";
import {
  COMPETITOR_DISCOVERY_DIMENSIONS,
  DIRECT_DISCOVERY_DIMENSIONS,
  RESEARCH_DIMENSIONS,
  type ResearchDimension,
  type ResearchEvidence,
  type ResearchSnapshot,
  type ResearchSource,
} from "@/lib/research/model";
import {
  competitorIntelligenceSchema,
  competitorProvenanceIssues,
  type CompetitorIntelligence,
  type CompetitorPricing,
  type CompetitorProfile,
  type PricingObservation,
  type RejectedCandidate,
} from "@/lib/research/competitors/model";
import { compareCompetitors, type EvidenceText } from "@/lib/research/competitors/compare";
import { deriveName, foldText, locationTerms, matchTerms, offerTerms, readPricing, targetsBusinesses } from "@/lib/research/competitors/signals";
import { canonicalDomain, validateCandidate } from "@/lib/research/competitors/validate";

/**
 * Snapshot → competitor intelligence. Pure and deterministic:
 *
 *   competitor-discovery sources → validation → dedupe by canonical domain
 *   (then name + location) → profiles of observed signals → classification
 *   → ranking/cap → comparison → schema + provenance check
 *
 * Returns null if the result would not be fully traceable to the snapshot.
 */

interface Member {
  source: ResearchSource;
  evidence: ResearchEvidence;
  name: string;
  matchedTerms: string[];
  locationHit: boolean;
}

const isDiscovery = (q: ResearchDimension) => (COMPETITOR_DISCOVERY_DIMENSIONS as readonly ResearchDimension[]).includes(q);
const isDirectIntent = (q: ResearchDimension) => (DIRECT_DISCOVERY_DIMENSIONS as readonly ResearchDimension[]).includes(q);
const CONFIDENCE_RANK = { high: 0, medium: 1, low: 2 } as const;

export function buildCompetitorIntelligence(snapshot: ResearchSnapshot): CompetitorIntelligence | null {
  const terms = offerTerms(snapshot.context);
  const placeTerms = locationTerms(snapshot.context);
  const businessMarket = targetsBusinesses(snapshot.context);
  const evidenceBySource = new Map(snapshot.evidence.map((e) => [e.sourceId, e]));

  const rejected: RejectedCandidate[] = [];
  /** Keyed by the canonical domain of the first member. */
  const groups = new Map<string, Member[]>();
  /** Every canonical domain seen → its group, so later pages of a merged business join the same group. */
  const aliases = new Map<string, string>();
  const byName = new Map<string, string>();

  for (const source of snapshot.sources) {
    if (!source.queryIds.some(isDiscovery)) continue;
    const evidence = evidenceBySource.get(source.id);
    if (!evidence) {
      rejected.push({ sourceId: source.id, reason: "insufficientEvidence" });
      continue;
    }
    const check = validateCandidate(source, evidence, terms, { businessMarket });
    if (!check.ok) {
      rejected.push({ sourceId: source.id, reason: check.reason });
      continue;
    }

    const domain = canonicalDomain(source.domain);
    const name = deriveName(source.title, domain, evidence.excerpt, source.publisher);
    const text = `${source.title} ${evidence.excerpt}`;
    const locationHit = placeTerms.length > 0 && matchTerms(placeTerms, text).length > 0;
    // Secondary identity (name + location) only for distinctive names taken from a title, never for domain fallbacks.
    const folded = foldText(name).replace(/[^\p{L}\p{N}]/gu, "");
    const nameKey = name !== domain && folded.length >= 4 ? `${folded}|${locationHit}` : null;
    const key = aliases.get(domain) ?? (nameKey ? byName.get(nameKey) : undefined) ?? domain;

    const member: Member = { source, evidence, name, matchedTerms: check.matchedTerms, locationHit };
    const group = groups.get(key);
    if (group) group.push(member);
    else groups.set(key, [member]);
    aliases.set(domain, key);
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, key);
  }

  const profiles = [...groups.entries()]
    .map(([domain, members], index) => ({ profile: toProfile(domain, members, terms, placeTerms.length > 0, snapshot.context.location), index }))
    .sort((a, b) => rank(a.profile) - rank(b.profile) || a.index - b.index)
    .slice(0, COMPETITOR_LIMITS.maxCompetitors)
    .map((x) => x.profile);

  const texts = new Map<string, EvidenceText[]>();
  for (const [domain, members] of groups) {
    texts.set(competitorId(domain), members.map((m) => ({ evidenceId: m.evidence.id, sourceId: m.source.id, text: `${m.source.title} ${m.evidence.excerpt}` })));
  }

  const parsed = competitorIntelligenceSchema.safeParse({
    competitors: profiles,
    rejected,
    findings: compareCompetitors(profiles, texts, snapshot.context),
  });
  if (!parsed.success || competitorProvenanceIssues(parsed.data, snapshot).length > 0) return null;
  return parsed.data;
}

function competitorId(domain: string): string {
  return `cmp_${shortHash(domain)}`;
}

/** Direct first, then confidence, then corroboration. */
function rank(p: CompetitorProfile): number {
  return (p.classification.type === "direct" ? 0 : 100) + CONFIDENCE_RANK[p.confidence] * 10 - Math.min(p.sourceIds.length, 9);
}

function toProfile(
  domain: string,
  members: readonly Member[],
  terms: readonly string[],
  hasLocation: boolean,
  location: string | undefined,
): CompetitorProfile {
  const first = members[0]!;
  const dimensionOrder = (q: ResearchDimension) => RESEARCH_DIMENSIONS.indexOf(q);
  const queryIds = [...new Set(members.flatMap((m) => m.source.queryIds))].sort((a, b) => dimensionOrder(a) - dimensionOrder(b));
  const matchedTerms = terms.filter((t) => members.some((m) => m.matchedTerms.includes(t)));
  const located = members.find((m) => m.locationHit);
  const locationMatched = hasLocation ? located !== undefined : null;

  const direct =
    queryIds.some(isDirectIntent) && matchedTerms.length * 2 >= terms.length && locationMatched !== false;
  const discoveryQueries = queryIds.filter(isDiscovery).length;

  const profile: CompetitorProfile = {
    id: competitorId(domain),
    name: { value: first.name, sourceIds: [first.source.id] },
    website: first.source.url,
    domain,
    listing: { value: first.evidence.excerpt, evidenceIds: [first.evidence.id], sourceIds: [first.source.id] },
    pricing: pricingOf(members),
    classification: { type: direct ? "direct" : "uncertain", matchedTerms, locationMatched },
    sourceIds: members.map((m) => m.source.id),
    evidenceIds: members.map((m) => m.evidence.id),
    queryIds,
    confidence: discoveryQueries >= 2 ? "medium" : "low",
  };
  if (located && location) {
    profile.location = { value: location, evidenceIds: [located.evidence.id], sourceIds: [located.source.id] };
  }
  return profile;
}

function pricingOf(members: readonly Member[]): CompetitorPricing {
  const observations: PricingObservation[] = [];
  let ambiguous = false;
  for (const m of members) {
    const read = readPricing(m.evidence.excerpt);
    if (read.status === "ambiguous") ambiguous = true;
    if (read.status !== "observed") continue;
    for (const price of read.prices) {
      if (observations.length >= COMPETITOR_LIMITS.maxPricingObservations) break;
      observations.push({ amount: price.amount, excerpt: price.excerpt, evidenceIds: [m.evidence.id], sourceIds: [m.source.id] });
    }
  }
  if (observations.length > 0) return { status: "observed", observations };
  return { status: ambiguous ? "ambiguous" : "unavailable" };
}
