import "server-only";

/**
 * Documented model catalog for StartupOS routing and cost estimates.
 *
 * Prices and status are copied from official provider docs as of the
 * `pricingVerifiedOn` dates below. They are NOT live-verified against a billing
 * account. Estimates must never be labeled as exact invoices.
 *
 * Sources (fetched 2026-10-26):
 * - https://developers.openai.com/api/docs/models
 * - https://developers.openai.com/api/docs/models/gpt-6-astra
 * - https://developers.openai.com/api/docs/models/gpt-6.1-sol
 * - https://developers.openai.com/api/docs/models/gpt-6-luna
 * - https://developers.openai.com/api/docs/guides/latest-model
 * - https://developers.openai.com/api/docs/pricing
 * - https://ollama.com/pricing
 */

export type ModelProvider = "openai" | "ollama-cloud" | "ollama-local" | "openai-compatible";

export type ModelCapability =
  | "chat"
  | "structuredJson"
  | "visionInput"
  | "imageGeneration"
  | "imageEdit"
  | "reasoning";

/** Documented Chat Completions reasoning_effort values (GPT-6 family). */
export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

/** USD per 1M tokens when documented; null when unknown or not applicable. */
export interface TokenPriceUsd {
  inputPer1M: number | null;
  outputPer1M: number | null;
  cachedInputPer1M?: number | null;
  /** ISO date the figure was read from docs. */
  verifiedOn: string;
  sourceUrl: string;
}

export interface CatalogModel {
  id: string;
  provider: ModelProvider;
  displayName: string;
  capabilities: ModelCapability[];
  /** Documented availability — not credentials-confirmed. */
  status: "active" | "deprecated" | "shut-down" | "local-only" | "documented" | "legacy";
  statusNote?: string;
  pricing?: TokenPriceUsd;
  /** Image-output token pricing when billed that way (OpenAI GPT Image). */
  imageTokenPricing?: TokenPriceUsd;
  /** Reasoning efforts documented for this model; omit when not a GPT-6 reasoning model. */
  reasoningEfforts?: readonly ReasoningEffort[];
  /** Official docs: Chat Completions supported (tool calling may still require Responses). */
  chatCompletions?: boolean;
}

const OPENAI_PRICING = "https://developers.openai.com/api/docs/pricing";
const VERIFIED = "2026-10-26";

