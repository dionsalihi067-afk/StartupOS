import type { CompetitorPricingEvidence, PricingEvidence, PricingResearchState } from "@/lib/pricing/model";
import { normalizePrice } from "@/lib/pricing/normalize";

const hex = (n: number) => n.toString(16).padStart(12, "0");

export interface CompetitorSpec {
  name?: string;
  /** Each price as [original, excerpt]; a bare string uses itself as the excerpt. */
  prices?: (string | [string, string])[];
  status?: CompetitorPricingEvidence["status"];
  freeOffer?: boolean;
}

/** Hand-built, schema-valid competitor pricing evidence with deterministic ids. */
export function competitorPricing(n: number, spec: CompetitorSpec = {}): CompetitorPricingEvidence {
  const sourceId = `src_${hex(n)}`;
  const points = (spec.prices ?? []).map((price, i) => {
    const [original, excerpt] = typeof price === "string" ? [price, price] : price;
    return { ...normalizePrice(original, excerpt), sourceIds: [sourceId], evidenceIds: [`ev_${hex(n * 100 + i)}`] };
  });
  const evidenceIds = points.length > 0 ? points.flatMap((p) => p.evidenceIds) : [`ev_${hex(n * 100)}`];
  return {
    competitorId: `cmp_${hex(n)}`,
    name: spec.name ?? `Competitor ${n}`,
    domain: `competitor${n}.example`,
    status: spec.status ?? (points.length > 0 ? "published" : "unavailable"),
    points,
    ...(spec.freeOffer ? { freeOffer: { sourceIds: [sourceId], evidenceIds } } : {}),
    queryIds: ["competitors"],
    confidence: "medium",
    sourceIds: [sourceId],
    evidenceIds,
  };
}

export function pricingEvidence(specs: CompetitorSpec[], research: PricingResearchState = "complete"): PricingEvidence {
  return { research, competitors: specs.map((spec, i) => competitorPricing(i + 1, spec)) };
}
