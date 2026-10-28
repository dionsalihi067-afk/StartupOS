import {
  DIMENSION_CATEGORY,
  researchEvidenceSchema,
  type FactClaim,
  type ResearchCategory,
  type ResearchEvidence,
  type ResearchSource,
} from "@/lib/research/model";

/**
 * Evidence and claim construction. A search snippet is only an evidence
 * candidate: it becomes a `fact` claim attributed to its source ("source
 * reports …") with low confidence, never an established truth. Retrieval
 * produces no inferences or recommendations: those need synthesis, and the
 * snapshot schema only accepts them when they cite existing claims.
 */

/** Category implied by the queries that found a source; null when they disagree. */
export function categorize(source: Pick<ResearchSource, "queryIds">): ResearchCategory | null {
  const categories = new Set(source.queryIds.map((q) => DIMENSION_CATEGORY[q]));
  return categories.size === 1 ? [...categories][0]! : null;
}

function suffix(id: string): string {
  return id.slice(id.indexOf("_") + 1);
}

/** One evidence item per source with a non-empty snippet. Sources without text stay sources only. */
export function extractEvidence(sources: readonly ResearchSource[]): ResearchEvidence[] {
  return sources
    .filter((s) => s.snippet.length > 0)
    .map((s) =>
      researchEvidenceSchema.parse({
        id: `ev_${suffix(s.id)}`,
        sourceId: s.id,
        excerpt: s.snippet,
        category: categorize(s),
        queryIds: s.queryIds,
      }),
    );
}

/** Attributed fact claims for evidence whose category is known. Unclassified evidence is kept, but not claimed. */
export function buildFactClaims(evidence: readonly ResearchEvidence[], sources: readonly ResearchSource[]): FactClaim[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const claims: FactClaim[] = [];
  for (const e of evidence) {
    const source = byId.get(e.sourceId);
    if (!source || !e.category) continue;
    claims.push({
      id: `cl_${suffix(e.id)}`,
      kind: "fact",
      basis: "source-reported",
      category: e.category,
      statement: `${source.publisher ?? source.domain} reports: ${e.excerpt}`,
      confidence: "low",
      evidenceIds: [e.id],
      sourceIds: [source.id],
    });
  }
  return claims;
}
