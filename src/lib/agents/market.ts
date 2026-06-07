import "server-only";
import type { MarketInsight, MarketResearch } from "@/lib/types";
import { nonEmpty, ensureArray } from "@/lib/utils";
import { generateJson } from "@/lib/ai/client";
import { marketResearchLlmSchema } from "@/lib/schemas";
import { multiSearch } from "@/lib/services/search";
import type { AgentOutput, GenerationContext } from "@/lib/agents/context";

/**
 * Market Research Agent.
 *
 * Runs REAL web searches for market trends, demand signals and audience
 * behavior, then summarizes the actual findings with source citations. It is
 * explicitly forbidden from inventing statistics — every number must originate
 * from a retrieved result. Reports unavailable when no search provider exists.
 */
export async function runMarketAgent(ctx: GenerationContext): Promise<AgentOutput<MarketResearch>> {
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

  const res = await generateJson<unknown>({
    system:
      "You are a market research analyst. You will be given REAL web search results. Summarize ONLY what these sources actually say. CRITICAL: never invent statistics, figures, percentages or facts. If a number is not explicitly present in the provided snippets, do not state it. Every insight must cite the URL(s) it came from.",
    user: `Market to research: ${industry.label} for "${input.idea}"
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
    temperature: 0.3,
    maxTokens: 1800,
  });

  const parsed = marketResearchLlmSchema.safeParse(res.data);
  if (!res.data || !parsed.success) {
    return {
      data: {
        ...empty("ok", provider, okQueries),
        summary: `Retrieved ${results.length} real market sources via ${provider}.`,
        sources: results,
      },
      source: "deterministic",
      note: "llm-unparseable",
    };
  }

  const validUrls = new Set(results.map((r) => r.url));
  const clean = (items: { insight?: string; sources?: string[] }[] | undefined): MarketInsight[] =>
    ensureArray(items, [])
      .map((it) => ({
        insight: nonEmpty(it.insight, ""),
        sources: ensureArray(it.sources, []).filter((u) => validUrls.has(u)),
      }))
      .filter((it) => it.insight);

  const d = parsed.data;
  return {
    data: {
      available: true,
      status: "ok",
      provider,
      queries: okQueries,
      summary: nonEmpty(d.summary, `Analysis based on ${results.length} real sources from ${provider}.`),
      trends: clean(d.trends),
      painPoints: clean(d.painPoints),
      demandSignals: clean(d.demandSignals),
      opportunities: clean(d.opportunities),
      sources: results,
    },
    source: "llm",
  };
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
