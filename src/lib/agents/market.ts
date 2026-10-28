import "server-only";
import type { MarketInsight, MarketResearch, SearchResult } from "@/lib/types";
import { nonEmpty, ensureArray } from "@/lib/utils";
import { generateJson } from "@/lib/ai/client";
import { marketResearchLlmSchema } from "@/lib/schemas";
import { multiSearch } from "@/lib/services/search";
import { researchUnavailable, withBrief, withLlmTelemetry, withResearch, type AgentOutput, type GenerationContext } from "@/lib/agents/context";
import { acceptMarketInsight, sanitizeMarketSummary } from "@/lib/evidence/claims";
import type { AgentResearchContext, AgentResearchFact, AgentResearchSource } from "@/lib/research/agent-context";

export { acceptMarketInsight, containsQuantitativeClaim, sanitizeMarketSummary } from "@/lib/evidence/claims";

/**
 * Market Research Agent.
 *
 * Runs REAL web searches for market trends, demand signals and audience
 * behavior, then summarizes the actual findings with source citations. It is
 * explicitly forbidden from inventing statistics — every number must originate
 * from a retrieved result. Reports unavailable when no search provider exists.
 *
 * When a research run was supplied, the analysis is built only from this
 * step's research projection (see runFromResearch) and no searches run here.
 */
