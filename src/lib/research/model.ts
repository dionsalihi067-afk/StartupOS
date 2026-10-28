import { z } from "zod";
import { RESEARCH_LIMITS } from "@/lib/research/limits";

/**
 * Canonical research model. A snapshot is evidence-first:
 *
 *   source   — a normalized external search result (where something was said)
 *   evidence — an excerpt taken from one source (what was said)
 *   claim    — a structured statement StartupOS can use, always traceable:
 *              facts cite evidence + sources; inferences and recommendations
 *              cite the claims they are based on and are never facts.
 *
 * No numeric reliability scores exist anywhere: confidence is qualitative.
 */

export const RESEARCH_SCHEMA_VERSION = 1;

export const RESEARCH_CATEGORIES = ["market", "customer", "competitor", "pricing", "positioning"] as const;
export type ResearchCategory = (typeof RESEARCH_CATEGORIES)[number];

/** What a planned query is trying to learn. Stable ids, one query per dimension. */
export const RESEARCH_DIMENSIONS = [
  "demand",
  "customerNeeds",
  "trends",
  "competitors",
  "pricing",
  "positioning",
  "localCompetitors",
  "directCompetitors",
  "nicheCompetitors",
] as const;
export type ResearchDimension = (typeof RESEARCH_DIMENSIONS)[number];

export const DIMENSION_CATEGORY: Record<ResearchDimension, ResearchCategory> = {
  demand: "market",
  customerNeeds: "customer",
  trends: "market",
  competitors: "competitor",
  pricing: "pricing",
  positioning: "positioning",
  localCompetitors: "competitor",
  directCompetitors: "competitor",
  nicheCompetitors: "competitor",
};

/** Queries whose results are candidate competitor businesses. `competitors` looks for alternatives/substitutes. */
export const COMPETITOR_DISCOVERY_DIMENSIONS = ["localCompetitors", "directCompetitors", "nicheCompetitors", "competitors"] as const satisfies readonly ResearchDimension[];
/** Discovery intents that look for businesses offering the same thing (not substitutes). */
export const DIRECT_DISCOVERY_DIMENSIONS = ["localCompetitors", "directCompetitors", "nicheCompetitors"] as const satisfies readonly ResearchDimension[];

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const QUERY_ERROR_CODES = ["timeout", "http", "malformed", "network", "unexpected"] as const;
export type QueryErrorCode = (typeof QUERY_ERROR_CODES)[number];

export const RESEARCH_RUN_STATUSES = ["complete", "partial", "failed"] as const;
export type ResearchRunStatus = (typeof RESEARCH_RUN_STATUSES)[number];

export const RESEARCH_FAILURE_CODES = ["notConfigured", "allQueriesFailed", "noResults", "invalidSnapshot"] as const;
export type ResearchFailureCode = (typeof RESEARCH_FAILURE_CODES)[number];

const isoDate = z.string().datetime();
const dimension = z.enum(RESEARCH_DIMENSIONS);
const category = z.enum(RESEARCH_CATEGORIES);

/** Public business context the queries were derived from (no ids, budgets or private notes). */
export const researchContextSchema = z.object({
  idea: z.string().min(1),
  customer: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  offer: z.string().min(1).optional(),
  revenueModels: z.array(z.string().min(1)),
});
export type ResearchContext = z.infer<typeof researchContextSchema>;

export const researchQuerySchema = z.object({
  id: dimension,
  text: z.string().min(1).max(RESEARCH_LIMITS.maxQueryChars),
});
export type ResearchQuery = z.infer<typeof researchQuerySchema>;

export const queryRunSchema = researchQuerySchema
  .extend({
    status: z.enum(["ok", "failed"]),
    resultCount: z.number().int().min(0),
    error: z.enum(QUERY_ERROR_CODES).optional(),
  })
  .refine((q) => (q.status === "failed") === (q.error !== undefined), { message: "error is set exactly when a query failed" })
  .refine((q) => q.status === "ok" || q.resultCount === 0, { message: "a failed query has no results" });
export type QueryRun = z.infer<typeof queryRunSchema>;

export const researchSourceSchema = z.object({
  id: z.string().regex(/^src_[0-9a-f]{12}$/),
  url: z.string().url(),
  domain: z.string().min(1),
  title: z.string().min(1).max(RESEARCH_LIMITS.maxTitleChars),
  snippet: z.string().max(RESEARCH_LIMITS.maxSnippetChars),
  /** Only when the provider supplied it. Never the retrieval time. */
  publisher: z.string().min(1).max(RESEARCH_LIMITS.maxPublisherChars).optional(),
  publishedAt: isoDate.optional(),
  retrievedAt: isoDate,
  /** Every query that surfaced this source (provenance survives deduplication). */
  queryIds: z.array(dimension).min(1),
});
export type ResearchSource = z.infer<typeof researchSourceSchema>;

export const researchEvidenceSchema = z.object({
  id: z.string().regex(/^ev_[0-9a-f]{12}$/),
  sourceId: z.string(),
  excerpt: z.string().min(1).max(RESEARCH_LIMITS.maxSnippetChars),
  /** null = could not be classified confidently; kept for later processing. */
  category: category.nullable(),
  queryIds: z.array(dimension).min(1),
});
export type ResearchEvidence = z.infer<typeof researchEvidenceSchema>;

