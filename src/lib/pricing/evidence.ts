import { buildCompetitorIntelligence } from "@/lib/research/competitors/assemble";
import type { CompetitorIntelligence, CompetitorProfile } from "@/lib/research/competitors/model";
import type { ResearchEvidence, ResearchRunResult } from "@/lib/research/model";
import {
  pricingEvidenceIssues,
  pricingEvidenceSchema,
  type CompetitorPricingEvidence,
  type PricingEvidence,
} from "@/lib/pricing/model";
import { normalizePrice } from "@/lib/pricing/normalize";

/**
 * Builds pricing evidence from validated competitor intelligence only — never
 * from raw search results, the owner's answers or the client. Anything that
 * fails validation is dropped, leaving "no pricing evidence" rather than
 * unverifiable prices.
 */

export const NO_RESEARCH_EVIDENCE: PricingEvidence = { research: "absent", competitors: [] };

const ON_REQUEST =
  /\b(?:contact (?:us )?for (?:pricing|prices|a quote)|request a (?:quote|price)|get a quote|price on request|pricing on request|call for (?:pricing|prices)|custom pricing)\b|çmimi sipas kërkesës|na kontaktoni për (?:çmim|ofert)/i;
const FREE_OFFER = /\b(?:free trial|free plan|free tier|free version|freemium)\b|provë falas|plan falas/i;

/** `intel` lets callers that already built competitor intelligence for this run reuse it. */
export function buildPricingEvidence(
  research: ResearchRunResult | undefined,
  intel?: CompetitorIntelligence | null,
): PricingEvidence {
  if (!research) return NO_RESEARCH_EVIDENCE;
  if (research.status === "failed") return { research: "failed", competitors: [] };

  const snapshot = research.snapshot;
  const intelligence = intel === undefined ? buildCompetitorIntelligence(snapshot) : intel;
  const excerpts = new Map(snapshot.evidence.map((e) => [e.id, e]));
  const candidate = {
    research: snapshot.status,
    competitors: (intelligence?.competitors ?? []).map((p) => competitorPricing(p, excerpts)),
  };

  const parsed = pricingEvidenceSchema.safeParse(candidate);
  if (!parsed.success || pricingEvidenceIssues(parsed.data, snapshot).length > 0) {
    return { research: snapshot.status, competitors: [] };
  }
  return parsed.data;
}

function competitorPricing(p: CompetitorProfile, excerpts: Map<string, ResearchEvidence>): CompetitorPricingEvidence {
  const evidence = p.evidenceIds.flatMap((id) => excerpts.get(id) ?? []);
  const matching = (re: RegExp) => evidence.filter((e) => re.test(e.excerpt));
  const free = matching(FREE_OFFER);

  const base = {
    competitorId: p.id,
    name: p.name.value,
    domain: p.domain,
    queryIds: p.queryIds,
    confidence: p.confidence,
    ...(free.length > 0 ? { freeOffer: provenanceOf(free) } : {}),
  };

  if (p.pricing.status === "observed") {
    const points = p.pricing.observations.map((o) => ({
      ...normalizePrice(o.amount, o.excerpt),
      sourceIds: o.sourceIds,
      evidenceIds: o.evidenceIds,
    }));
    return {
      ...base,
      status: "published",
      points,
      sourceIds: unique(points.flatMap((x) => x.sourceIds)),
      evidenceIds: unique(points.flatMap((x) => x.evidenceIds)),
    };
  }

  const onRequest = matching(ON_REQUEST);
  if (onRequest.length > 0) return { ...base, status: "onRequest", points: [], ...provenanceOf(onRequest) };
  return { ...base, status: p.pricing.status, points: [], sourceIds: p.sourceIds, evidenceIds: p.evidenceIds };
}

function provenanceOf(evidence: ResearchEvidence[]): { sourceIds: string[]; evidenceIds: string[] } {
  return { sourceIds: unique(evidence.map((e) => e.sourceId)), evidenceIds: unique(evidence.map((e) => e.id)) };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
