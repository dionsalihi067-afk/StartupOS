import type { BusinessInput } from "@/lib/types";
import { RESEARCH_LIMITS, type ResearchLimits } from "@/lib/research/limits";
import type { ResearchContext, ResearchDimension, ResearchQuery } from "@/lib/research/model";

/**
 * Deterministic research query planner: the same business input always yields
 * the same queries. Only public business context is used (idea, customer,
 * market, offer, revenue model) — never names, budgets, notes or ids.
 */

const EDGE_PUNCTUATION = /^[\s.,/&+'-]+|[\s.,/&+'-]+$/g;

/** Cleans one free-text answer for use in a public search query. */
export function sanitizeTerm(value: string | undefined, maxChars: number = RESEARCH_LIMITS.maxTermChars): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .normalize("NFKC")
    .replace(/https?:\/\/\S+|www\.\S+/gi, " ")
    .replace(/\S+@\S+\.\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s'&+\-.,/]/gu, " ")
    .replace(/([.,/&+'-])\1+/g, "$1")
    .replace(/\s+/g, " ")
    .replace(EDGE_PUNCTUATION, "");
  const truncated = truncateWords(cleaned, maxChars).replace(EDGE_PUNCTUATION, "");
  return truncated || undefined;
}

function truncateWords(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : text.slice(0, maxChars)).trim();
}

/** Joins query parts and drops words already used earlier in the query (case-insensitive). */
export function composeQuery(parts: readonly (string | undefined)[], maxChars: number = RESEARCH_LIMITS.maxQueryChars): string {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    for (const word of part.split(" ")) {
      const key = word.toLowerCase().replace(/[.,/&+'-]+$/g, "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      words.push(word);
    }
  }
  return truncateWords(words.join(" "), maxChars).replace(EDGE_PUNCTUATION, "");
}

/** Extracts the public research context from a business input. */
export function researchContextFrom(input: BusinessInput): ResearchContext {
  const d = input.discovery;
  const idea = sanitizeTerm(input.idea) ?? sanitizeTerm(d?.business.idea) ?? "business";
  const context: ResearchContext = { idea, revenueModels: d ? [...d.model.revenue] : [] };
  const customer = sanitizeTerm(d?.customer.ideal || input.audience);
  const location = sanitizeTerm(d?.customer.geography || input.location);
  const offer = sanitizeTerm(d?.offer.main);
  if (customer) context.customer = customer;
  if (location) context.location = location;
  if (offer) context.offer = offer;
  return context;
}

function queryParts(dimension: ResearchDimension, c: ResearchContext): (string | undefined)[] {
  const subject = c.offer ?? c.idea;
  const recurring = c.revenueModels.some((m) => m === "subscription" || m === "recurring");
  switch (dimension) {
    case "demand":
      return [c.idea, "demand", c.location];
    case "customerNeeds":
      return c.customer ? [c.customer, "problems and needs", subject] : [subject, "customer problems"];
    case "trends":
      return [c.idea, "market trends"];
    case "competitors":
      return [subject, "competitors alternatives", c.location];
    case "pricing":
      return [subject, recurring ? "subscription prices" : "prices", c.location];
    case "positioning":
      return c.customer ? [subject, "for", c.customer, "value proposition"] : [subject, "brand positioning"];
    // Competitor discovery: phrased to surface businesses rather than articles. Skipped when the context they need is missing.
    case "localCompetitors":
      return c.location ? [subject, "in", c.location] : [];
    case "directCompetitors":
      return [subject, "companies", c.location];
    case "nicheCompetitors":
      return c.customer ? [subject, "for", c.customer, c.location] : [];
  }
}

const PLAN_ORDER: readonly ResearchDimension[] = [
  "demand",
  "customerNeeds",
  "trends",
  "competitors",
  "pricing",
  "positioning",
  "localCompetitors",
  "directCompetitors",
  "nicheCompetitors",
];

export interface ResearchPlan {
  context: ResearchContext;
  queries: ResearchQuery[];
}

export function planResearch(input: BusinessInput, limits: Pick<ResearchLimits, "maxQueries" | "maxQueryChars"> = RESEARCH_LIMITS): ResearchPlan {
  const context = researchContextFrom(input);
  const seen = new Set<string>();
  const queries: ResearchQuery[] = [];
  for (const id of PLAN_ORDER) {
    if (queries.length >= limits.maxQueries) break;
    const text = composeQuery(queryParts(id, context), limits.maxQueryChars);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    queries.push({ id, text });
  }
  return { context, queries };
}
