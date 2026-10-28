import { z } from "zod";
import type { BusinessInput } from "@/lib/types";
import { assembleSnapshot } from "@/lib/research/assemble";
import { resolveLimits, type ResearchLimits } from "@/lib/research/limits";
import { dedupeSources, normalizeHit } from "@/lib/research/normalize";
import { planResearch } from "@/lib/research/planner";
import { ResearchProviderError, type RawSearchHit, type ResearchSearchProvider } from "@/lib/research/provider";
import type { QueryErrorCode, QueryRun, ResearchQuery, ResearchRunResult, ResearchSource } from "@/lib/research/model";

/**
 * Research retrieval pipeline:
 *
 *   business input → planned queries → provider search (isolated per query,
 *   time-boxed) → normalized sources → dedupe → evidence → claims → snapshot
 *
 * Every run is fresh: nothing is cached or reused. Nothing here persists data,
 * calls an LLM or touches generated package content.
 */

export interface RunResearchOptions {
  /** Server-side overrides; clamped to the hard limits. */
  limits?: Partial<ResearchLimits>;
  now?: () => Date;
}

/** Providers are external code: re-check every hit; non-string fields count as absent. */
const hitField = z.unknown().transform((v) => (typeof v === "string" ? v : undefined));
const rawHitSchema = z.object({
  title: hitField,
  url: hitField,
  snippet: hitField,
  publishedAt: hitField,
  publisher: hitField,
});

interface QueryOutcome {
  run: QueryRun;
  sources: ResearchSource[];
}

/** Rejects if `promise` does not settle in time, even when a provider ignores its own timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ResearchProviderError("timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function errorCode(err: unknown): QueryErrorCode {
  return err instanceof ResearchProviderError ? err.code : "unexpected";
}

async function executeQuery(
  provider: ResearchSearchProvider,
  query: ResearchQuery,
  limits: ResearchLimits,
  now: () => Date,
): Promise<QueryOutcome> {
  let hits: RawSearchHit[];
  try {
    const result: unknown = await withTimeout(
      provider.search(query.text, { maxResults: limits.maxResultsPerQuery, timeoutMs: limits.requestTimeoutMs }),
      limits.requestTimeoutMs,
    );
    if (!Array.isArray(result)) throw new ResearchProviderError("malformed");
    hits = result.slice(0, limits.maxResultsPerQuery).flatMap((item: unknown) => {
      const parsed = rawHitSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  } catch (err) {
    return { run: { ...query, status: "failed", resultCount: 0, error: errorCode(err) }, sources: [] };
  }

  const retrievedAt = now().toISOString();
  const sources = hits
    .map((hit) => normalizeHit({ queryId: query.id, hit }, retrievedAt, limits))
    .filter((s): s is ResearchSource => s !== null);
  return { run: { ...query, status: "ok", resultCount: sources.length }, sources };
}

/** Bound parallel provider calls so a full plan cannot stampede rate limits. */
const RESEARCH_SEARCH_CONCURRENCY = 4;

async function mapPool<T, R>(items: readonly T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(Math.max(concurrency, 1), items.length || 1) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]!);
      }
    }),
  );
  return results;
}

function normalizeQueryKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Runs planned queries with bounded concurrency. Identical query text within one
 * run shares a single provider call; each query id still receives its own
 * QueryRun and source attribution.
 */
async function executeQueries(
  provider: ResearchSearchProvider,
  queries: readonly ResearchQuery[],
  limits: ResearchLimits,
  now: () => Date,
): Promise<QueryOutcome[]> {
  const representatives = new Map<string, ResearchQuery>();
  for (const q of queries) {
    const key = normalizeQueryKey(q.text);
    if (!representatives.has(key)) representatives.set(key, q);
  }

  const unique = [...representatives.values()];
  const sharedByKey = new Map<string, QueryOutcome>();
  await mapPool(unique, RESEARCH_SEARCH_CONCURRENCY, async (q) => {
    const outcome = await executeQuery(provider, q, limits, now);
    sharedByKey.set(normalizeQueryKey(q.text), outcome);
    return outcome;
  });

  return queries.map((q) => {
    const shared = sharedByKey.get(normalizeQueryKey(q.text))!;
    const sources = shared.sources.map((s) => ({ ...s, queryId: q.id }));
    return {
      run:
        shared.run.status === "ok"
          ? { ...q, status: "ok" as const, resultCount: sources.length }
          : { ...q, status: "failed" as const, resultCount: 0, error: shared.run.error },
      sources,
    };
  });
}

export async function runResearch(
  input: BusinessInput,
  provider: ResearchSearchProvider | null,
  options: RunResearchOptions = {},
): Promise<ResearchRunResult> {
  const now = options.now ?? (() => new Date());
  const limits = resolveLimits(options.limits);
  const startedAt = now().toISOString();
  const plan = planResearch(input, limits);

  if (!provider) {
    return { status: "failed", error: "notConfigured", startedAt, completedAt: now().toISOString(), provider: null, queries: [] };
  }

  const outcomes = await executeQueries(provider, plan.queries, limits, now);
  const sources = dedupeSources(
    outcomes.flatMap((o) => o.sources),
    plan.queries.map((q) => q.id),
    limits.maxSources,
  );

  return assembleSnapshot({
    startedAt,
    completedAt: now().toISOString(),
    provider: provider.name,
    context: plan.context,
    queries: outcomes.map((o) => o.run),
    sources,
  });
}
