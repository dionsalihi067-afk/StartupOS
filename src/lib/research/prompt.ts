import type { AgentResearchContext, AgentResearchDerivedClaim } from "@/lib/research/agent-context";
import type { AgentCompetitorContext, AgentCompetitorPricing } from "@/lib/research/competitors/project";
import { sanitizeUntrustedResearchText, UNTRUSTED_DATA_RULES, wrapUntrustedResearchBlock } from "@/lib/research/untrusted";

/** The single research contract every research-aware agent prompt carries. */
export const RESEARCH_GUIDANCE = [
  "Treat research as evidence, not absolute truth.",
  "Do not state facts that neither the research nor the business context supports.",
  "Do not turn low-confidence evidence into certainty.",
  "If research is partial or outdated, acknowledge the limitation where it matters.",
  "Use research to improve your reasoning; do not copy it verbatim.",
  "Only cite a source for a claim that source actually supports.",
  "Never invent competitors, prices, statistics, market sizes or customer behavior.",
  ...UNTRUSTED_DATA_RULES,
] as const;

/** Added whenever an agent receives competitor intelligence. */
export const COMPETITOR_GUIDANCE = [
  "Only refer to competitors present in this research; never add, rename or merge competitors.",
  "Never invent competitor details, prices, statistics or URLs; anything not shown is unknown, so say so.",
  "Keep a competitor's source references whenever you rely on it.",
  "Return fewer competitors when the evidence for one is insufficient.",
  "One competitor's price is not a market pattern; never estimate prices that are not listed.",
] as const;

/** Compact, provenance-preserving prompt block for one agent's research slice. */
export function renderResearchContext(research: AgentResearchContext): string {
  if (research.status === "failed") {
    return [
      "RESEARCH CONTEXT",
      "Status: failed. No research evidence is available. Rely only on the business context and do not mention or imply research findings.",
    ].join("\n");
  }

  const header = [
    "RESEARCH CONTEXT",
    `Status: ${research.status} · researched ${research.researchedAt.slice(0, 10)} · ${research.freshness}`,
  ];

  const bodyLines: string[] = [];
  const competitors = research.competitors;
  const hasCompetitorContent = !!competitors && (competitors.profiles.length > 0 || competitors.findings.length > 0);
  if (research.facts.length === 0 && !hasCompetitorContent) {
    bodyLines.push("No research findings relevant to this task were retrieved.");
  }
  if (research.sources.length > 0) {
    bodyLines.push("Sources:");
    for (const s of research.sources) {
      const published = s.publishedAt ? ` (published ${s.publishedAt.slice(0, 10)})` : "";
      const title = sanitizeUntrustedResearchText(s.title, 200);
      bodyLines.push(`[${s.ref}] ${s.domain} — "${title}"${published}${s.url ? ` ${s.url}` : ""}`);
    }
  }
  if (competitors) renderCompetitors(bodyLines, competitors);
  if (research.facts.length > 0) {
    bodyLines.push("Evidence-backed facts (source-reported, not independently verified):");
    for (const f of research.facts) {
      bodyLines.push(
        `- [${f.ref}] ${f.category} · ${f.confidence} confidence · ${refs(f.sourceRefs)}: ${sanitizeUntrustedResearchText(f.statement)}`,
      );
    }
    derived(bodyLines, "Inferences (conclusions drawn from the facts, not facts themselves):", research.inferences);
    derived(bodyLines, "Recommendations (suggestions, not facts):", research.recommendations);
  }

  const limitations = [...research.limitations, ...(competitors?.limitations ?? [])];
  if (limitations.length > 0) {
    bodyLines.push("Limitations:", ...limitations.map((l) => `- ${sanitizeUntrustedResearchText(l, 400)}`));
  }

  const rules = ["Research rules:", ...RESEARCH_GUIDANCE.map((rule, i) => `${i + 1}. ${rule}`)];
  if (competitors) rules.push("Competitor rules:", ...COMPETITOR_GUIDANCE.map((rule, i) => `${i + 1}. ${rule}`));

  // Untrusted retrieved text is delimited; trusted rules stay outside the wrapper.
  return [...header, wrapUntrustedResearchBlock(bodyLines.join("\n")), ...rules].join("\n");
}

function renderCompetitors(lines: string[], competitors: AgentCompetitorContext): void {
  if (competitors.profiles.length > 0) {
    lines.push("Validated competitors (identified from search listings; type and confidence are assigned deterministically):");
    for (const c of competitors.profiles) {
      const parts = [`- [${c.ref}] ${sanitizeUntrustedResearchText(c.name, 120)} · ${c.domain} · ${c.type} · ${c.confidence} confidence · ${refs(c.sourceRefs)}`];
      if (c.website) parts.push(`  Website: ${c.website}`);
      parts.push(`  Listing: ${sanitizeUntrustedResearchText(c.listing)}`);
      if (c.location) parts.push(`  Location mentioned: ${sanitizeUntrustedResearchText(c.location, 120)}`);
      parts.push(`  Pricing: ${pricingLine(c.pricing)}`);
      lines.push(...parts);
    }
  }
  if (competitors.findings.length > 0) {
    lines.push("Competitor comparison (observations are evidence; inferences and recommendations are not facts):");
    for (const f of competitors.findings) {
      const basis = f.kind === "observation" ? refs(f.sourceRefs) : `based on ${f.basedOn.join(", ")}`;
      lines.push(`- [${f.ref}] ${f.kind} · ${f.topic} · ${basis}: ${sanitizeUntrustedResearchText(f.statement)}`);
    }
  }
}

function pricingLine(pricing: AgentCompetitorPricing): string {
  if (pricing.status === "unavailable") return "unknown (no prices listed)";
  if (pricing.status === "ambiguous") return "unclear (numbers listed may not be prices)";
  return pricing.observations
    .map((o) => `${o.amount} ("${sanitizeUntrustedResearchText(o.excerpt, 160)}") ${refs(o.sourceRefs)}`)
    .join("; ");
}

function refs(sourceRefs: string[]): string {
  return sourceRefs.map((r) => `[${r}]`).join("");
}

function derived(lines: string[], heading: string, claims: AgentResearchDerivedClaim[]): void {
  if (claims.length === 0) return;
  lines.push(heading);
  for (const c of claims) {
    lines.push(
      `- [${c.ref}] ${c.category} · ${c.confidence} confidence · based on ${c.basedOn.join(", ")}: ${sanitizeUntrustedResearchText(c.statement)}`,
    );
  }
}
