import { buildFactClaims, extractEvidence } from "@/lib/research/evidence";
import {
  RESEARCH_SCHEMA_VERSION,
  researchSnapshotSchema,
  type QueryRun,
  type ResearchContext,
  type ResearchRunResult,
  type ResearchSource,
} from "@/lib/research/model";

export interface AssemblyInput {
  startedAt: string;
  completedAt: string;
  provider: string;
  context: ResearchContext;
  queries: QueryRun[];
  /** Normalized, deduplicated sources. */
  sources: ResearchSource[];
}

/**
 * Builds the canonical snapshot from normalized sources and validates it.
 * Never returns findings when nothing usable was retrieved, and never returns
 * a snapshot that fails schema validation.
 */
export function assembleSnapshot(input: AssemblyInput): ResearchRunResult {
  const failedRun = (error: "allQueriesFailed" | "noResults" | "invalidSnapshot"): ResearchRunResult => ({
    status: "failed",
    error,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    provider: input.provider,
    queries: input.queries,
  });

  const succeeded = input.queries.filter((q) => q.status === "ok").length;
  if (succeeded === 0) return failedRun("allQueriesFailed");
  if (input.sources.length === 0) return failedRun("noResults");

  const failed = input.queries.length - succeeded;
  const evidence = extractEvidence(input.sources);
  const parsed = researchSnapshotSchema.safeParse({
    schemaVersion: RESEARCH_SCHEMA_VERSION,
    status: failed > 0 ? "partial" : "complete",
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    provider: input.provider,
    context: input.context,
    queries: input.queries,
    sources: input.sources,
    evidence,
    claims: buildFactClaims(evidence, input.sources),
    stats: {
      queriesPlanned: input.queries.length,
      queriesSucceeded: succeeded,
      queriesFailed: failed,
      sourcesFound: input.sources.length,
    },
  });
  if (!parsed.success) return failedRun("invalidSnapshot");
  return { status: parsed.data.status, snapshot: parsed.data };
}
