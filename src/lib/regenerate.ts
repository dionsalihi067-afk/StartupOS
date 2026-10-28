import "server-only";
import type { BusinessPackage } from "@/lib/types";
import { GENERATED_SECTIONS, type GeneratedSectionId } from "@/lib/dependencies";
import { createContext, type AgentOutput, type ContextOptions, type GenerationContext } from "@/lib/agents/context";
import { runBrandAgent, type VerbalIdentity } from "@/lib/agents/brand";
import { runDesignAgent } from "@/lib/agents/design";
import { runLogoAgent } from "@/lib/agents/logo";
import { runPersonaAgent } from "@/lib/agents/persona";
import { runCompetitorAgent } from "@/lib/agents/competitor";
import { runMarketAgent } from "@/lib/agents/market";
import { runPricingAgent } from "@/lib/agents/pricing";
import { runStrategyAgent } from "@/lib/agents/strategy";
import { runWebsiteAgent } from "@/lib/agents/website";
import { runSeoAgent } from "@/lib/agents/seo";
import { runMarketingAgent } from "@/lib/agents/marketing";
import { runEmailAgent } from "@/lib/agents/email";
import { runWhatsAppAgent } from "@/lib/agents/whatsapp";
import { runGrowthAgent } from "@/lib/agents/growth";
import { runLaunchAgent } from "@/lib/agents/launch";
import {
  applySectionPatch,
  verbalFromBrand,
  type SectionOutcome,
  type SectionPatch,
  type VerbalIdentityPatch,
} from "@/lib/regenerate-core";

export {
  SECTION_AGENT_LABELS,
  applyRegenerationMeta,
  applySectionPatch,
  applySectionPatches,
  normalizeSectionSelection,
  verbalFromBrand,
  type NormalizeSectionsResult,
  type SectionOutcome,
  type SectionOutcomeStatus,
  type SectionPatch,
} from "@/lib/regenerate-core";

type RunResult = { patch: SectionPatch; output: AgentOutput<unknown> };

/** Sections whose agents read research; the others are built from stored output only, so researching for them is wasted. */
const RESEARCH_READERS: ReadonlySet<GeneratedSectionId> = new Set([
  "brand",
  "persona",
  "competitor",
  "market",
  "pricing",
  "strategy",
  "website",
  "marketing",
  "email",
  "growth",
]);

export function regenerationNeedsResearch(sections: readonly GeneratedSectionId[]): boolean {
  return sections.some((s) => RESEARCH_READERS.has(s));
}

function seedContext(pkg: BusinessPackage, options: ContextOptions): GenerationContext {
  const ctx = createContext(pkg.input, options);
  ctx.brand = pkg.brand;
  ctx.persona = pkg.persona;
  ctx.competitors = pkg.competitors;
  ctx.pricing = pkg.pricing;
  ctx.strategy = pkg.strategy;
  ctx.marketing = pkg.marketing;
  ctx.website = pkg.website;
  return ctx;
}

/**
 * Runs one generation unit against the live context. Uses the same agent
 * functions as full generation — never a parallel prompt path.
 */