/** Frontier + efficiency chat models for quality-first routing (Phase 6.6). */
export const CHAT_MODEL_CATALOG: readonly CatalogModel[] = [
  {
    id: "gpt-6-astra",
    provider: "openai",
    displayName: "GPT-6 Astra",
    capabilities: ["chat", "structuredJson", "visionInput", "reasoning"],
    status: "active",
    statusNote:
      "Flagship for demanding reasoning. Chat Completions + Responses supported; tool calling prefers Responses. Access not credentials-confirmed.",
    pricing: {
      inputPer1M: 10.0,
      outputPer1M: 50.0,
      cachedInputPer1M: 1.0,
      verifiedOn: VERIFIED,
      sourceUrl: OPENAI_PRICING,
    },
    reasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
    chatCompletions: true,
  },
  {
    id: "gpt-6.1-sol",
    provider: "openai",
    displayName: "GPT-6.1 Sol",
    capabilities: ["chat", "structuredJson", "visionInput", "reasoning"],
    status: "active",
    statusNote:
      "Primary high-quality model for most professional StartupOS work. Chat Completions supported; tool calling requires Responses.",
    pricing: {
      inputPer1M: 2.0,
      outputPer1M: 10.0,
      cachedInputPer1M: 0.1,
      verifiedOn: VERIFIED,
      sourceUrl: OPENAI_PRICING,
    },
    reasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
    chatCompletions: true,
  },
  {
    id: "gpt-6-luna",
    provider: "openai",
    displayName: "GPT-6 Luna",
    capabilities: ["chat", "structuredJson", "visionInput", "reasoning"],
    status: "active",
    statusNote:
      "Efficiency tier for constrained tasks only. Supports reasoning_effort none. Chat Completions function calling only with none.",
    pricing: {
      inputPer1M: 0.1,
      outputPer1M: 0.5,
      cachedInputPer1M: 0.01,
      verifiedOn: VERIFIED,
      sourceUrl: OPENAI_PRICING,
    },
    reasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    chatCompletions: true,
  },
  // Legacy IDs retained for cost estimates + explicit operator overrides — not quality-route defaults.
  {
    id: "gpt-4.1",
    provider: "openai",
    displayName: "GPT-4.1",
    capabilities: ["chat", "structuredJson", "visionInput", "reasoning"],
    status: "legacy",
    statusNote: "Superseded by gpt-6.1-sol / gpt-6-astra for quality routing; kept for overrides.",
    pricing: { inputPer1M: 2.0, outputPer1M: 8.0, cachedInputPer1M: 0.5, verifiedOn: VERIFIED, sourceUrl: OPENAI_PRICING },
    chatCompletions: true,
  },
  {
    id: "gpt-4.1-mini",
    provider: "openai",
    displayName: "GPT-4.1 Mini",
    capabilities: ["chat", "structuredJson", "visionInput"],
    status: "legacy",
    statusNote: "Superseded by gpt-6.1-sol / gpt-6-luna; kept for overrides.",
    pricing: { inputPer1M: 0.4, outputPer1M: 1.6, cachedInputPer1M: 0.1, verifiedOn: VERIFIED, sourceUrl: OPENAI_PRICING },
    chatCompletions: true,
  },
  {
    id: "gpt-4.1-nano",
    provider: "openai",
    displayName: "GPT-4.1 Nano",
    capabilities: ["chat", "structuredJson"],
    status: "legacy",
    statusNote: "Superseded by gpt-6-luna for constrained tasks; kept for overrides.",
    pricing: { inputPer1M: 0.1, outputPer1M: 0.4, cachedInputPer1M: 0.025, verifiedOn: VERIFIED, sourceUrl: OPENAI_PRICING },
    chatCompletions: true,
  },
  {
    id: "gpt-4o",
    provider: "openai",
    displayName: "GPT-4o",
    capabilities: ["chat", "structuredJson", "visionInput", "reasoning"],
    status: "legacy",
    statusNote: "Legacy; not a frontier GPT-6 model.",
    pricing: { inputPer1M: 2.5, outputPer1M: 10.0, cachedInputPer1M: 1.25, verifiedOn: VERIFIED, sourceUrl: OPENAI_PRICING },
    chatCompletions: true,
  },
  {
    id: "gpt-4o-mini",
    provider: "openai",
    displayName: "GPT-4o Mini",
    capabilities: ["chat", "structuredJson", "visionInput"],
    status: "legacy",
    statusNote: "Legacy default before Phase 6.6; prefer gpt-6.1-sol / gpt-6-luna.",
    pricing: { inputPer1M: 0.15, outputPer1M: 0.6, cachedInputPer1M: 0.075, verifiedOn: VERIFIED, sourceUrl: OPENAI_PRICING },
    chatCompletions: true,
  },
  {
    id: "gemma4:31b",
    provider: "ollama-cloud",
    displayName: "Gemma 4 31B (Ollama Cloud)",
    capabilities: ["chat", "structuredJson"],
    status: "documented",
    statusNote: "Ollama cloud table lists family `gemma4`; exact tag depends on account.",
    pricing: {
      inputPer1M: 0.14,
      outputPer1M: 0.4,
      cachedInputPer1M: 0.05,
      verifiedOn: VERIFIED,
      sourceUrl: "https://ollama.com/pricing",
    },
  },
  {
    id: "gemma3:1b",
    provider: "ollama-local",
    displayName: "Gemma 3 1B (local)",
    capabilities: ["chat", "structuredJson"],
    status: "local-only",
    statusNote: "Local inference has no per-token provider charge; hardware cost is separate.",
  },
] as const;

