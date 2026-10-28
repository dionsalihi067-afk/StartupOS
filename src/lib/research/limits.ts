/**
 * Hard ceilings for one research run. Callers may lower these (see
 * `resolveLimits`) but never raise them, so a run can never exceed this
 * external-search budget.
 */
export const RESEARCH_LIMITS = {
  /** Six general dimensions plus three competitor-discovery dimensions. */
  maxQueries: 9,
  maxResultsPerQuery: 5,
  maxSources: 40,
  /** Per provider request; the engine also enforces it independently of the provider. */
  requestTimeoutMs: 12_000,
  maxQueryChars: 160,
  maxTermChars: 60,
  maxTitleChars: 200,
  maxSnippetChars: 500,
  maxPublisherChars: 120,
} as const;

export type ResearchLimits = { -readonly [K in keyof typeof RESEARCH_LIMITS]: number };

/** Ceilings for competitor intelligence derived from one snapshot. */
export const COMPETITOR_LIMITS = {
  maxCompetitors: 8,
  maxPricingObservations: 3,
  maxPricingExcerptChars: 160,
  maxNameChars: 80,
  maxFindings: 12,
} as const;

/** Ceilings for the research projected into a single agent prompt. */
export const AGENT_RESEARCH_LIMITS = {
  maxClaims: 8,
  maxSources: 12,
  maxCompetitors: 6,
  maxCompetitorFindings: 6,
  maxSourceRefsPerClaim: 3,
  maxStatementChars: 300,
  maxSourceTitleChars: 100,
  /** Longer URLs are omitted; the domain still identifies the source. */
  maxUrlChars: 200,
  /** Research older than this is presented as possibly outdated, never as current. */
  staleAfterDays: 30,
} as const;

/** Applies server-side overrides, clamped to the hard ceilings. */
export function resolveLimits(overrides: Partial<ResearchLimits> = {}): ResearchLimits {
  const out: ResearchLimits = { ...RESEARCH_LIMITS };
  for (const key of Object.keys(RESEARCH_LIMITS) as (keyof ResearchLimits)[]) {
    const value = overrides[key];
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
      out[key] = Math.min(value, RESEARCH_LIMITS[key]);
    }
  }
  return out;
}
