import type { GeneratedSectionId } from "@/lib/dependencies";
import type {
  CompetitorIntelligence,
  CompetitorPricing,
  CompetitorProfile,
  CompetitorType,
  ComparisonFinding,
  FindingTopic,
} from "@/lib/research/competitors/model";
import { AGENT_RESEARCH_LIMITS } from "@/lib/research/limits";
import { COMPETITOR_DISCOVERY_DIMENSIONS, type ConfidenceLevel, type ResearchSnapshot } from "@/lib/research/model";
import { clipText } from "@/lib/research/normalize";

/**
 * Competitor projection: the agent-specific slice of competitor intelligence.
 *
 *   profiles   — the competitor step: validated competitors plus every comparison topic
 *   comparison — other steps: comparison findings on the topics that step can use, no profiles
 *
 * The pricing step receives competitor prices as structured pricing evidence
 * instead (see AgentResearchContext.pricingEvidence).
 */
export type CompetitorView = "profiles" | "comparison";

export interface CompetitorViewSpec {
  view: CompetitorView;
  topics: readonly FindingTopic[];
}

export const AGENT_COMPETITOR_VIEW: Record<GeneratedSectionId, CompetitorViewSpec | null> = {
  brand: { view: "comparison", topics: ["promise", "gap", "offer"] },
  design: null,
  logo: null,
  persona: null,
  competitor: { view: "profiles", topics: ["offer", "location", "pricing", "gap", "promise"] },
  market: { view: "comparison", topics: ["offer", "location", "pricing", "gap"] },
  pricing: null,
  strategy: { view: "comparison", topics: ["promise", "gap", "offer", "pricing"] },
  website: { view: "comparison", topics: ["promise", "gap", "offer"] },
  seo: null,
  marketing: { view: "comparison", topics: ["promise", "gap", "location"] },
  email: null,
  whatsapp: null,
  growth: { view: "comparison", topics: ["gap", "location", "pricing"] },
  launch: { view: "comparison", topics: ["location", "gap", "offer"] },
};

export interface AgentCompetitorPricing {
  status: CompetitorPricing["status"];
  observations: { amount: string; excerpt: string; sourceRefs: string[] }[];
}

export interface AgentCompetitorProfile {
  /** Prompt-local reference, e.g. "C1". */
  ref: string;
  name: string;
  domain: string;
  /** Omitted when the URL is too long to pass to an agent. */
  website?: string;
  type: CompetitorType;
  confidence: ConfidenceLevel;
  /** The retrieved listing text. */
  listing: string;
  location?: string;
  pricing: AgentCompetitorPricing;
  sourceRefs: string[];
}

export interface AgentCompetitorFinding {
  /** Prompt-local reference, e.g. "CF1". */
  ref: string;
  kind: ComparisonFinding["kind"];
  topic: FindingTopic;
  statement: string;
  /** Observations: the sources showing it. */
  sourceRefs: string[];
  /** Inferences and recommendations: the refs of the findings they build on. */
  basedOn: string[];
}

export interface AgentCompetitorContext {
  view: CompetitorView;
  /** Outcome of the competitor discovery searches. */
  discovery: "complete" | "partial" | "failed";
  /** Validated competitors before any truncation. */
  total: number;
  profiles: AgentCompetitorProfile[];
  findings: AgentCompetitorFinding[];
  limitations: string[];
}

/** Assigns prompt-local source refs; returns undefined once the agent's source budget is spent. */
export type SourceRefAllocator = (sourceId: string) => string | undefined;

/**
 * Returns null when the step has no competitor view, or when a comparison step
 * would receive nothing useful (no findings and nothing to warn about).
 */
export function projectCompetitors(
  snapshot: ResearchSnapshot,
  intel: CompetitorIntelligence | null,
  spec: CompetitorViewSpec,
  refFor: SourceRefAllocator,
): AgentCompetitorContext | null {
  const limits = AGENT_RESEARCH_LIMITS;
  const competitors = intel?.competitors ?? [];

  const profiles: AgentCompetitorProfile[] = [];
  if (spec.view === "profiles") {
    for (const c of competitors) {
      if (profiles.length >= limits.maxCompetitors) break;
      const profile = toProfile(c, `C${profiles.length + 1}`, refFor);
      if (profile) profiles.push(profile);
    }
  }

  const findings = projectFindings(intel?.findings ?? [], spec.topics, refFor);
  const discovery = discoveryStatus(snapshot);
  const limitations = competitorLimitations(discovery, intel, spec.view, profiles.length, competitors.length);

  if (spec.view === "comparison" && findings.length === 0) return null;
  return { view: spec.view, discovery, total: competitors.length, profiles, findings, limitations };
}

