import "server-only";
import type { Competitor, CompetitorAnalysis, SearchResult } from "@/lib/types";
import { nonEmpty, ensureArray } from "@/lib/utils";
import { generateJson } from "@/lib/ai/client";
import { competitorLlmSchema } from "@/lib/schemas";
import { multiSearch, domainOf } from "@/lib/services/search";
import type { AgentOutput, GenerationContext } from "@/lib/agents/context";

/**
 * Competitor Agent.
 *
 * Performs REAL web searches to discover actual competitor businesses, their
 * websites and descriptions. An LLM then structures the real results into
 * competitive intelligence — strictly grounded in the retrieved data, never
 * fabricated. When no search provider is configured the agent reports the
 * capability as unavailable instead of inventing competitors.
 */
export async function runCompetitorAgent(ctx: GenerationContext): Promise<AgentOutput<CompetitorAnalysis>> {
  const { input, industry } = ctx;
  const city = input.location.split(",")[0]!.trim();

  const queries = [
    `${input.idea} ${input.location}`,
    `best ${industry.label} in ${city}`,
    `${industry.label} companies near ${city}`,
    `${input.idea} competitors`,
    `top ${industry.label} brands ${city}`,
  ];

  const { provider, queries: okQueries, results } = await multiSearch(queries, 5);

  if (!provider) {
    return {
      data: emptyAnalysis("search-not-configured", null, []),
      source: "deterministic",
      note: "search-not-configured",
    };
  }

  // Provider configured but every query failed (e.g. auth/network) → explicit error.
  if (okQueries.length === 0) {
    return { data: emptyAnalysis("error", provider, []), source: "deterministic", note: "search-failed" };
  }

  if (results.length === 0) {
    return {
      data: emptyAnalysis("no-results", provider, okQueries),
      source: "deterministic",
      note: "no-results",
    };
  }

  // Without an LLM we still return REAL competitors derived directly from search.
  if (!ctx.useLlm) {
    return {
      data: {
        ...emptyAnalysis("ok", provider, okQueries),
        marketOverview: `Found ${results.length} real businesses related to "${input.idea}" in ${input.location} via ${provider} web search. Connect an LLM key to generate a deeper competitive analysis from these results.`,
        competitors: rawCompetitors(ctx, results),
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
      "You are a competitive intelligence analyst. You will be given REAL web search results. Using ONLY those results, identify actual competitor businesses. CRITICAL: do not invent any company, website, statistic, price, or fact that is not present in the results. Every competitor's website MUST be one of the provided URLs. If the results do not contain enough genuine competitors, return fewer (an empty array is acceptable).",
    user: `Business being launched: ${input.idea}
Industry: ${industry.label}
Location: ${input.location}
Target audience: ${input.audience}

REAL WEB SEARCH RESULTS:
${numbered}

Return JSON with:
- "competitors": array of real businesses found in the results, each { "name", "website" (must be a URL from the results), "type" ("direct"|"indirect"|"local"), "category" (the kind of business, e.g. "Specialty coffee shop"), "description" (grounded in the snippet), "strengths" (max 2, inferred only from the snippet), "weaknesses" (max 2, reasonable gaps), "sources" (URLs from the results that mention this business) }
- "marketOverview": 2 sentences summarizing ONLY what the real results show about this market
- "swot": strategic SWOT for the NEW business entering this market { "strengths"[3], "weaknesses"[3], "opportunities"[3], "threats"[3] } (this is forward-looking strategy, not factual claims)
- "differentiation": 4 ways the new business can stand out from the real competitors found
- "opportunityGaps": 3 gaps observed in the real competitors`,
    temperature: 0.4,
    maxTokens: 2200,
  });

  const parsed = competitorLlmSchema.safeParse(res.data);
  if (!res.data || !parsed.success) {
    // LLM failed — still return the REAL search-derived competitors.
    return {
      data: {
        ...emptyAnalysis("ok", provider, okQueries),
        marketOverview: `Retrieved ${results.length} real results for "${input.idea}" in ${input.location} via ${provider}.`,
        competitors: rawCompetitors(ctx, results),
        sources: results,
      },
      source: "deterministic",
      note: "llm-unparseable",
    };
  }

  const validUrls = new Set(results.map((r) => r.url));
  const d = parsed.data;

  // Keep only competitors whose website is a real, retrieved URL (anti-hallucination).
  const competitors: Competitor[] = ensureArray(d.competitors, [])
    .map((c) => {
      const website = nonEmpty(c.website, "");
      const grounded = validUrls.has(website) ? website : matchUrl(website, results);
      const srcs = ensureArray(c.sources, []).filter((u) => validUrls.has(u) || u === grounded);
      return {
        name: nonEmpty(c.name, grounded ? domainOf(grounded) : ""),
        type: c.type ?? "direct",
        category: nonEmpty(c.category, industry.label),
        description: nonEmpty(c.description, ""),
        website: grounded,
        strengths: ensureArray(c.strengths, []).slice(0, 3),
        weaknesses: ensureArray(c.weaknesses, []).slice(0, 3),
        // Every competitor must carry at least one real source URL.
        sources: srcs.length > 0 ? srcs : grounded ? [grounded] : [],
      };
    })
    .filter((c) => c.name && c.website && c.sources.length > 0);

  const finalCompetitors = competitors.length > 0 ? competitors : rawCompetitors(ctx, results);

  return {
    data: {
      available: true,
      status: "ok",
      provider,
      queries: okQueries,
      marketOverview: nonEmpty(d.marketOverview, `Analysis based on ${results.length} real web results from ${provider}.`),
      competitors: finalCompetitors,
      swot: {
        strengths: ensureArray(d.swot?.strengths, []),
        weaknesses: ensureArray(d.swot?.weaknesses, []),
        opportunities: ensureArray(d.swot?.opportunities, []),
        threats: ensureArray(d.swot?.threats, []),
      },
      differentiation: ensureArray(d.differentiation, []),
      opportunityGaps: ensureArray(d.opportunityGaps, []),
      sources: results,
    },
    source: "llm",
  };
}

/* ------------------------------ Helpers -------------------------------- */

function emptyAnalysis(
  status: CompetitorAnalysis["status"],
  provider: string | null,
  queries: string[],
): CompetitorAnalysis {
  return {
    available: status === "ok",
    status,
    provider,
    queries,
    marketOverview: "",
    competitors: [],
    swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
    differentiation: [],
    opportunityGaps: [],
    sources: [],
  };
}

/** Builds real competitor records straight from search results (no LLM). */
function rawCompetitors(ctx: GenerationContext, results: SearchResult[]): Competitor[] {
  const city = ctx.input.location.split(",")[0]!.trim().toLowerCase();
  const seenDomains = new Set<string>();
  const out: Competitor[] = [];

  for (const r of results) {
    const domain = domainOf(r.url);
    if (seenDomains.has(domain)) continue;
    if (isNonBusinessDomain(domain)) continue;
    seenDomains.add(domain);
    const text = `${r.title} ${r.snippet}`.toLowerCase();
    out.push({
      name: cleanName(r.title, domain),
      type: text.includes(city) ? "local" : "direct",
      category: ctx.industry.label,
      description: r.snippet || `Business found at ${domain}.`,
      website: r.url,
      strengths: [],
      weaknesses: [],
      sources: [r.url],
    });
    if (out.length >= 8) break;
  }
  return out;
}

function cleanName(title: string, domain: string): string {
  const cut = title.split(/[|\-–—:·]/)[0]!.trim();
  return cut.length >= 2 && cut.length <= 60 ? cut : domain;
}

function isNonBusinessDomain(domain: string): boolean {
  return [
    "wikipedia.org",
    "reddit.com",
    "quora.com",
    "youtube.com",
    "facebook.com",
    "instagram.com",
    "tiktok.com",
    "linkedin.com",
    "pinterest.com",
    "amazon.com",
    "yelp.com",
    "tripadvisor.com",
  ].some((d) => domain.endsWith(d));
}

function matchUrl(candidate: string, results: SearchResult[]): string {
  if (!candidate) return "";
  const dom = domainOf(candidate);
  const hit = results.find((r) => domainOf(r.url) === dom);
  return hit?.url ?? "";
}
