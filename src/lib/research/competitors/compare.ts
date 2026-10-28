import { COMPETITOR_LIMITS } from "@/lib/research/limits";
import { shortHash } from "@/lib/research/normalize";
import type { ResearchContext } from "@/lib/research/model";
import type { ComparisonFinding, CompetitorProfile, FindingTopic, ObservationFinding } from "@/lib/research/competitors/model";
import { foldText, matchTerms, offerTerms } from "@/lib/research/competitors/signals";

/**
 * Deterministic comparison across validated competitors.
 *
 *   observation    — counted directly from competitor evidence (including
 *                    absences, always scoped to "the retrieved listings")
 *   inference      — reasoned from observations, never stated as fact
 *   recommendation — a strategic suggestion derived from an inference
 *
 * Pricing is only ever counted: no averages, ranges or estimates, and no
 * market-wide pattern from fewer than two competitors.
 */

/** Customer-facing promises worth counting across listings. */
const PROMISE_TERMS = [
  "free delivery", "same-day", "24/7", "organic", "handmade", "premium", "affordable", "family-owned",
  "locally sourced", "sustainable", "eco-friendly", "certified", "award-winning", "free trial", "online booking", "fresh",
];

export interface EvidenceText {
  evidenceId: string;
  sourceId: string;
  text: string;
}

/** Evidence texts per competitor id. */
export type CompetitorTexts = ReadonlyMap<string, readonly EvidenceText[]>;

interface Hit {
  profile: CompetitorProfile;
  evidenceIds: string[];
  sourceIds: string[];
}

function findingId(kind: ComparisonFinding["kind"], topic: FindingTopic, key: string): string {
  return `cf_${shortHash(`${kind}|${topic}|${key}`)}`;
}

export function compareCompetitors(
  profiles: readonly CompetitorProfile[],
  texts: CompetitorTexts,
  context: ResearchContext,
): ComparisonFinding[] {
  const n = profiles.length;
  if (n === 0) return [];
  const findings: ComparisonFinding[] = [];
  const terms = offerTerms(context);

  /** Profiles whose evidence satisfies `test`, with the matching evidence. */
  const matching = (test: (text: string) => boolean): Hit[] =>
    profiles.flatMap((profile) => {
      const matched = (texts.get(profile.id) ?? []).filter((t) => test(t.text));
      return matched.length > 0 ? [{ profile, evidenceIds: matched.map((t) => t.evidenceId), sourceIds: matched.map((t) => t.sourceId) }] : [];
    });

  /** Profiles carrying a signal, with that signal's provenance. */
  const withSignal = (pick: (p: CompetitorProfile) => readonly { evidenceIds: string[]; sourceIds: string[] }[]): Hit[] =>
    profiles.flatMap((profile) => {
      const signals = pick(profile);
      return signals.length > 0
        ? [{ profile, evidenceIds: signals.flatMap((s) => s.evidenceIds), sourceIds: signals.flatMap((s) => s.sourceIds) }]
        : [];
    });

  const observe = (topic: FindingTopic, key: string, statement: string, hits: Hit[]): ObservationFinding => {
    const finding: ObservationFinding = {
      id: findingId("observation", topic, key),
      kind: "observation",
      topic,
      statement,
      competitorIds: hits.map((h) => h.profile.id),
      evidenceIds: [...new Set(hits.flatMap((h) => h.evidenceIds))],
      sourceIds: [...new Set(hits.flatMap((h) => h.sourceIds))],
    };
    findings.push(finding);
    return finding;
  };

  const derive = (kind: "inference" | "recommendation", topic: FindingTopic, key: string, statement: string, basedOn: string): string => {
    const id = findingId(kind, topic, key);
    findings.push({ id, kind, topic, statement, basedOn: [basedOn] });
    return id;
  };

  /** Absences are observed over every competitor's evidence. */
  const absence = (topic: FindingTopic, key: string, statement: string) => observe(topic, key, statement, matching(() => true));

  // Offer terms shared by several competitors.
  for (const term of terms) {
    const hits = matching((text) => matchTerms([term], text).length > 0);
    if (hits.length >= 2) observe("offer", term, `"${term}" appears in the retrieved listings of ${hits.length} of ${n} competitors.`, hits);
  }

  // Location coverage.
  const located = withSignal((p) => (p.location ? [p.location] : []));
  if (context.location && located.length > 0) {
    observe("location", context.location, `${located.length} of ${n} competitors' retrieved listings mention ${context.location}.`, located);
  }

  // Pricing: counted only.
  const priced = withSignal((p) => (p.pricing.status === "observed" ? p.pricing.observations : []));
  const pricing =
    priced.length > 0
      ? observe("pricing", "published", `Explicit prices appear in the retrieved listings of ${priced.length} of ${n} competitors.`, priced)
      : absence("pricing", "none", `None of the ${n} competitors' retrieved listings show explicit prices.`);
  if (priced.length <= 1 && n >= 3) {
    derive("inference", "pricing", "uncommon", "Public pricing appears uncommon among the competitors found, so no market-wide price pattern can be established.", pricing.id);
  }

  // Gaps: offer terms no competitor listing mentions.
  if (n >= 2) {
    for (const term of terms) {
      if (profiles.some((p) => p.classification.matchedTerms.includes(term))) continue;
      const gap = absence("gap", term, `None of the ${n} competitors' retrieved listings mention "${term}".`);
      const inference = derive("inference", "gap", term, `"${term}" may be under-served among the competitors found.`, gap.id);
      derive("recommendation", "gap", term, `Consider testing "${term}" as a differentiator, and validate demand before relying on it.`, inference);
    }
  }

  // Recurring customer promises (offer terms are excluded: they describe the category, not a promise).
  for (const promise of PROMISE_TERMS) {
    if (matchTerms(terms, promise).length > 0) continue;
    const hits = matching((text) => foldText(text).includes(promise));
    if (hits.length < 2) continue;
    const observation = observe("promise", promise, `"${promise}" appears in the retrieved listings of ${hits.length} of ${n} competitors.`, hits);
    if (n >= 3 && hits.length * 2 >= n) {
      const inference = derive("inference", "promise", promise, `"${promise}" appears to be a common promise among the competitors found.`, observation.id);
      derive("recommendation", "promise", promise, `Treat "${promise}" as a baseline expectation rather than a differentiator.`, inference);
    }
  }

  return truncate(findings, COMPETITOR_LIMITS.maxFindings);
}

/** Keeps a prefix, then drops derived findings whose basis did not survive. */
function truncate(findings: ComparisonFinding[], max: number): ComparisonFinding[] {
  const ids = new Set<string>();
  return findings.slice(0, max).filter((f) => {
    if (f.kind !== "observation" && !f.basedOn.every((id) => ids.has(id))) return false;
    ids.add(f.id);
    return true;
  });
}