export async function runMarketAgent(ctx: GenerationContext): Promise<AgentOutput<MarketResearch>> {
  const research = ctx.research?.market;
  if (research) return research.status === "failed" ? researchUnavailable(research, empty) : runFromResearch(ctx, research);

  const { input, industry } = ctx;
  const year = new Date().getFullYear();
  const city = input.location.split(",")[0]!.trim();

  const queries = [
    `${industry.label} market trends ${year}`,
    `${industry.label} industry growth statistics`,
    `${input.audience} ${industry.label} demand trends`,
    `${input.idea} market demand ${city}`,
    `${industry.label} consumer behavior ${year}`,
  ];

  const { provider, queries: okQueries, results } = await multiSearch(queries, 5);

  if (!provider) {
    return { data: empty("search-not-configured", null, []), source: "deterministic", note: "search-not-configured" };
  }
  if (okQueries.length === 0) {
    return { data: empty("error", provider, []), source: "deterministic", note: "search-failed" };
  }
  if (results.length === 0) {
    return { data: empty("no-results", provider, okQueries), source: "deterministic", note: "no-results" };
  }

  if (!ctx.useLlm) {
    return {
      data: {
        ...empty("ok", provider, okQueries),
        summary: `Retrieved ${results.length} real sources about the ${industry.label.toLowerCase()} market via ${provider} search. Connect an LLM key to synthesize cited insights from these sources.`,
        sources: results,
      },
      source: "deterministic",
      note: "raw-search",
    };
  }

  const numbered = results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`)
    .join("\n\n");

  const res = await generateJson({
    system:
      "You are a market research analyst. You will be given REAL web search results. Summarize ONLY what these sources actually say. CRITICAL: never invent statistics, figures, percentages or facts. If a number is not explicitly present in the provided snippets, do not state it. Every insight must cite the URL(s) it came from.",
    user: withResearch(
      ctx,
      "market",
      withBrief(
        ctx,
        `Market to research: ${industry.label} for "${input.idea}"
Audience: ${input.audience}
Location: ${input.location}

REAL WEB SEARCH RESULTS:
${numbered}

Return JSON with:
- "summary": 2-3 sentence overview grounded strictly in the results
- "trends": array of { "insight" (grounded in the sources), "sources" (URLs from results) }
- "painPoints": array of { "insight", "sources" } — customer pain points evidenced in the results
- "demandSignals": array of { "insight", "sources" } — evidence of demand from the results
- "opportunities": array of { "insight", "sources" } — market opportunities supported by the results
Only include items you can support with the provided sources. Never invent numbers.`,
      ),
    ),
    task: "research",
    temperature: 0.3,
    maxTokens: 1800,
    timeoutMs: 90_000,
    schema: marketResearchLlmSchema,
  });

  // Defense in depth for mocks / edge payloads that skip client-side schema.
  const parsed = marketResearchLlmSchema.safeParse(res.data);
  if (!res.data || !parsed.success) {
    return withLlmTelemetry(
      {
        data: {
          ...empty("ok", provider, okQueries),
          summary: `Retrieved ${results.length} real market sources via ${provider}.`,
          sources: results,
        },
        source: "deterministic",
        note: res.note ?? "llm-unparseable",
      },
      res,
    );
  }

  const validUrls = new Set(results.map((r) => r.url));
  // Same contract as the research-grounded path: every insight must cite a
  // retrieved URL. Unsourced claims (including statistics) never reach the package.
  const clean = (items: { insight?: string; sources?: string[] }[] | undefined): MarketInsight[] =>
    ensureArray(items, [])
      .map((it) => ({
        insight: nonEmpty(it.insight, ""),
        sources: ensureArray(it.sources, []).filter((u) => validUrls.has(u)),
      }))
      .filter((it) => acceptMarketInsight(it.insight, it.sources));

  const d = parsed.data;
  return withLlmTelemetry(
    {
      data: {
        available: true,
        status: "ok",
        provider,
        queries: okQueries,
        summary: sanitizeMarketSummary(
          nonEmpty(d.summary, `Analysis based on ${results.length} real sources from ${provider}.`),
        ),
        trends: clean(d.trends),
        painPoints: clean(d.painPoints),
        demandSignals: clean(d.demandSignals),
        opportunities: clean(d.opportunities),
        sources: results,
      },
      source: "llm",
    },
    res,
  );
}

/* ------------------------- Research-grounded path ------------------------ */

/**
 * Sources are the research sources cited by this step's market facts. The
 * model cites them by ref (S1, S2…); insights citing no known ref are dropped,
 * so every insight traces back to retrieved evidence.
 */
async function runFromResearch(ctx: GenerationContext, research: AgentResearchContext): Promise<AgentOutput<MarketResearch>> {
  const { facts } = research;
  const byRef = new Map(research.sources.map((s) => [s.ref, s]));
  const sources = researchSources(facts, byRef);
  if (facts.length === 0 || sources.length === 0) {
    return { data: empty("no-results", null, []), source: "deterministic", note: "research-no-results" };
  }

  const partial = research.status === "partial" ? " Research was partial, so some market evidence may be missing." : "";
  const deterministic: MarketResearch = {
    ...empty("ok", ctx.researchRun?.provider ?? null, ctx.researchRun?.queries ?? []),
    summary: `Research retrieved ${facts.length} market finding${facts.length === 1 ? "" : "s"} from ${sources.length} source${sources.length === 1 ? "" : "s"}.${partial}`,
    sources,
  };
  if (!ctx.useLlm) return { data: deterministic, source: "deterministic", note: "research" };

  const { input, industry } = ctx;
  const res = await generateJson({
    system:
      "You are a market research analyst. Summarize ONLY the research evidence you are given. Never invent statistics, figures, percentages, sources or facts. Every insight must cite the source refs (S1, S2…) it comes from. When the evidence does not cover something, leave it out rather than guessing.",
    user: withResearch(
      ctx,
      "market",
      withBrief(
        ctx,
        `Market to research: ${industry.label} for "${input.idea}"
Audience: ${input.audience}
Location: ${input.location}

Return JSON with:
- "summary": 2-3 sentence overview grounded strictly in the research below
- "trends": array of { "insight", "sources" (source refs such as "S1") }
- "painPoints": array of { "insight", "sources" }
- "demandSignals": array of { "insight", "sources" }
- "opportunities": array of { "insight", "sources" }
Only include items the research below supports. Empty arrays are fine.`,
      ),
    ),
    task: "research",
    temperature: 0.3,
    maxTokens: 1800,
    timeoutMs: 90_000,
    schema: marketResearchLlmSchema,
  });

  // Defense in depth for mocks / edge payloads that skip client-side schema.
  const parsed = marketResearchLlmSchema.safeParse(res.data);
  if (!res.data || !parsed.success) {
    return withLlmTelemetry({ data: deterministic, source: "deterministic", note: res.note ?? "llm-unparseable" }, res);
  }

  const cited = new Set(sources.map((s) => s.url));
  const clean = (items: { insight?: string; sources?: string[] }[] | undefined): MarketInsight[] =>
    ensureArray(items, [])
      .map((it) => ({
        insight: nonEmpty(it.insight, ""),
        sources: [...new Set(ensureArray(it.sources, []).flatMap((ref) => byRef.get(ref.trim())?.url ?? []))].filter((u) => cited.has(u)),
      }))
      .filter((it) => acceptMarketInsight(it.insight, it.sources));

  const d = parsed.data;
  return withLlmTelemetry(
    {
      data: {
        ...deterministic,
        summary: sanitizeMarketSummary(nonEmpty(d.summary, deterministic.summary)),
        trends: clean(d.trends),
        painPoints: clean(d.painPoints),
        demandSignals: clean(d.demandSignals),
        opportunities: clean(d.opportunities),
      },
      source: "llm",
    },
    res,
  );
}

function researchSources(facts: AgentResearchFact[], byRef: Map<string, AgentResearchSource>): SearchResult[] {
  const out = new Map<string, SearchResult>();
  for (const fact of facts) {
    for (const ref of fact.sourceRefs) {
      const s = byRef.get(ref);
      if (!s?.url || out.has(s.url)) continue;
      out.set(s.url, { title: s.title, url: s.url, snippet: fact.statement });
    }
  }
  return [...out.values()];
}

function empty(status: MarketResearch["status"], provider: string | null, queries: string[]): MarketResearch {
  return {
    available: status === "ok",
    status,
    provider,
    queries,
    summary: "",
    trends: [],
    painPoints: [],
    demandSignals: [],
    opportunities: [],
    sources: [],
  };
}
