import type {
  AgentLogEntry,
  Brand,
  BusinessPackage,
  BusinessStrategy,
  CompetitorAnalysis,
  CustomerPersona,
  EmailCampaign,
  GrowthPhase,
  LaunchPlan,
  LogoAsset,
  MarketResearch,
  PricingStrategy,
  SalesFunnelStage,
  SeoStructure,
  WhatsAppFlow,
} from "@/lib/types";
import {
  GENERATED_SECTIONS,
  isGeneratedSectionId,
  type GeneratedSectionId,
} from "@/lib/dependencies";
import type { WebsiteSpec } from "@/lib/website/model";
import { themeFromBrand } from "@/lib/website/theme";

/** Human-readable agent labels (match orchestrator / agentLog). */
export const SECTION_AGENT_LABELS = {
  brand: "Brand Agent",
  design: "Design Agent",
  logo: "Logo Agent",
  persona: "Persona Agent",
  competitor: "Competitor Agent",
  market: "Market Research Agent",
  pricing: "Pricing Agent",
  strategy: "Strategy Agent",
  website: "Website Agent",
  seo: "SEO Agent",
  marketing: "Marketing Agent",
  email: "Email Agent",
  whatsapp: "WhatsApp Agent",
  growth: "Growth Agent",
  launch: "Launch Agent",
} as const satisfies Record<GeneratedSectionId, string>;

export type SectionOutcomeStatus = "ok" | "fallback" | "error";

export interface SectionOutcome {
  section: GeneratedSectionId;
  status: SectionOutcomeStatus;
  source?: "llm" | "deterministic";
  message?: string;
}

/** Verbal identity slice used by brand/design agents. */
export interface VerbalIdentityPatch {
  name: string;
  slogan: string;
  description: string;
  mission: string;
  vision: string;
  values: string[];
  voice: string[];
  personality: string[];
  logoConcept: string;
}

export interface WebsiteCorePatch {
  spec: WebsiteSpec;
  pages: BusinessPackage["website"]["pages"];
  navItems: BusinessPackage["website"]["navItems"];
  footerColumns: BusinessPackage["website"]["footerColumns"];
}

export interface MarketingCorePatch {
  strategy: BusinessPackage["marketing"]["strategy"];
  instagram: BusinessPackage["marketing"]["instagram"];
  facebookAds: BusinessPackage["marketing"]["facebookAds"];
}

export interface GrowthCorePatch {
  phases: GrowthPhase[];
  salesFunnel: SalesFunnelStage[];
}

/** Successful section payload ready to merge onto a BusinessPackage. */
export type SectionPatch =
  | { section: "brand"; verbal: VerbalIdentityPatch }
  | { section: "design"; brand: Brand }
  | { section: "logo"; logo: LogoAsset }
  | { section: "persona"; persona: CustomerPersona }
  | { section: "competitor"; competitors: CompetitorAnalysis }
  | { section: "market"; marketResearch: MarketResearch }
  | { section: "pricing"; pricing: PricingStrategy }
  | { section: "strategy"; strategy: BusinessStrategy }
  | { section: "website"; website: WebsiteCorePatch }
  | { section: "seo"; seo: SeoStructure }
  | { section: "marketing"; marketing: MarketingCorePatch }
  | { section: "email"; email: EmailCampaign }
  | { section: "whatsapp"; whatsapp: WhatsAppFlow }
  | { section: "growth"; growth: GrowthCorePatch }
  | { section: "launch"; launch: LaunchPlan };

export type NormalizeSectionsResult =
  | { ok: true; sections: GeneratedSectionId[] }
  | { ok: false; reason: "empty" | "invalid" };

/**
 * Validates and normalizes a client section list: rejects unknown ids and
 * publisher, deduplicates, and returns sections in canonical pipeline order.
 */
export function normalizeSectionSelection(raw: unknown): NormalizeSectionsResult {
  if (!Array.isArray(raw)) return { ok: false, reason: "invalid" };
  if (raw.length === 0) return { ok: false, reason: "empty" };

  const seen = new Set<GeneratedSectionId>();
  for (const item of raw) {
    if (typeof item !== "string" || !isGeneratedSectionId(item)) {
      return { ok: false, reason: "invalid" };
    }
    seen.add(item);
  }

  const sections = GENERATED_SECTIONS.filter((s) => seen.has(s));
  if (sections.length === 0) return { ok: false, reason: "empty" };
  return { ok: true, sections: [...sections] };
}

/** Reconstruct verbal identity from a stored brand (for design-only regen). */
export function verbalFromBrand(brand: Brand): VerbalIdentityPatch {
  return {
    name: brand.name,
    slogan: brand.slogan,
    description: brand.description,
    mission: brand.mission,
    vision: brand.vision,
    values: brand.values,
    voice: brand.voice,
    personality: brand.personality,
    logoConcept: brand.logo.concept || "",
  };
}

