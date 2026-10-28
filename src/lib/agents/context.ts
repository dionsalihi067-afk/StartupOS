import type {
  Brand,
  BusinessInput,
  BusinessStrategy,
  CompetitorAnalysis,
  CustomerPersona,
  Marketing,
  PricingStrategy,
  ResearchStatus,
  Website,
} from "@/lib/types";
import { createRng } from "@/lib/utils";
import { detectInputIndustry, type IndustryProfile } from "@/lib/engine/industry";
import { buildBusinessProfile, renderProfile, type BusinessProfile } from "@/lib/engine/profile";
import { isLlmConfigured } from "@/lib/ai/client";
import { discoveryBrief } from "@/lib/discovery";
import type { GeneratedSectionId } from "@/lib/dependencies";
import type { ResearchRunResult } from "@/lib/research/model";
import { projectResearchForAgents, type AgentResearchContext, type GenerationResearch } from "@/lib/research/agent-context";
import { renderResearchContext } from "@/lib/research/prompt";

/**
 * Mutable build context threaded through every agent. Each agent reads the
 * fields populated by upstream agents and writes its own slice. The orchestrator
 * owns the lifecycle.
 */
export interface GenerationContext {
  input: BusinessInput;
  seed: string;
  rng: () => number;
  industry: IndustryProfile;
  /** Canonical reading of the owner's input shared by every step. */
  profile: BusinessProfile;
  useLlm: boolean;
  /** Per-step research projections; absent when no research run was supplied. */
  research?: GenerationResearch;
  /** Which search provider ran the shared research and the queries that returned results; shown to the owner, never prompted. */
  researchRun?: { provider: string | null; queries: string[] };
  /** Persists generated binary assets (logos); absent when no durable storage is available. */
  storeAsset?: AssetStore;

  // Progressively populated outputs.
  brand?: Brand;
  persona?: CustomerPersona;
  competitors?: CompetitorAnalysis;
  pricing?: PricingStrategy;
  strategy?: BusinessStrategy;
  marketing?: Marketing;
  website?: Website;
}

export interface StoredAssetInput {
  kind: "logo" | "icon";
  contentType: string;
  bytes: Buffer;
}

/** Saves an asset durably and returns the URL it is served from. */
export type AssetStore = (asset: StoredAssetInput) => Promise<string>;

export interface ContextOptions {
  /** Optional research run; generation behaves exactly as before without it. */
  research?: ResearchRunResult;
  /** Reference time for research freshness. */
  now?: Date;
  storeAsset?: AssetStore;
}

/**
 * Deterministic seed from owner-provided facts. Discovery answers that change
 * the business (stage, channels, offering, …) are included so two briefs that
 * share only the five core fields do not silently share the same RNG stream.
 */
export function contextSeed(input: BusinessInput): string {
  const d = input.discovery;
  const discovery = d
    ? [
        d.business.name ?? "",
        d.business.offering ?? "",
        d.business.stage,
        d.business.type,
        d.business.category,
        (d.model.channels ?? []).join(","),
        (d.model.revenue ?? []).join(","),
        d.offer.main ?? "",
        d.market.positioning ?? "",
        d.goals.priority,
      ].join("|")
    : "";
  return `${input.idea}|${input.audience}|${input.location}|${input.budget}|${input.style}|${discovery}`;
}

export function createContext(input: BusinessInput, options: ContextOptions = {}): GenerationContext {
  const seed = contextSeed(input);
  const industry = detectInputIndustry(input);
  const ctx: GenerationContext = {
    input,
    seed,
    rng: createRng(seed),
    industry,
    profile: buildBusinessProfile(input, industry),
    useLlm: isLlmConfigured(),
    storeAsset: options.storeAsset,
  };
  if (options.research) {
    ctx.research = projectResearchForAgents(options.research, options.now ?? new Date());
    const run = options.research.status === "failed" ? options.research : options.research.snapshot;
    ctx.researchRun = {
      provider: run.provider,
      queries: run.queries.filter((q) => q.status === "ok").map((q) => q.text),
    };
  }
  return ctx;
}

/** Appends the canonical profile and the owner's discovery answers (if any) to an LLM prompt. */
export function withBrief(ctx: GenerationContext, prompt: string): string {
  const profile = renderProfile(ctx.profile);
  return ctx.input.discovery ? `${prompt}\n\n${profile}\n\n${discoveryBrief(ctx.input.discovery)}` : `${prompt}\n\n${profile}`;
}

/** Note for an LLM-capable step that had to use its template output. */
export function fallbackNote(note: string | undefined): string {
  return note ?? "llm-invalid-output";
}

/** Appends this step's research slice (if any) to an LLM prompt; unchanged when there is none. */
export function withResearch(ctx: GenerationContext, agent: GeneratedSectionId, prompt: string): string {
  const research = ctx.research?.[agent];
  return research ? `${prompt}\n\n${renderResearchContext(research)}` : prompt;
}

export interface AgentOutput<T> {
  data: T;
  source: "llm" | "deterministic";
  note?: string;
  /** Model that handled the LLM call when known — never invents IDs. */
  modelId?: string;
  /** Catalog-based USD estimate from provider usage; never an invoice. */
  costUsd?: number;
  /** True when costUsd is an estimate (always when present). */
  costEstimated?: true;
}

/** Forwards selection/cost from generateJson onto an agent result without inventing usage. */
export function withLlmTelemetry<T>(
  out: AgentOutput<T>,
  res: {
    selection?: { modelId?: string } | null;
    costEstimate?: { usd: number; estimated: true } | null;
  },
): AgentOutput<T> {
  const modelId = res.selection?.modelId?.trim();
  const cost = res.costEstimate?.estimated === true ? res.costEstimate.usd : undefined;
  return {
    ...out,
    ...(modelId ? { modelId } : {}),
    ...(typeof cost === "number" && Number.isFinite(cost) ? { costUsd: cost, costEstimated: true as const } : {}),
  };
}

/**
 * Output for a search-backed step whose shared research run failed: the
 * failure is reported as such (never as "no competitors" or "no market") and
 * the step does not search again on its own.
 */
export function researchUnavailable<T>(
  research: AgentResearchContext,
  empty: (status: Exclude<ResearchStatus, "ok">, provider: null, queries: string[]) => T,
): AgentOutput<T> {
  if (research.failure === "notConfigured") {
    return { data: empty("search-not-configured", null, []), source: "deterministic", note: "search-not-configured" };
  }
  return { data: empty("error", null, []), source: "deterministic", note: "research-failed" };
}
