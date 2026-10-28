import { z } from "zod";
import { PRICING_LIMITS } from "@/lib/pricing/limits";
import { COMPETITOR_LIMITS } from "@/lib/research/limits";
import { CONFIDENCE_LEVELS, RESEARCH_DIMENSIONS, type ResearchSnapshot } from "@/lib/research/model";

/**
 * Pricing evidence: competitor prices exactly as the validated research
 * observed them. Every field is either read from the evidence text or absent —
 * a price without a stated billing period keeps `cadence: null`, a bare "$"
 * keeps `currency: null`, and nothing is converted or estimated.
 */

export const CURRENCY_CODES = ["EUR", "USD", "GBP", "CHF", "ALL"] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const CADENCES = ["month", "year", "week", "day", "hour", "session", "person", "user", "night"] as const;
export type Cadence = (typeof CADENCES)[number];

/**
 * recurring   — billed per month/year/week for continued access
 * perUnit     — per day, hour, session, person, user or night
 * oneTime     — the evidence explicitly says one-time / lifetime
 * unspecified — no billing basis stated ("€29")
 */
export const BILLING_BASES = ["recurring", "perUnit", "oneTime", "unspecified"] as const;
export type BillingBasis = (typeof BILLING_BASES)[number];

/** exact = "€29"; from = "from €29" / "starting at €29" (a lower bound). */
export const PRICE_QUALIFIERS = ["exact", "from"] as const;
export type PriceQualifier = (typeof PRICE_QUALIFIERS)[number];

/**
 * published   — at least one explicit price is listed
 * onRequest   — the evidence says to contact / request a quote
 * ambiguous   — numbers are listed that may not be prices
 * unavailable — no price information
 */
export const PRICING_STATUSES = ["published", "onRequest", "ambiguous", "unavailable"] as const;
export type CompetitorPricingStatus = (typeof PRICING_STATUSES)[number];

/** Research outcome the evidence was built from; `absent` = no research was supplied. */
export const PRICING_RESEARCH_STATES = ["complete", "partial", "failed", "absent"] as const;
export type PricingResearchState = (typeof PRICING_RESEARCH_STATES)[number];

const sourceId = z.string().regex(/^src_[0-9a-f]{12}$/);
const evidenceId = z.string().regex(/^ev_[0-9a-f]{12}$/);
const provenance = {
  sourceIds: z.array(sourceId).min(1),
  evidenceIds: z.array(evidenceId).min(1),
};

export const pricePointSchema = z.object({
  /** The price exactly as written in the evidence. */
  original: z.string().min(1).max(PRICING_LIMITS.maxOriginalChars),
  excerpt: z.string().min(1).max(COMPETITOR_LIMITS.maxPricingExcerptChars),
  /** Parsed amount; null when the number cannot be read unambiguously. */
  value: z.number().positive().nullable(),
  currency: z.enum(CURRENCY_CODES).nullable(),
  /** The currency marker when it does not identify one currency (e.g. a bare "$"). */
  currencySymbol: z.string().min(1).max(4).nullable(),
  cadence: z.enum(CADENCES).nullable(),
  billing: z.enum(BILLING_BASES),
  qualifier: z.enum(PRICE_QUALIFIERS),
  ...provenance,
});
export type PricePoint = z.infer<typeof pricePointSchema>;

export const competitorPricingEvidenceSchema = z
  .object({
    competitorId: z.string().regex(/^cmp_[0-9a-f]{12}$/),
    name: z.string().min(1).max(COMPETITOR_LIMITS.maxNameChars),
    domain: z.string().min(1),
    status: z.enum(PRICING_STATUSES),
    points: z.array(pricePointSchema).max(COMPETITOR_LIMITS.maxPricingObservations),
    /** Present when the competitor's evidence mentions a free trial or free plan. */
    freeOffer: z.object(provenance).optional(),
    queryIds: z.array(z.enum(RESEARCH_DIMENSIONS)).min(1),
    confidence: z.enum(CONFIDENCE_LEVELS),
    /** The evidence the status rests on. */
    ...provenance,
  })
  .superRefine((c, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if ((c.status === "published") !== c.points.length > 0) issue(`competitor ${c.competitorId}: only published pricing has price points`);
    const originals = c.points.map((p) => p.original);
    if (new Set(originals).size !== originals.length) issue(`competitor ${c.competitorId}: duplicate price points`);
    const sources = new Set(c.sourceIds);
    const evidence = new Set(c.evidenceIds);
    for (const p of c.points) {
      if (!p.sourceIds.every((id) => sources.has(id)) || !p.evidenceIds.every((id) => evidence.has(id))) {
        issue(`competitor ${c.competitorId}: a price point cites provenance outside the competitor's pricing evidence`);
      }
    }
  });
export type CompetitorPricingEvidence = z.infer<typeof competitorPricingEvidenceSchema>;

export const pricingEvidenceSchema = z
  .object({
    research: z.enum(PRICING_RESEARCH_STATES),
    /** Every validated competitor, priced or not, so transparency keeps its denominator. */
    competitors: z.array(competitorPricingEvidenceSchema).max(COMPETITOR_LIMITS.maxCompetitors),
  })
  .superRefine((e, ctx) => {
    const ids = e.competitors.map((c) => c.competitorId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate competitor pricing" });
    if ((e.research === "failed" || e.research === "absent") && e.competitors.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `research ${e.research} cannot carry competitor pricing` });
    }
  });
export type PricingEvidence = z.infer<typeof pricingEvidenceSchema>;

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

/** Cross-checks pricing evidence against its snapshot. Empty = every price is traceable to retrieved text. */
export function pricingEvidenceIssues(evidence: PricingEvidence, snapshot: ResearchSnapshot): string[] {
  const issues: string[] = [];
  const sources = new Set(snapshot.sources.map((s) => s.id));
  const excerpts = new Map(snapshot.evidence.map((e) => [e.id, e]));
  const okQueries = new Set(snapshot.queries.filter((q) => q.status === "ok").map((q) => q.id));

  const check = (owner: string, ref: { sourceIds: string[]; evidenceIds: string[] }) => {
    for (const id of ref.sourceIds) if (!sources.has(id)) issues.push(`${owner} cites unknown source ${id}`);
    for (const id of ref.evidenceIds) {
      const e = excerpts.get(id);
      if (!e) issues.push(`${owner} cites unknown evidence ${id}`);
      else if (!ref.sourceIds.includes(e.sourceId)) issues.push(`${owner} cites evidence ${id} from an uncited source`);
    }
  };

  for (const c of evidence.competitors) {
    check(`competitor ${c.competitorId}`, c);
    if (c.freeOffer) check(`competitor ${c.competitorId} free offer`, c.freeOffer);
    for (const q of c.queryIds) if (!okQueries.has(q)) issues.push(`competitor ${c.competitorId} cites query ${q} that did not succeed`);
    for (const p of c.points) {
      check(`price ${p.original}`, p);
      const seen = p.evidenceIds.some((id) => collapse(excerpts.get(id)?.excerpt ?? "").includes(collapse(p.original)));
      if (!seen) issues.push(`price ${p.original} does not appear in its evidence`);
    }
  }
  return issues;
}
