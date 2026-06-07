import type {
  Brand,
  BusinessInput,
  CompetitorAnalysis,
  CustomerPersona,
  Marketing,
  PricingStrategy,
  Website,
} from "@/lib/types";
import { createRng } from "@/lib/utils";
import { detectIndustry, type IndustryProfile } from "@/lib/engine/industry";
import { isLlmConfigured } from "@/lib/ai/client";

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
  useLlm: boolean;

  // Progressively populated outputs.
  brand?: Brand;
  persona?: CustomerPersona;
  competitors?: CompetitorAnalysis;
  pricing?: PricingStrategy;
  marketing?: Marketing;
  website?: Website;
}

export function createContext(input: BusinessInput): GenerationContext {
  const seed = `${input.idea}|${input.audience}|${input.location}|${input.budget}|${input.style}`;
  return {
    input,
    seed,
    rng: createRng(seed),
    industry: detectIndustry(input.idea),
    useLlm: isLlmConfigured(),
  };
}

export interface AgentOutput<T> {
  data: T;
  source: "llm" | "deterministic";
  note?: string;
}
