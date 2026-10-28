import { DISCOVERY_SECTIONS, type Discovery, type DiscoverySectionKey } from "@/lib/discovery";
import type { AgentKey, BusinessInput } from "@/lib/types";

/**
 * Dependency / section-ownership architecture.
 *
 * Describes which generated generation steps (AgentKey) may be affected when a
 * source business-context domain changes. Pure metadata + resolution only —
 * nothing here regenerates, calls an LLM, or mutates a package.
 */

/** Source domains mirror Discovery sections — one canonical vocabulary. */
export type DependencyDomain = DiscoverySectionKey;

export const DEPENDENCY_DOMAINS = DISCOVERY_SECTIONS;

/**
 * Generation steps that produce package content, in pipeline order.
 * `publisher` is omitted: it only assembles results and has no source domains.
 */
export const GENERATED_SECTIONS = [
  "brand",
  "design",
  "logo",
  "persona",
  "competitor",
  "market",
  "pricing",
  "strategy",
  "website",
  "seo",
  "marketing",
  "email",
  "whatsapp",
  "growth",
  "launch",
] as const satisfies readonly AgentKey[];

export type GeneratedSectionId = (typeof GENERATED_SECTIONS)[number];

/**
 * Semantic ownership: which source domains each generation step depends on.
 *
 * Mapped from what each agent actually consumes today (core BusinessInput
 * fields + discovery brief / section purpose). Not a deep call-graph of every
 * prompt string — ownership for future scoped regeneration.
 */
export const SECTION_DEPENDENCIES = {
  brand: ["business", "customer", "brand"],
  design: ["brand"],
  logo: ["business", "customer", "brand"],
  persona: ["business", "customer", "brand"],
  competitor: ["business", "customer", "market"],
  market: ["business", "customer", "market"],
  // `market`: pricing positioning is read from the owner's desired positioning (market.positioning).
  pricing: ["business", "customer", "offer", "model", "market"],
  // Executive strategy, financial model and roadmap read every domain except visual brand preferences.
  strategy: ["business", "customer", "offer", "model", "market", "goals"],
  website: ["business", "customer", "offer", "brand"],
  seo: ["business", "customer", "brand"],
  marketing: ["business", "customer", "offer", "brand"],
  email: ["business", "customer", "brand"],
  whatsapp: ["business", "customer", "offer"],
  growth: ["business", "customer", "model", "goals"],
  launch: ["business", "customer", "model", "goals"],
} as const satisfies Record<GeneratedSectionId, readonly DependencyDomain[]>;

export type SectionDependencies = typeof SECTION_DEPENDENCIES;

/** Canonical pipeline order for stable resolver output. */
const SECTION_ORDER: ReadonlyMap<GeneratedSectionId, number> = new Map(
  GENERATED_SECTIONS.map((id, index) => [id, index]),
);

/**
 * Given changed source domains, returns the generated sections that may be
 * affected — deduplicated, in pipeline order. Pure and deterministic.
 */
export function getAffectedSections(changedDomains: readonly DependencyDomain[]): GeneratedSectionId[] {
  if (changedDomains.length === 0) return [];

  const changed = new Set<DependencyDomain>(changedDomains);
  const affected: GeneratedSectionId[] = [];

  for (const section of GENERATED_SECTIONS) {
    const deps = SECTION_DEPENDENCIES[section];
    if (deps.some((d) => changed.has(d))) affected.push(section);
  }

  return affected;
}

/**
 * Which source domains differ between two BusinessInput snapshots.
 * Compares discovery sections when present; otherwise maps core engine fields
 * onto the same domain vocabulary. Pure and deterministic.
 */
export function getChangedDependencyDomains(before: BusinessInput, after: BusinessInput): DependencyDomain[] {
  const changed = new Set<DependencyDomain>();

  const beforeDiscovery = before.discovery;
  const afterDiscovery = after.discovery;

  if (beforeDiscovery && afterDiscovery) {
    for (const domain of DEPENDENCY_DOMAINS) {
      if (!sameValue(beforeDiscovery[domain], afterDiscovery[domain])) changed.add(domain);
    }
  } else if (beforeDiscovery || afterDiscovery) {
    // Discovery appeared or disappeared — every domain may have changed meaning.
    for (const domain of DEPENDENCY_DOMAINS) changed.add(domain);
  } else {
    if (before.idea !== after.idea || before.location !== after.location) changed.add("business");
    if (before.audience !== after.audience) changed.add("customer");
    if (before.budget !== after.budget) changed.add("model");
    if (before.style !== after.style) changed.add("brand");
  }

  return DEPENDENCY_DOMAINS.filter((d) => changed.has(d));
}

/** Stable JSON comparison for plain discovery section objects. */
function sameValue(a: Discovery[DependencyDomain], b: Discovery[DependencyDomain]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Type-level / runtime check: every generated section appears in the registry. */
export function isGeneratedSectionId(value: string): value is GeneratedSectionId {
  return (SECTION_ORDER as ReadonlyMap<string, number>).has(value);
}