/** The website theme copies the brand's colours, fonts and logo URL; keep it in step with the brand. */
function withBrandTheme(pkg: BusinessPackage): BusinessPackage {
  const spec = pkg.website.spec;
  if (!spec) return pkg;
  return { ...pkg, website: { ...pkg.website, spec: { ...spec, theme: themeFromBrand(pkg.brand) } } };
}

/** Apply one successful section patch without touching unrelated package fields. */
export function applySectionPatch(pkg: BusinessPackage, patch: SectionPatch): BusinessPackage {
  switch (patch.section) {
    case "brand": {
      const v = patch.verbal;
      return {
        ...pkg,
        brand: {
          ...pkg.brand,
          name: v.name,
          slogan: v.slogan,
          description: v.description,
          mission: v.mission,
          vision: v.vision,
          values: v.values,
          voice: v.voice,
          personality: v.personality,
          logo: { ...pkg.brand.logo, concept: v.logoConcept || pkg.brand.logo.concept },
        },
      };
    }
    case "design":
      // Design rebuilds palette/type/guidelines from verbal; keep the existing logo.
      return withBrandTheme({ ...pkg, brand: { ...patch.brand, logo: pkg.brand.logo } });
    case "logo":
      return withBrandTheme({ ...pkg, brand: { ...pkg.brand, logo: patch.logo } });
    case "persona":
      return { ...pkg, persona: patch.persona };
    case "competitor":
      return { ...pkg, competitors: patch.competitors };
    case "market":
      return { ...pkg, marketResearch: patch.marketResearch };
    case "pricing":
      return { ...pkg, pricing: patch.pricing };
    case "strategy":
      return { ...pkg, strategy: patch.strategy };
    case "website":
      // The theme is re-derived from the brand being saved: a patch built before a concurrent
      // logo change must not point the website at the replaced (and possibly deleted) logo.
      return withBrandTheme({
        ...pkg,
        website: {
          ...pkg.website,
          spec: patch.website.spec,
          pages: patch.website.pages,
          navItems: patch.website.navItems,
          footerColumns: patch.website.footerColumns,
        },
      });
    case "seo":
      return { ...pkg, website: { ...pkg.website, seo: patch.seo } };
    case "marketing":
      return {
        ...pkg,
        marketing: {
          ...pkg.marketing,
          strategy: patch.marketing.strategy,
          instagram: patch.marketing.instagram,
          facebookAds: patch.marketing.facebookAds,
        },
      };
    case "email":
      return { ...pkg, marketing: { ...pkg.marketing, email: patch.email } };
    case "whatsapp":
      return { ...pkg, marketing: { ...pkg.marketing, whatsapp: patch.whatsapp } };
    case "growth":
      return { ...pkg, growth: patch.growth.phases, salesFunnel: patch.growth.salesFunnel };
    case "launch":
      return { ...pkg, launch: patch.launch };
  }
}

export function applySectionPatches(pkg: BusinessPackage, patches: readonly SectionPatch[]): BusinessPackage {
  let next = pkg;
  for (const patch of patches) next = applySectionPatch(next, patch);
  return next;
}

function upsertAgentLog(log: readonly AgentLogEntry[], entry: AgentLogEntry): AgentLogEntry[] {
  const idx = log.findIndex((l) => l.agent === entry.agent);
  if (idx < 0) return [...log, entry];
  const next = [...log];
  next[idx] = entry;
  return next;
}

/** Merge agent-log outcomes into package meta after patches are applied. */
export function applyRegenerationMeta(pkg: BusinessPackage, outcomes: readonly SectionOutcome[]): BusinessPackage {
  let log = [...pkg.meta.agentLog];
  let usedLlm = pkg.meta.engine === "hybrid" || pkg.meta.engine === "llm";

  for (const outcome of outcomes) {
    const label = SECTION_AGENT_LABELS[outcome.section];
    if (outcome.status === "error") {
      log = upsertAgentLog(log, {
        agent: label,
        status: "error",
        source: "deterministic",
        durationMs: 0,
        note: outcome.message,
      });
      continue;
    }
    if (outcome.source === "llm") usedLlm = true;
    log = upsertAgentLog(log, {
      agent: label,
      status: outcome.status === "fallback" ? "fallback" : "ok",
      source: outcome.source ?? "deterministic",
      durationMs: 0,
      note: outcome.message,
    });
  }

  const allDet = log.every((l) => l.source === "deterministic");
  return {
    ...pkg,
    meta: {
      ...pkg.meta,
      engine: allDet ? "deterministic" : usedLlm ? (pkg.meta.engine === "llm" ? "llm" : "hybrid") : "deterministic",
      agentLog: log,
    },
  };
}
