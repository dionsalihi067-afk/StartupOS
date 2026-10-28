import { GENERATED_SECTIONS, type GeneratedSectionId } from "@/lib/dependencies";
import { buildCompetitorIntelligence } from "@/lib/research/competitors/assemble";
import type { CompetitorIntelligence } from "@/lib/research/competitors/model";
import {
  AGENT_COMPETITOR_VIEW,
  projectCompetitors,
  type AgentCompetitorContext,
  type SourceRefAllocator,
} from "@/lib/research/competitors/project";
import { buildPricingEvidence } from "@/lib/pricing/evidence";
import type { PricingEvidence } from "@/lib/pricing/model";
import { AGENT_RESEARCH_LIMITS } from "@/lib/research/limits";
import {
  DIMENSION_CATEGORY,
  type ConfidenceLevel,
  type FactClaim,
  type ResearchCategory,
  type ResearchClaim,
  type ResearchFailureCode,
  type ResearchRunResult,
  type ResearchRunStatus,
  type ResearchSnapshot,
  type ResearchSource,
} from "@/lib/research/model";
import { clipText } from "@/lib/research/normalize";

/**
 * Research projection: turns one research run into the small, agent-specific
 * slice of evidence a generation step is allowed to see. Pure and
 * deterministic — the same run, agent and clock always yield the same context.
 * Provider metadata and query text never leave this module, and prompts only
 * ever see prompt-local refs (structured pricing evidence keeps snapshot ids
 * for provenance but is not rendered verbatim).
 */

/**
 * Which research facts inform each generation step. Competitor evidence reaches
 * steps only as validated competitor intelligence (see AGENT_COMPETITOR_VIEW),
 * never as raw competitor-search snippets.
 */
export const AGENT_RESEARCH_RELEVANCE: Record<GeneratedSectionId, readonly ResearchCategory[]> = {
  brand: ["positioning", "customer", "market"],
  design: [],
  logo: [],
  persona: ["customer"],
  competitor: ["positioning", "market"],
  market: ["market"],
  pricing: ["pricing"],
  strategy: ["market", "customer", "positioning", "pricing"],
  website: ["customer", "positioning", "market"],
  seo: ["customer", "market"],
  marketing: ["customer", "positioning", "market"],
  email: ["customer", "positioning"],
  whatsapp: ["customer"],
  growth: ["market", "customer", "pricing"],
  launch: ["market", "customer"],
};

export type ResearchFreshness = "current" | "stale";

export interface AgentResearchSource {
  /** Prompt-local reference, e.g. "S1". */
  ref: string;
  domain: string;
  title: string;
  url?: string;
  publishedAt?: string;
}

export interface AgentResearchFact {
  ref: string;
  category: ResearchCategory;
  statement: string;
  confidence: ConfidenceLevel;
  sourceRefs: string[];
}

/** An inference or recommendation; `basedOn` lists the refs of the claims it builds on. */
export interface AgentResearchDerivedClaim {
  ref: string;
  category: ResearchCategory;
  statement: string;
  confidence: ConfidenceLevel;
  basedOn: string[];
}

export interface AgentResearchContext {
  status: ResearchRunStatus;
  researchedAt: string;
  freshness: ResearchFreshness;
  categories: readonly ResearchCategory[];
  facts: AgentResearchFact[];
  inferences: AgentResearchDerivedClaim[];
  recommendations: AgentResearchDerivedClaim[];
  sources: AgentResearchSource[];
  limitations: string[];
  /** Why research failed; set only when `status` is "failed". */
  failure?: ResearchFailureCode;
  /** Validated competitor intelligence for steps with a competitor view; sources are shared with `sources`. */
  competitors?: AgentCompetitorContext;
  /** Structured competitor pricing evidence for the pricing engine (pricing step only); never rendered verbatim. */
  pricingEvidence?: PricingEvidence;
}

/** Steps whose engine consumes structured pricing evidence. */
const PRICING_EVIDENCE_STEPS: ReadonlySet<GeneratedSectionId> = new Set(["pricing"]);

/** Per-step projections carried by the generation context. */
export type GenerationResearch = Partial<Record<GeneratedSectionId, AgentResearchContext>>;