function discoveryStatus(snapshot: ResearchSnapshot): AgentCompetitorContext["discovery"] {
  const runs = snapshot.queries.filter((q) => (COMPETITOR_DISCOVERY_DIMENSIONS as readonly string[]).includes(q.id));
  const failed = runs.filter((q) => q.status === "failed").length;
  if (runs.length > 0 && failed === runs.length) return "failed";
  return failed > 0 ? "partial" : "complete";
}

function toProfile(c: CompetitorProfile, ref: string, refFor: SourceRefAllocator): AgentCompetitorProfile | null {
  const limits = AGENT_RESEARCH_LIMITS;
  const sourceRefs = refsFor(c.sourceIds, refFor);
  // A competitor the agent cannot cite is not shown at all.
  if (sourceRefs.length === 0) return null;

  const out: AgentCompetitorProfile = {
    ref,
    name: c.name.value,
    domain: c.domain,
    type: c.classification.type,
    confidence: c.confidence,
    listing: clipText(c.listing.value, limits.maxStatementChars),
    pricing: {
      status: c.pricing.status,
      observations:
        c.pricing.status === "observed"
          ? c.pricing.observations.map((o) => ({ amount: o.amount, excerpt: o.excerpt, sourceRefs: refsFor(o.sourceIds, refFor) }))
          : [],
    },
    sourceRefs,
  };
  if (c.website.length <= limits.maxUrlChars) out.website = c.website;
  if (c.location) out.location = c.location.value;
  return out;
}

/** Keeps intelligence order (bases precede derived findings); a derived finding survives only if all its bases do. */
function projectFindings(
  findings: ComparisonFinding[],
  topics: readonly FindingTopic[],
  refFor: SourceRefAllocator,
): AgentCompetitorFinding[] {
  const out: AgentCompetitorFinding[] = [];
  const refs = new Map<string, string>();
  for (const f of findings) {
    if (out.length >= AGENT_RESEARCH_LIMITS.maxCompetitorFindings) break;
    if (!topics.includes(f.topic)) continue;
    const ref = `CF${out.length + 1}`;
    if (f.kind === "observation") {
      const sourceRefs = refsFor(f.sourceIds, refFor);
      if (sourceRefs.length === 0) continue;
      out.push({ ref, kind: f.kind, topic: f.topic, statement: f.statement, sourceRefs, basedOn: [] });
    } else {
      const basedOn = f.basedOn.flatMap((id) => refs.get(id) ?? []);
      if (basedOn.length !== f.basedOn.length) continue;
      out.push({ ref, kind: f.kind, topic: f.topic, statement: f.statement, sourceRefs: [], basedOn });
    }
    refs.set(f.id, ref);
  }
  return out;
}

function competitorLimitations(
  discovery: AgentCompetitorContext["discovery"],
  intel: CompetitorIntelligence | null,
  view: CompetitorView,
  shown: number,
  total: number,
): string[] {
  const out: string[] = [];
  if (discovery === "failed") out.push("Competitor discovery searches failed, so no competitors are known.");
  else if (discovery === "partial") out.push("Some competitor discovery searches failed, so competitors may be missing.");

  if (!intel) out.push("Competitor evidence could not be validated, so no competitors are known.");
  else if (intel.competitors.length === 0 && discovery !== "failed") out.push("No competitors could be validated from the retrieved evidence.");

  if (view === "comparison") return out;
  if (shown < total) out.push(`Only the ${shown} strongest of ${total} validated competitors are included.`);
  if (shown > 0) out.push("Competitor details come only from search listings; anything not shown is unknown.");
  return out;
}

function refsFor(sourceIds: string[], refFor: SourceRefAllocator): string[] {
  const out: string[] = [];
  for (const id of sourceIds) {
    if (out.length >= AGENT_RESEARCH_LIMITS.maxSourceRefsPerClaim) break;
    const ref = refFor(id);
    if (ref && !out.includes(ref)) out.push(ref);
  }
  return out;
}