async function runSection(section: GeneratedSectionId, ctx: GenerationContext, verbal: VerbalIdentity): Promise<RunResult> {
  switch (section) {
    case "brand": {
      const output = await runBrandAgent(ctx);
      return { patch: { section: "brand", verbal: output.data }, output };
    }
    case "design": {
      const output = runDesignAgent(ctx, verbal);
      return { patch: { section: "design", brand: output.data }, output };
    }
    case "logo": {
      const output = await runLogoAgent(ctx, ctx.brand!);
      // A failed render must not replace the logo the business already has.
      if (!output.data.generated) throw new Error(output.note ?? "logo-failed");
      return { patch: { section: "logo", logo: output.data }, output };
    }
    case "persona": {
      const output = await runPersonaAgent(ctx);
      return { patch: { section: "persona", persona: output.data }, output };
    }
    case "competitor": {
      const output = await runCompetitorAgent(ctx);
      return { patch: { section: "competitor", competitors: output.data }, output };
    }
    case "market": {
      const output = await runMarketAgent(ctx);
      return { patch: { section: "market", marketResearch: output.data }, output };
    }
    case "pricing": {
      const output = await runPricingAgent(ctx);
      return { patch: { section: "pricing", pricing: output.data }, output };
    }
    case "strategy": {
      const output = await runStrategyAgent(ctx);
      return { patch: { section: "strategy", strategy: output.data }, output };
    }
    case "website": {
      const output = await runWebsiteAgent(ctx, ctx.brand!, ctx.pricing!);
      return { patch: { section: "website", website: output.data }, output };
    }
    case "seo": {
      const pages = ctx.website?.pages ?? [];
      const output = runSeoAgent(ctx, ctx.brand!, pages);
      return { patch: { section: "seo", seo: output.data }, output };
    }
    case "marketing": {
      const output = await runMarketingAgent(ctx, ctx.brand!, ctx.persona!);
      return { patch: { section: "marketing", marketing: output.data }, output };
    }
    case "email": {
      const output = await runEmailAgent(ctx, ctx.brand!);
      return { patch: { section: "email", email: output.data }, output };
    }
    case "whatsapp": {
      const output = runWhatsAppAgent(ctx, ctx.brand!);
      return { patch: { section: "whatsapp", whatsapp: output.data }, output };
    }
    case "growth": {
      const output = await runGrowthAgent(ctx, ctx.brand!);
      return { patch: { section: "growth", growth: output.data }, output };
    }
    case "launch": {
      const output = runLaunchAgent(ctx, ctx.brand!);
      return { patch: { section: "launch", launch: output.data }, output };
    }
  }
}

function syncContextFromPatch(ctx: GenerationContext, patch: SectionPatch, working: BusinessPackage): VerbalIdentityPatch | null {
  switch (patch.section) {
    case "brand":
      ctx.brand = working.brand;
      return patch.verbal;
    case "design":
    case "logo":
      ctx.brand = working.brand;
      return null;
    case "persona":
      ctx.persona = working.persona;
      return null;
    case "competitor":
      ctx.competitors = working.competitors;
      return null;
    case "pricing":
      ctx.pricing = working.pricing;
      return null;
    case "strategy":
      ctx.strategy = working.strategy;
      return null;
    case "website":
      ctx.website = working.website;
      return null;
    case "marketing":
      ctx.marketing = working.marketing;
      return null;
    default:
      return null;
  }
}

export interface ScopedRegenerationResult {
  /** Patches for sections that succeeded (ok or fallback). Apply onto the latest package. */
  patches: SectionPatch[];
  outcomes: SectionOutcome[];
  succeeded: GeneratedSectionId[];
  failed: GeneratedSectionId[];
}

export type SectionRunner = (
  section: GeneratedSectionId,
  ctx: GenerationContext,
  verbal: VerbalIdentity,
) => Promise<RunResult>;

/**
 * Regenerates only the requested sections in pipeline order, using existing
 * package outputs as upstream context. Failures are isolated: a failed section
 * produces no patch and leaves prior output intact when merged. Optional
 * research reaches each agent exactly as in full generation.
 */
export async function regenerateSelectedSections(
  current: BusinessPackage,
  sections: readonly GeneratedSectionId[],
  runner: SectionRunner = runSection,
  options: ContextOptions = {},
): Promise<ScopedRegenerationResult> {
  const ordered = GENERATED_SECTIONS.filter((s) => sections.includes(s));
  const ctx = seedContext(current, options);
  let verbal: VerbalIdentity = verbalFromBrand(current.brand);
  let working = current;

  const patches: SectionPatch[] = [];
  const outcomes: SectionOutcome[] = [];
  const succeeded: GeneratedSectionId[] = [];
  const failed: GeneratedSectionId[] = [];

  for (const section of ordered) {
    try {
      const { patch, output } = await runner(section, ctx, verbal);
      working = applySectionPatch(working, patch);
      const maybeVerbal = syncContextFromPatch(ctx, patch, working);
      if (maybeVerbal) verbal = maybeVerbal;

      patches.push(patch);
      succeeded.push(section);
      outcomes.push({
        section,
        status: output.note ? "fallback" : "ok",
        source: output.source,
        message: output.note,
      });
    } catch (err) {
      failed.push(section);
      outcomes.push({
        section,
        status: "error",
        message: err instanceof Error ? err.message : "unknown error",
      });
    }
  }

  return { patches, outcomes, succeeded, failed };
}
