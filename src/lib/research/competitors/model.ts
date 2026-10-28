import { z } from "zod";
import { COMPETITOR_LIMITS, RESEARCH_LIMITS } from "@/lib/research/limits";
import { CONFIDENCE_LEVELS, RESEARCH_DIMENSIONS, type ResearchSnapshot } from "@/lib/research/model";

/**
 * Competitor intelligence: a deterministic view derived from one research
 * snapshot. It never adds information — every field points back to the
 * snapshot's sources, evidence and queries, and anything the evidence does not
 * show is simply absent.
 *
 *   profile  — one validated competitor business (identity + observed signals)
 *   finding  — a comparison across profiles: an observation (what the evidence
 *              shows), an inference (reasoned from observations) or a
 *              recommendation (strategy, derived from inferences)
 */

/**
 * `direct` and `uncertain` come from deterministic classification; `indirect`
 * (a substitute solving the same problem differently) can only be assigned by
 * a reviewer reading the evidence, never by keyword matching.
 */
export const COMPETITOR_TYPES = ["direct", "indirect", "uncertain"] as const;
export type CompetitorType = (typeof COMPETITOR_TYPES)[number];

export const REJECTION_REASONS = [
  "insufficientEvidence",
  "platform",
  "article",
  "supplier",
  "irrelevant",
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export const FINDING_TOPICS = ["offer", "promise", "location", "pricing", "gap"] as const;
export type FindingTopic = (typeof FINDING_TOPICS)[number];

const sourceId = z.string().regex(/^src_[0-9a-f]{12}$/);
const evidenceId = z.string().regex(/^ev_[0-9a-f]{12}$/);
const dimension = z.enum(RESEARCH_DIMENSIONS);

const provenance = {
  evidenceIds: z.array(evidenceId).min(1),
  sourceIds: z.array(sourceId).min(1),
};

/** Text taken from (or matched in) retrieved evidence. */
export const observedTextSchema = z.object({
  value: z.string().min(1).max(RESEARCH_LIMITS.maxSnippetChars),
  ...provenance,
});
export type ObservedText = z.infer<typeof observedTextSchema>;

export const pricingObservationSchema = z.object({
  /** The price exactly as written, e.g. "€3.50" or "29 USD / month". */
  amount: z.string().min(1).max(40),
  excerpt: z.string().min(1).max(COMPETITOR_LIMITS.maxPricingExcerptChars),
  ...provenance,
});
export type PricingObservation = z.infer<typeof pricingObservationSchema>;

/** observed = clear prices in evidence; ambiguous = numbers that may not be prices; unavailable = none shown. */
export const competitorPricingSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("observed"), observations: z.array(pricingObservationSchema).min(1).max(COMPETITOR_LIMITS.maxPricingObservations) }),
  z.object({ status: z.literal("ambiguous") }),
  z.object({ status: z.literal("unavailable") }),
]);
export type CompetitorPricing = z.infer<typeof competitorPricingSchema>;

export const competitorProfileSchema = z.object({
  id: z.string().regex(/^cmp_[0-9a-f]{12}$/),
  /** Taken from a source title (or its domain); provenance is that source. */
  name: z.object({ value: z.string().min(1).max(COMPETITOR_LIMITS.maxNameChars), sourceIds: z.array(sourceId).min(1) }),
  /** A retrieved page of this business. */
  website: z.string().url(),
  /** Canonical (registrable) domain: the competitor's identity. */
  domain: z.string().min(1),
  /** What the retrieved listing says about the business. */
  listing: observedTextSchema,
  /** Present only when the business context's location appears in this competitor's evidence. */
  location: observedTextSchema.optional(),
  pricing: competitorPricingSchema,
  classification: z.object({
    type: z.enum(COMPETITOR_TYPES),
    /** Business-context offer terms found in this competitor's evidence. */
    matchedTerms: z.array(z.string().min(1)),
    /** null when the business context has no location. */
    locationMatched: z.boolean().nullable(),
  }),
  sourceIds: z.array(sourceId).min(1),
  evidenceIds: z.array(evidenceId).min(1),
  queryIds: z.array(dimension).min(1),
  confidence: z.enum(CONFIDENCE_LEVELS),
});
export type CompetitorProfile = z.infer<typeof competitorProfileSchema>;

export const rejectedCandidateSchema = z.object({
  sourceId,
  reason: z.enum(REJECTION_REASONS),
});
export type RejectedCandidate = z.infer<typeof rejectedCandidateSchema>;

const findingBase = {
  id: z.string().regex(/^cf_[0-9a-f]{12}$/),
  topic: z.enum(FINDING_TOPICS),
  statement: z.string().min(1),
};