const DAY_MS = 86_400_000;
const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { high: 0, medium: 1, low: 2 };

export function researchFreshness(researchedAt: string, now: Date): ResearchFreshness {
  const age = now.getTime() - Date.parse(researchedAt);
  return age > AGENT_RESEARCH_LIMITS.staleAfterDays * DAY_MS ? "stale" : "current";
}

/** Whether a generation step receives a research projection at all. */
export function consumesResearch(agent: GeneratedSectionId): boolean {
  return AGENT_RESEARCH_RELEVANCE[agent].length > 0 || AGENT_COMPETITOR_VIEW[agent] !== null;
}

/**
 * Returns null for steps that never consume research. `intel` lets callers
 * projecting many steps build competitor intelligence once per run.
 */
export function getResearchContextForAgent(
  research: ResearchRunResult,
  agent: GeneratedSectionId,
  now: Date,
  intel?: CompetitorIntelligence | null,
): AgentResearchContext | null {
  if (!consumesResearch(agent)) return null;
  const categories = AGENT_RESEARCH_RELEVANCE[agent];
  const competitorView = AGENT_COMPETITOR_VIEW[agent];

  const pricing = PRICING_EVIDENCE_STEPS.has(agent);
  if (research.status === "failed") {
    return {
      status: "failed",
      researchedAt: research.completedAt,
      freshness: researchFreshness(research.completedAt, now),
      categories,
      facts: [],
      inferences: [],
      recommendations: [],
      sources: [],
      limitations: ["Research could not be completed, so no research evidence is available."],
      failure: research.error,
      ...(pricing ? { pricingEvidence: buildPricingEvidence(research) } : {}),
    };
  }

  const snapshot = research.snapshot;
  const intelligence = competitorView || pricing ? (intel === undefined ? buildCompetitorIntelligence(snapshot) : intel) : null;
  const sources: AgentResearchSource[] = [];
  const refFor = sourceAllocator(snapshot, sources);
  // Competitor sources are allocated first: for steps with a competitor view they are the most specific evidence.
  const competitors = competitorView ? projectCompetitors(snapshot, intelligence, competitorView, refFor) : null;
  const context = projectSnapshot(snapshot, categories, now, sources, refFor);
  return {
    ...context,
    ...(competitors ? { competitors } : {}),
    ...(pricing ? { pricingEvidence: buildPricingEvidence(research, intelligence) } : {}),
  };
}

export function projectResearchForAgents(research: ResearchRunResult, now: Date): GenerationResearch {
  const intel = research.status === "failed" ? null : buildCompetitorIntelligence(research.snapshot);
  const out: GenerationResearch = {};
  for (const agent of GENERATED_SECTIONS) {
    const context = getResearchContextForAgent(research, agent, now, intel);
    if (context) out[agent] = context;
  }
  return out;
}

/** Hands out S1, S2… per source id until the agent's source budget is spent; `sources` collects the refs handed out. */
function sourceAllocator(snapshot: ResearchSnapshot, sources: AgentResearchSource[]): SourceRefAllocator {
  const byId = new Map(snapshot.sources.map((s) => [s.id, s]));
  const refs = new Map<string, string>();
  return (id) => {
    const existing = refs.get(id);
    if (existing) return existing;
    const source = byId.get(id);
    if (!source || sources.length >= AGENT_RESEARCH_LIMITS.maxSources) return undefined;
    const ref = `S${sources.length + 1}`;
    refs.set(id, ref);
    sources.push(toSourceRef(source, ref));
    return ref;
  };
}

