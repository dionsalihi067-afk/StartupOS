import "server-only";
import type { Competitor, CompetitorAnalysis, SearchResult } from "@/lib/types";
import { nonEmpty, ensureArray } from "@/lib/utils";
import { generateJson } from "@/lib/ai/client";
import { competitorLlmSchema, competitorResearchLlmSchema } from "@/lib/schemas";
import { multiSearch, domainOf } from "@/lib/services/search";
import { researchUnavailable, withBrief, withLlmTelemetry, withResearch, type AgentOutput, type GenerationContext } from "@/lib/agents/context";
import {
  sanitizeCompetitorAnnotations,
  sanitizeMarketSummary,
  sanitizeStrategicItems,
  sanitizeSwot,
} from "@/lib/evidence/claims";
import type { AgentResearchContext, AgentResearchSource } from "@/lib/research/agent-context";
import type { AgentCompetitorContext, AgentCompetitorProfile } from "@/lib/research/competitors/project";
import { rejectSearchArtifact } from "@/lib/research/competitors/validate";
import { offerTermsFromIdea } from "@/lib/research/competitors/revalidate";

/** Strengths/weaknesses the model may attach to one validated competitor. */
const MAX_RESEARCH_ANNOTATIONS = 2;

/**
 * Competitor Agent.
 *
 * Performs REAL web searches to discover actual competitor businesses, their
 * websites and descriptions. An LLM then structures the real results into
 * competitive intelligence — strictly grounded in the retrieved data, never
 * fabricated. When no search provider is configured the agent reports the
 * capability as unavailable instead of inventing competitors.
 *
 * When a research run was supplied, competitors come only from its validated
 * competitor intelligence instead (see runFromResearch), and a failed run is
 * reported as such — the agent never searches again on its own. Only without
 * any research does the live-search path below run.
 */