/** Image generation models. */
export const IMAGE_MODEL_CATALOG: readonly CatalogModel[] = [
  {
    id: "gpt-image-2.5-sunburst",
    provider: "openai",
    displayName: "GPT Image 2.5 Sunburst",
    capabilities: ["imageGeneration", "imageEdit"],
    status: "active",
    statusNote: "Premium final imagery via Images API /images/generations.",
    pricing: { inputPer1M: 5.0, outputPer1M: null, cachedInputPer1M: 1.25, verifiedOn: VERIFIED, sourceUrl: OPENAI_PRICING },
    imageTokenPricing: {
      inputPer1M: 8.0,
      outputPer1M: 30.0,
      cachedInputPer1M: 2.0,
      verifiedOn: VERIFIED,
      sourceUrl: OPENAI_PRICING,
    },
  },
  {
    id: "gpt-image-2.5-flare",
    provider: "openai",
    displayName: "GPT Image 2.5 Flare",
    capabilities: ["imageGeneration", "imageEdit"],
    status: "active",
    statusNote: "Faster / everyday image model; drafts and low-risk concepts.",
    pricing: { inputPer1M: 5.0, outputPer1M: null, cachedInputPer1M: 1.25, verifiedOn: VERIFIED, sourceUrl: OPENAI_PRICING },
    imageTokenPricing: {
      inputPer1M: 8.0,
      outputPer1M: 30.0,
      cachedInputPer1M: 2.0,
      verifiedOn: VERIFIED,
      sourceUrl: OPENAI_PRICING,
    },
  },
  {
    id: "gpt-image-1",
    provider: "openai",
    displayName: "GPT Image 1",
    capabilities: ["imageGeneration", "imageEdit"],
    status: "shut-down",
    statusNote: "Shut down 2026-10-23. Must not be used as a primary image model.",
  },
] as const;

export function findChatModel(id: string): CatalogModel | undefined {
  return CHAT_MODEL_CATALOG.find((m) => m.id === id);
}

export function findImageModel(id: string): CatalogModel | undefined {
  return IMAGE_MODEL_CATALOG.find((m) => m.id === id);
}

/** True when docs mark the image model as shut down. */
export function isImageModelShutDown(id: string): boolean {
  return findImageModel(id)?.status === "shut-down" || id === "gpt-image-1";
}

/** GPT-6 family IDs that accept Chat Completions `reasoning_effort`. */
export function isGpt6ChatModel(id: string): boolean {
  return id === "gpt-6-astra" || id === "gpt-6.1-sol" || id === "gpt-6-luna" || /^gpt-6(\.|-)/.test(id);
}

/**
 * Estimated USD cost from provider usage metadata and catalog pricing.
 * Returns null when pricing or usage is incomplete — never invents tokens.
 * When cachedTokens are reported, bill them at cachedInputPer1M when documented.
 */
export function estimateChatCostUsd(
  modelId: string,
  usage: { promptTokens: number; completionTokens: number; cachedTokens?: number },
): { usd: number; estimated: true; modelId: string; verifiedOn: string; sourceUrl: string } | null {
  const model = findChatModel(modelId);
  const price = model?.pricing;
  if (!price || price.inputPer1M == null || price.outputPer1M == null) return null;
  const cached =
    typeof usage.cachedTokens === "number" && Number.isFinite(usage.cachedTokens) && usage.cachedTokens > 0
      ? Math.min(usage.cachedTokens, usage.promptTokens)
      : 0;
  const freshInput = Math.max(0, usage.promptTokens - cached);
  const cachedRate = price.cachedInputPer1M ?? price.inputPer1M;
  const usd =
    (freshInput / 1_000_000) * price.inputPer1M +
    (cached / 1_000_000) * cachedRate +
    (usage.completionTokens / 1_000_000) * price.outputPer1M;
  return { usd, estimated: true, modelId, verifiedOn: price.verifiedOn, sourceUrl: price.sourceUrl };
}