function projectSnapshot(
  snapshot: ResearchSnapshot,
  categories: readonly ResearchCategory[],
  now: Date,
  sources: AgentResearchSource[],
  refFor: SourceRefAllocator,
): AgentResearchContext {
  const limits = AGENT_RESEARCH_LIMITS;
  const sourcesById = new Map(snapshot.sources.map((s) => [s.id, s]));
  const relevant = (c: ResearchClaim) => categories.includes(c.category);

  const rankedFacts = snapshot.claims
    .map((claim, index) => ({ claim, index }))
    .filter((x): x is { claim: FactClaim; index: number } => x.claim.kind === "fact" && relevant(x.claim))
    .sort((a, b) => compareFacts(a.claim, a.index, b.claim, b.index, categories, sourcesById));

  const claimRefs = new Map<string, string>();
  const facts: AgentResearchFact[] = [];

  for (const { claim } of rankedFacts) {
    if (facts.length >= limits.maxClaims) break;
    const refs: string[] = [];
    for (const id of claim.sourceIds) {
      if (refs.length >= limits.maxSourceRefsPerClaim) break;
      const ref = refFor(id);
      if (ref) refs.push(ref);
    }
    if (refs.length === 0) continue;
    const ref = `F${facts.length + 1}`;
    claimRefs.set(claim.id, ref);
    facts.push({ ref, category: claim.category, statement: clipText(claim.statement, limits.maxStatementChars), confidence: claim.confidence, sourceRefs: refs });
  }

  // Derived claims stay in snapshot order (their bases always precede them) and survive only if grounded in included claims.
  const inferences: AgentResearchDerivedClaim[] = [];
  const recommendations: AgentResearchDerivedClaim[] = [];
  for (const claim of snapshot.claims) {
    if (claim.kind === "fact" || !relevant(claim)) continue;
    if (facts.length + inferences.length + recommendations.length >= limits.maxClaims) break;
    const basedOn = claim.basedOnClaimIds.flatMap((id) => claimRefs.get(id) ?? []);
    if (basedOn.length === 0) continue;
    const list = claim.kind === "inference" ? inferences : recommendations;
    const ref = `${claim.kind === "inference" ? "I" : "R"}${list.length + 1}`;
    claimRefs.set(claim.id, ref);
    list.push({ ref, category: claim.category, statement: clipText(claim.statement, limits.maxStatementChars), confidence: claim.confidence, basedOn });
  }

  const freshness = researchFreshness(snapshot.completedAt, now);
  const relevantTotal = snapshot.claims.filter(relevant).length;
  const included = facts.length + inferences.length + recommendations.length;

  const limitations: string[] = [];
  if (snapshot.status === "partial") limitations.push("Research is partial: some searches failed, so these findings are incomplete.");
  if (freshness === "stale") limitations.push(`Research is older than ${limits.staleAfterDays} days and may be outdated.`);
  for (const category of categories) {
    const runs = snapshot.queries.filter((q) => DIMENSION_CATEGORY[q.id] === category);
    if (runs.length > 0 && runs.every((q) => q.status === "failed")) {
      limitations.push(`No ${category} research is available because the search failed.`);
    } else if (!facts.some((f) => f.category === category)) {
      limitations.push(`No ${category} findings were retrieved.`);
    }
  }
  if (included < relevantTotal) limitations.push(`Only the ${included} most relevant of ${relevantTotal} findings are included.`);

  return {
    status: snapshot.status,
    researchedAt: snapshot.completedAt,
    freshness,
    categories,
    facts,
    inferences,
    recommendations,
    sources,
    limitations,
  };
}

/** Relevance first, then confidence, corroboration, recency, and finally snapshot order. */
function compareFacts(
  a: FactClaim,
  ai: number,
  b: FactClaim,
  bi: number,
  categories: readonly ResearchCategory[],
  sources: Map<string, ResearchSource>,
): number {
  return (
    categories.indexOf(a.category) - categories.indexOf(b.category) ||
    CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] ||
    b.sourceIds.length - a.sourceIds.length ||
    latestPublished(b, sources) - latestPublished(a, sources) ||
    ai - bi
  );
}

/** Undated sources rank after dated ones. */
function latestPublished(claim: FactClaim, sources: Map<string, ResearchSource>): number {
  let latest = 0;
  for (const id of claim.sourceIds) {
    const published = sources.get(id)?.publishedAt;
    if (published) latest = Math.max(latest, Date.parse(published));
  }
  return latest;
}

function toSourceRef(source: ResearchSource, ref: string): AgentResearchSource {
  const out: AgentResearchSource = {
    ref,
    domain: source.domain,
    title: clipText(source.title, AGENT_RESEARCH_LIMITS.maxSourceTitleChars),
  };
  if (source.url.length <= AGENT_RESEARCH_LIMITS.maxUrlChars) out.url = source.url;
  if (source.publishedAt) out.publishedAt = source.publishedAt;
  return out;
}