export async function runCompetitorAgent(ctx: GenerationContext): Promise<AgentOutput<CompetitorAnalysis>> {
  const research = ctx.research?.competitor;
  if (research) {
    if (research.status === "failed") return researchUnavailable(research, emptyAnalysis);
    if (research.competitors) return runFromResearch(ctx, research, research.competitors);
    return { data: emptyAnalysis("no-results", null, []), source: "deterministic", note: "research-no-competitors" };
  }

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
    const competitors = rawCompetitors(ctx, results);
    if (competitors.length === 0) {
      return {
        data: emptyAnalysis("no-results", provider, okQueries),
        source: "deterministic",
        note: "raw-search-filtered",
      };
    }
    return {
      data: {
        ...emptyAnalysis("ok", provider, okQueries),
        marketOverview: `Found ${competitors.length} real businesses related to "${input.idea}" in ${input.location} via ${provider} web search. Connect an LLM key to generate a deeper competitive analysis from these results.`,
        competitors,
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
      "You are a competitive intelligence analyst. You will be given REAL web search results. Using ONLY those results, identify actual competitor businesses. CRITICAL: do not invent any company, website, statistic, price, or fact that is not present in the results. Every competitor's website MUST be one of the provided URLs. If the results do not contain enough genuine competitors, return fewer (an empty array is acceptable).",
    user: withResearch(
      ctx,
      "competitor",
      withBrief(
        ctx,
        `Business being launched: ${input.idea}
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
      ),
    ),
    task: "research",
    temperature: 0.4,
    maxTokens: 2200,
    timeoutMs: 90_000,
    schema: competitorLlmSchema,
  });

  // Defense in depth for mocks / edge payloads that skip client-side schema.
  const parsed = competitorLlmSchema.safeParse(res.data);
  if (!res.data || !parsed.success) {
    // LLM failed — still return search rows that pass the junk/relevance gate.
    const competitors = rawCompetitors(ctx, results);
    if (competitors.length === 0) {
      return withLlmTelemetry(
        {
          data: emptyAnalysis("no-results", provider, okQueries),
          source: "deterministic",
          note: res.note ?? "llm-unparseable",
        },
        res,
      );
    }
    return withLlmTelemetry(
      {
        data: {
          ...emptyAnalysis("ok", provider, okQueries),
          marketOverview: `Retrieved ${results.length} real results for "${input.idea}" in ${input.location} via ${provider}.`,
          competitors,
          sources: results,
        },
        source: "deterministic",
        note: res.note ?? "llm-unparseable",
      },
      res,
    );
  }

  const validUrls = new Set(results.map((r) => r.url));
  const d = parsed.data;

  const offerTerms = offerTermsFromIdea(ctx.input);
  // Keep only competitors whose website is a real, retrieved URL (anti-hallucination),
  // then drop directories/maps/articles that validation rejects.
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
        strengths: sanitizeCompetitorAnnotations(ensureArray(c.strengths, []), 3),
        weaknesses: sanitizeCompetitorAnnotations(ensureArray(c.weaknesses, []), 3),
        // Every competitor must carry at least one real source URL.
        sources: srcs.length > 0 ? srcs : grounded ? [grounded] : [],
      };
    })
    .filter((c) => {
      if (!c.name || !c.website || c.sources.length === 0) return false;
      const gate = rejectSearchArtifact({
        title: c.name,
        url: c.website,
        snippet: c.description,
        offerTerms,
      });
      return gate.ok;
    });

  const finalCompetitors = competitors.length > 0 ? competitors : rawCompetitors(ctx, results);
  if (finalCompetitors.length === 0) {
    return withLlmTelemetry(
      {
        data: emptyAnalysis("no-results", provider, okQueries),
        source: "deterministic",
        note: "search-filtered",
      },
      res,
    );
  }

  return withLlmTelemetry(
    {
      data: {
        available: true,
        status: "ok",
        provider,
        queries: okQueries,
        marketOverview: sanitizeMarketSummary(
          nonEmpty(d.marketOverview, `Analysis based on ${results.length} real web results from ${provider}.`),
        ),
        competitors: finalCompetitors,
        // SWOT is forward-looking strategy for the new business — never verified competitor facts.
        swot: sanitizeSwot(d.swot ?? {}),
        differentiation: sanitizeStrategicItems(ensureArray(d.differentiation, []), 4),
        opportunityGaps: sanitizeStrategicItems(ensureArray(d.opportunityGaps, []), 3),
        sources: results,
      },
      source: "llm",
    },
    res,
  );
}

/* ------------------------- Research-grounded path ------------------------ */

/**
 * Competitors, names, websites and sources come only from validated research
 * profiles. The model may reclassify, annotate or drop a profile (by its ref)
 * but can never add one; anything it returns for an unknown ref is discarded.
 */
async function runFromResearch(
  ctx: GenerationContext,
  research: AgentResearchContext,
  intel: AgentCompetitorContext,
): Promise<AgentOutput<CompetitorAnalysis>> {
  const sourcesByRef = new Map(research.sources.map((s) => [s.ref, s]));
  const profiles = intel.profiles.filter((p): p is AgentCompetitorProfile & { website: string } => !!p.website);
  if (profiles.length === 0) {
    return intel.discovery === "failed"
      ? { data: emptyAnalysis("error", null, []), source: "deterministic", note: "research-search-failed" }
      : { data: emptyAnalysis("no-results", null, []), source: "deterministic", note: "research-no-competitors" };
  }

  const base = new Map(profiles.map((p) => [p.ref, researchCompetitor(p, sourcesByRef)]));
  const observations = intel.findings.filter((f) => f.kind === "observation");
  const found = Math.max(intel.total, intel.profiles.length);
  const deterministic: CompetitorAnalysis = {
    ...emptyAnalysis("ok", ctx.researchRun?.provider ?? null, ctx.researchRun?.queries ?? []),
    marketOverview: [
      found === profiles.length
        ? `Research identified ${found} competitor${found === 1 ? "" : "s"} from search listings.`
        : `Research identified ${found} competitors from search listings; ${profiles.length} of them are shown here.`,
      ...observations.filter((f) => f.topic === "offer" || f.topic === "location").map((f) => f.statement),
    ].join(" "),
    competitors: [...base.values()],
    opportunityGaps: observations.filter((f) => f.topic === "gap").map((f) => f.statement),
    sources: researchSources(profiles, sourcesByRef),
  };

  if (!ctx.useLlm) return { data: deterministic, source: "deterministic", note: "research" };

  const { input, industry } = ctx;
  const res = await generateJson({
    system:
      "You are a competitive intelligence analyst. You are given validated competitor evidence from research. Use ONLY the provided evidence. Never invent competitors, details, prices, statistics or URLs. Refer to competitors only by their ref (C1, C2…). Return fewer competitors when the evidence for one is insufficient, and say a detail is unknown rather than guessing.",
    user: withResearch(
      ctx,
      "competitor",
      withBrief(
        ctx,
        `Business being launched: ${input.idea}
Industry: ${industry.label}
Location: ${input.location}
Target audience: ${input.audience}

Return JSON with:
- "competitors": array of { "ref" (a competitor ref from the research below), "type" ("direct" when the listing shows it sells the same kind of offer to the same kind of customer; "indirect" when it serves the same need with a different kind of offer, business model or customer; "uncertain" when the listing does not show which), "strengths" (max ${MAX_RESEARCH_ANNOTATIONS}, only what the listing shows), "weaknesses" (max ${MAX_RESEARCH_ANNOTATIONS}, only gaps the evidence shows; empty when unknown) }
- "marketOverview": 2 sentences using ONLY the competitor evidence and comparison below
- "swot": strategic SWOT for the NEW business { "strengths"[3], "weaknesses"[3], "opportunities"[3], "threats"[3] } (forward-looking strategy, not factual claims)
- "differentiation": up to 4 ways the new business can stand out from these competitors
- "opportunityGaps": up to 3 gaps shown by the competitor comparison; empty when none are shown`,
      ),
    ),
    task: "research",
    temperature: 0.3,
    maxTokens: 1800,
    timeoutMs: 90_000,
    schema: competitorResearchLlmSchema,
  });

  // Defense in depth for mocks / edge payloads that skip client-side schema.
  const parsed = competitorResearchLlmSchema.safeParse(res.data);
  if (!res.data || !parsed.success) {
    return withLlmTelemetry({ data: deterministic, source: "deterministic", note: res.note ?? "llm-unparseable" }, res);
  }

  const d = parsed.data;
  const chosen = new Set<string>();
  const competitors: Competitor[] = [];
  for (const c of ensureArray(d.competitors, [])) {
    const known = base.get(c.ref);
    if (!known || chosen.has(c.ref)) continue;
    chosen.add(c.ref);
    competitors.push({
      ...known,
      // The model may classify what research left uncertain, but not discard a classification the evidence supports.
      type: c.type && c.type !== "uncertain" ? c.type : known.type,
      strengths: sanitizeCompetitorAnnotations(ensureArray(c.strengths, []), MAX_RESEARCH_ANNOTATIONS),
      weaknesses: sanitizeCompetitorAnnotations(ensureArray(c.weaknesses, []), MAX_RESEARCH_ANNOTATIONS),
    });
  }

  // Research gap findings are observations from evidence; still strip metric overclaims.
  const gapsFromLlm = sanitizeStrategicItems(ensureArray(d.opportunityGaps, []), 3);
  const gapsFallback = sanitizeStrategicItems(deterministic.opportunityGaps, 3);

  return withLlmTelemetry(
    {
      data: {
        ...deterministic,
        marketOverview: sanitizeMarketSummary(nonEmpty(d.marketOverview, deterministic.marketOverview)),
        competitors: competitors.length > 0 ? competitors : deterministic.competitors,
        swot: sanitizeSwot(d.swot ?? {}),
        differentiation: sanitizeStrategicItems(ensureArray(d.differentiation, []), 4),
        opportunityGaps: gapsFromLlm.length > 0 ? gapsFromLlm : gapsFallback,
      },
      source: "llm",
    },
    res,
  );
}

function researchCompetitor(
  p: AgentCompetitorProfile & { website: string },
  sourcesByRef: Map<string, AgentResearchSource>,
): Competitor {
  const urls = p.sourceRefs.flatMap((ref) => sourcesByRef.get(ref)?.url ?? []);
  return {
    name: p.name,
    type: p.type,
    // Category is not shown by the evidence, so it stays unknown.
    category: "",
    description: p.listing,
    website: p.website,
    strengths: [],
    weaknesses: [],
    sources: urls.includes(p.website) ? urls : [p.website, ...urls],
  };
}

function researchSources(
  profiles: (AgentCompetitorProfile & { website: string })[],
  sourcesByRef: Map<string, AgentResearchSource>,
): SearchResult[] {
  const out = new Map<string, SearchResult>();
  for (const p of profiles) {
    for (const ref of p.sourceRefs) {
      const s = sourcesByRef.get(ref);
      if (!s?.url || out.has(s.url)) continue;
      out.set(s.url, { title: s.title, url: s.url, snippet: s.url === p.website ? p.listing : "" });
    }
  }
  return [...out.values()];
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

/** Builds competitor records from search results (no LLM), after deterministic junk filters. */
function rawCompetitors(ctx: GenerationContext, results: SearchResult[]): Competitor[] {
  const city = ctx.input.location.split(",")[0]!.trim().toLowerCase();
  const offerTerms = offerTermsFromIdea(ctx.input);
  const seenDomains = new Set<string>();
  const out: Competitor[] = [];

  for (const r of results) {
    const domain = domainOf(r.url);
    if (seenDomains.has(domain)) continue;
    const gate = rejectSearchArtifact({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      offerTerms,
    });
    if (!gate.ok) continue;
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

function matchUrl(candidate: string, results: SearchResult[]): string {
  if (!candidate) return "";
  const dom = domainOf(candidate);
  const hit = results.find((r) => domainOf(r.url) === dom);
  return hit?.url ?? "";
}