const claimBase = {
  id: z.string().regex(/^cl_[0-9a-f]{12}$/),
  category,
  statement: z.string().min(1),
  confidence: z.enum(CONFIDENCE_LEVELS),
};

/** What a source reports. Attributed, not independently verified. */
export const factClaimSchema = z.object({
  ...claimBase,
  kind: z.literal("fact"),
  basis: z.literal("source-reported"),
  evidenceIds: z.array(z.string()).min(1),
  sourceIds: z.array(z.string()).min(1),
});

/** A conclusion drawn from other claims; never presented as fact. */
export const inferenceClaimSchema = z.object({
  ...claimBase,
  kind: z.literal("inference"),
  basedOnClaimIds: z.array(z.string()).min(1),
});

/** A suggested action derived from other claims. */
export const recommendationClaimSchema = z.object({
  ...claimBase,
  kind: z.literal("recommendation"),
  basedOnClaimIds: z.array(z.string()).min(1),
});

export const researchClaimSchema = z.discriminatedUnion("kind", [
  factClaimSchema,
  inferenceClaimSchema,
  recommendationClaimSchema,
]);
export type ResearchClaim = z.infer<typeof researchClaimSchema>;
export type FactClaim = z.infer<typeof factClaimSchema>;

export const researchSnapshotSchema = z
  .object({
    schemaVersion: z.literal(RESEARCH_SCHEMA_VERSION),
    /** A snapshot exists only when research produced usable sources. */
    status: z.enum(["complete", "partial"]),
    startedAt: isoDate,
    completedAt: isoDate,
    provider: z.string().min(1),
    context: researchContextSchema,
    queries: z.array(queryRunSchema).min(1),
    sources: z.array(researchSourceSchema).min(1),
    evidence: z.array(researchEvidenceSchema),
    claims: z.array(researchClaimSchema),
    stats: z.object({
      queriesPlanned: z.number().int().min(1),
      queriesSucceeded: z.number().int().min(0),
      queriesFailed: z.number().int().min(0),
      sourcesFound: z.number().int().min(1),
    }),
  })
  .superRefine((s, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    const unique = (ids: string[], what: string) => {
      if (new Set(ids).size !== ids.length) issue(`duplicate ${what}`);
    };
    unique(s.queries.map((q) => q.id), "query ids");
    unique(s.sources.map((x) => x.id), "source ids");
    unique(s.sources.map((x) => x.url), "source urls");
    unique(s.evidence.map((x) => x.id), "evidence ids");
    unique(s.claims.map((x) => x.id), "claim ids");

    const succeeded = s.queries.filter((q) => q.status === "ok").length;
    const failed = s.queries.length - succeeded;
    if (s.stats.queriesPlanned !== s.queries.length) issue("stats.queriesPlanned does not match queries");
    if (s.stats.queriesSucceeded !== succeeded) issue("stats.queriesSucceeded does not match queries");
    if (s.stats.queriesFailed !== failed) issue("stats.queriesFailed does not match queries");
    if (s.stats.sourcesFound !== s.sources.length) issue("stats.sourcesFound does not match sources");
    if (s.status === "complete" && failed > 0) issue("a run with failed queries cannot be complete");
    if (s.status === "partial" && failed === 0) issue("a run without failed queries is not partial");
    if (Date.parse(s.completedAt) < Date.parse(s.startedAt)) issue("completedAt precedes startedAt");

    const okQueries = new Set(s.queries.filter((q) => q.status === "ok").map((q) => q.id));
    const sources = new Map(s.sources.map((x) => [x.id, x]));
    for (const source of s.sources) {
      if (source.queryIds.some((q) => !okQueries.has(q))) issue(`source ${source.id} cites a query that did not succeed`);
    }

    const evidence = new Map(s.evidence.map((e) => [e.id, e]));
    for (const e of s.evidence) {
      if (!sources.has(e.sourceId)) issue(`evidence ${e.id} references unknown source ${e.sourceId}`);
    }

    const seenClaims = new Map<string, ResearchClaim["kind"]>();
    for (const claim of s.claims) {
      if (claim.kind === "fact") {
        for (const id of claim.sourceIds) if (!sources.has(id)) issue(`claim ${claim.id} references unknown source ${id}`);
        for (const id of claim.evidenceIds) {
          const e = evidence.get(id);
          if (!e) issue(`claim ${claim.id} references unknown evidence ${id}`);
          else if (!claim.sourceIds.includes(e.sourceId)) issue(`claim ${claim.id} omits the source of evidence ${id}`);
        }
      } else {
        // Inferences and recommendations may only build on claims listed before them, so they stay acyclic and grounded.
        for (const id of claim.basedOnClaimIds) {
          const basis = seenClaims.get(id);
          if (!basis) issue(`claim ${claim.id} is based on unknown or later claim ${id}`);
          else if (basis === "recommendation") issue(`claim ${claim.id} cannot be based on a recommendation`);
        }
      }
      seenClaims.set(claim.id, claim.kind);
    }
  });
export type ResearchSnapshot = z.infer<typeof researchSnapshotSchema>;

/** Outcome of one research run. Failed runs carry no snapshot and no findings. */
export type ResearchRunResult =
  | { status: "complete" | "partial"; snapshot: ResearchSnapshot }
  | {
      status: "failed";
      error: ResearchFailureCode;
      startedAt: string;
      completedAt: string;
      provider: string | null;
      queries: QueryRun[];
    };