export const observationFindingSchema = z.object({
  ...findingBase,
  kind: z.literal("observation"),
  competitorIds: z.array(z.string()).min(1),
  ...provenance,
});

export const derivedFindingSchema = z.object({
  ...findingBase,
  kind: z.enum(["inference", "recommendation"]),
  basedOn: z.array(z.string()).min(1),
});

export const comparisonFindingSchema = z.union([observationFindingSchema, derivedFindingSchema]);
export type ObservationFinding = z.infer<typeof observationFindingSchema>;
export type DerivedFinding = z.infer<typeof derivedFindingSchema>;
export type ComparisonFinding = z.infer<typeof comparisonFindingSchema>;

export const competitorIntelligenceSchema = z
  .object({
    competitors: z.array(competitorProfileSchema).max(COMPETITOR_LIMITS.maxCompetitors),
    rejected: z.array(rejectedCandidateSchema),
    findings: z.array(comparisonFindingSchema).max(COMPETITOR_LIMITS.maxFindings),
  })
  .superRefine((intel, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    const unique = (values: string[], what: string) => {
      if (new Set(values).size !== values.length) issue(`duplicate ${what}`);
    };
    unique(intel.competitors.map((c) => c.id), "competitor ids");
    unique(intel.competitors.map((c) => c.domain), "competitor domains");
    unique(intel.findings.map((f) => f.id), "finding ids");

    const profiles = new Map(intel.competitors.map((c) => [c.id, c]));
    for (const c of intel.competitors) {
      const sources = new Set(c.sourceIds);
      const evidence = new Set(c.evidenceIds);
      const signals = [c.listing, ...(c.location ? [c.location] : []), ...(c.pricing.status === "observed" ? c.pricing.observations : [])];
      if (!c.name.sourceIds.every((id) => sources.has(id))) issue(`competitor ${c.id} name cites a source it does not own`);
      for (const signal of signals) {
        if (!signal.sourceIds.every((id) => sources.has(id)) || !signal.evidenceIds.every((id) => evidence.has(id))) {
          issue(`competitor ${c.id} has a signal citing provenance it does not own`);
        }
      }
    }

    const seen = new Map<string, ComparisonFinding["kind"]>();
    for (const f of intel.findings) {
      if (f.kind === "observation") {
        for (const id of f.competitorIds) {
          const profile = profiles.get(id);
          if (!profile) issue(`finding ${f.id} references unknown competitor ${id}`);
        }
        const owned = new Set(f.competitorIds.flatMap((id) => profiles.get(id)?.evidenceIds ?? []));
        if (!f.evidenceIds.every((id) => owned.has(id))) issue(`finding ${f.id} cites evidence outside its competitors`);
      } else {
        // Derived findings only build on earlier findings, and never on a recommendation.
        for (const id of f.basedOn) {
          const basis = seen.get(id);
          if (!basis) issue(`finding ${f.id} is based on unknown or later finding ${id}`);
          else if (basis === "recommendation") issue(`finding ${f.id} cannot be based on a recommendation`);
        }
      }
      seen.set(f.id, f.kind);
    }
  });
export type CompetitorIntelligence = z.infer<typeof competitorIntelligenceSchema>;

/** Cross-checks intelligence against the snapshot it claims to come from. Empty = fully traceable. */
export function competitorProvenanceIssues(intel: CompetitorIntelligence, snapshot: ResearchSnapshot): string[] {
  const issues: string[] = [];
  const sources = new Map(snapshot.sources.map((s) => [s.id, s]));
  const evidence = new Map(snapshot.evidence.map((e) => [e.id, e]));
  const okQueries = new Set(snapshot.queries.filter((q) => q.status === "ok").map((q) => q.id));

  for (const c of intel.competitors) {
    for (const id of c.sourceIds) if (!sources.has(id)) issues.push(`competitor ${c.id} cites unknown source ${id}`);
    for (const id of c.evidenceIds) {
      const e = evidence.get(id);
      if (!e) issues.push(`competitor ${c.id} cites unknown evidence ${id}`);
      else if (!c.sourceIds.includes(e.sourceId)) issues.push(`competitor ${c.id} cites evidence ${id} from a source it does not own`);
    }
    for (const q of c.queryIds) if (!okQueries.has(q)) issues.push(`competitor ${c.id} cites query ${q} that did not succeed`);
    if (!sources.has(c.name.sourceIds[0] ?? "")) issues.push(`competitor ${c.id} name has no known source`);
    if (!c.sourceIds.some((id) => sources.get(id)?.url === c.website)) issues.push(`competitor ${c.id} website is not a retrieved page`);
  }
  for (const r of intel.rejected) if (!sources.has(r.sourceId)) issues.push(`rejection cites unknown source ${r.sourceId}`);
  return issues;
}
