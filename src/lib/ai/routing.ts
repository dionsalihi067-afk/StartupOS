import "server-only";
import { resolveLlmProvider, type LlmProviderConfig, type LlmProviderKind } from "@/lib/ai/provider";
import { findChatModel, isGpt6ChatModel, isImageModelShutDown, type ReasoningEffort } from "@/lib/ai/models";

/**
 * Task-aware model routing — quality first, cost second (Phase 6.6).
 *
 * Modes (OPENAI_MODEL_ROUTING):
 *  - unset / "quality" / "task": OpenAI uses frontier task routes (Astra / Sol / Luna).
 *  - "single" / "legacy": every chat call uses the provider's configured model.
 *
 * On Ollama / openai-compatible, the configured model is always kept (no silent
 * provider switch), regardless of mode.
 *
 * Per-task env overrides always win when set:
 *  OPENAI_MODEL_REASONING, OPENAI_MODEL_RESEARCH, OPENAI_MODEL_CREATIVE,
 *  OPENAI_MODEL_WEBSITE, OPENAI_MODEL_STRUCTURED
 */

export type AiTaskCategory =
  | "reasoning"
  | "research"
  | "creative"
  | "website"
  | "structured"
  | "image-premium"
  | "image-draft";

export type RoutingMode = "single" | "quality";

export interface ModelSelection {
  modelId: string;
  providerKind: LlmProviderKind;
  task: AiTaskCategory;
  /** Why this model was chosen — safe for logs (no secrets). */
  reason: string;
  /** True when a cheaper / alternate eligible model was preferred over the global default. */
  routed: boolean;
  /** True when the selection is a documented fallback after a primary was unavailable. */
  fallback: boolean;
  /**
   * Chat Completions `reasoning_effort` for GPT-6 family when applicable.
   * Omitted for legacy / non-GPT-6 models so unsupported params are not sent.
   */
  reasoningEffort?: ReasoningEffort;
}

export interface ImageModelSelection {
  modelId: string;
  task: "image-premium" | "image-draft";
  quality: "low" | "medium" | "high" | "auto";
  reason: string;
  routed: boolean;
  /** Configured model was shut down; selection remapped to a documented successor. */
  remappedFromShutDown?: string;
}

const TASK_ENV: Record<Exclude<AiTaskCategory, "image-premium" | "image-draft">, string> = {
  reasoning: "OPENAI_MODEL_REASONING",
  research: "OPENAI_MODEL_RESEARCH",
  creative: "OPENAI_MODEL_CREATIVE",
  website: "OPENAI_MODEL_WEBSITE",
  structured: "OPENAI_MODEL_STRUCTURED",
};

/**
 * Quality-first OpenAI routes (documented IDs only).
 * - Astra: high-impact reasoning (strategy / growth).
 * - Sol: most substantial professional work (research, creative, website).
 * - Luna: constrained structured tasks only — never an automatic downgrade
 *   for failed complex work (runtime cascade is not implemented).
 * Fallbacks stay capability-compatible and do not silently use Luna for complex tasks.
 */
const OPENAI_QUALITY_ROUTE: Record<
  Exclude<AiTaskCategory, "image-premium" | "image-draft">,
  { primary: string; fallback: string }
> = {
  reasoning: { primary: "gpt-6-astra", fallback: "gpt-6.1-sol" },
  research: { primary: "gpt-6.1-sol", fallback: "gpt-6-astra" },
  creative: { primary: "gpt-6.1-sol", fallback: "gpt-6-astra" },
  website: { primary: "gpt-6.1-sol", fallback: "gpt-6-astra" },
  structured: { primary: "gpt-6-luna", fallback: "gpt-6.1-sol" },
};

/** Task-aware reasoning effort for GPT-6 Chat Completions. */
const TASK_REASONING_EFFORT: Record<Exclude<AiTaskCategory, "image-premium" | "image-draft">, ReasoningEffort> = {
  reasoning: "high",
  research: "medium",
  creative: "medium",
  website: "medium",
  structured: "none",
};

function trim(value: string | undefined): string {
  return (value ?? "").trim();
}

type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

export function routingMode(env: EnvLike = process.env): RoutingMode {
  const raw = trim(env.OPENAI_MODEL_ROUTING).toLowerCase();
  if (raw === "single" || raw === "legacy") return "single";
  // Default quality-first (Phase 6.6). Explicit single/legacy preserves compatibility.
  return "quality";
}

function taskOverride(task: Exclude<AiTaskCategory, "image-premium" | "image-draft">, env: EnvLike): string | null {
  const v = trim(env[TASK_ENV[task]]);
  return v || null;
}

/**
 * Resolves Chat Completions reasoning_effort for a model+task.
 * Returns undefined when the model must not receive the parameter (legacy / non-GPT-6).
 * Astra/Sol do not support `none` — map to `low` if needed.
 */
export function resolveReasoningEffort(
  modelId: string,
  task: Exclude<AiTaskCategory, "image-premium" | "image-draft">,
): ReasoningEffort | undefined {
  if (!isGpt6ChatModel(modelId)) return undefined;
  const catalog = findChatModel(modelId);
  // Uncatalogued GPT-6-like IDs: omit reasoning_effort rather than inventing a value
  // the endpoint may reject (conceals misconfiguration if we silently normalize).
  if (!catalog?.reasoningEfforts?.length) return undefined;

  let effort = TASK_REASONING_EFFORT[task];
  const allowed = catalog.reasoningEfforts;
  if (!allowed.includes(effort)) {
    // Documented: Astra/Sol reject `none` — use lowest allowed effort.
    effort = allowed.includes("low") ? "low" : allowed[0]!;
  }
  return effort;
}

function withEffort(
  base: Omit<ModelSelection, "reasoningEffort">,
): ModelSelection {
  if (base.task === "image-premium" || base.task === "image-draft") return base;
  const effort = resolveReasoningEffort(base.modelId, base.task);
  return effort ? { ...base, reasoningEffort: effort } : base;
}

/**
 * Resolves the chat model for a task without switching providers.
 * Ollama / openai-compatible deployments always keep their configured model unless
 * an explicit per-task override is set (operator choice).
 */
export function resolveChatModelForTask(
  task: Exclude<AiTaskCategory, "image-premium" | "image-draft">,
  options: { provider?: LlmProviderConfig; env?: EnvLike; explicitModel?: string } = {},
): ModelSelection {
  const env = options.env ?? process.env;
  const provider = options.provider ?? resolveLlmProvider(env as NodeJS.ProcessEnv);
  const mode = routingMode(env);

  if (options.explicitModel?.trim()) {
    return withEffort({
      modelId: options.explicitModel.trim(),
      providerKind: provider.kind,
      task,
      reason: "explicit-model-option",
      routed: true,
      fallback: false,
    });
  }

  const override = taskOverride(task, env);
  if (override) {
    return withEffort({
      modelId: override,
      providerKind: provider.kind,
      task,
      reason: `env:${TASK_ENV[task]}`,
      routed: true,
      fallback: false,
    });
  }

  // Non-OpenAI providers: never silently substitute an OpenAI catalog ID.
  if (provider.kind !== "openai") {
    return withEffort({
      modelId: provider.model,
      providerKind: provider.kind,
      task,
      reason: mode === "quality" ? `provider-${provider.kind}-keeps-configured-model` : "configured-model",
      routed: false,
      fallback: false,
    });
  }

  if (mode !== "quality") {
    return withEffort({
      modelId: provider.model,
      providerKind: provider.kind,
      task,
      reason: "configured-model-single-mode",
      routed: false,
      fallback: false,
    });
  }

  const route = OPENAI_QUALITY_ROUTE[task];
  // Quality-first: use the primary for this task. Keeping the configured model only
  // when it already *is* the primary avoids a remapped default (e.g. leftover
  // gemma→gpt-6.1-sol) from pinning every task onto Sol, including reasoning
  // (where Sol is merely the documented fallback). Operators who want Sol for
  // reasoning set OPENAI_MODEL_REASONING or OPENAI_MODEL_ROUTING=single.
  if (provider.model === route.primary) {
    return withEffort({
      modelId: provider.model,
      providerKind: provider.kind,
      task,
      reason: "configured-model-matches-quality-primary",
      routed: false,
      fallback: false,
    });
  }

  return withEffort({
    modelId: route.primary,
    providerKind: provider.kind,
    task,
    reason: `quality-route:${task}->${route.primary}`,
    routed: true,
    fallback: false,
  });
}

const DEFAULT_PREMIUM_IMAGE = "gpt-image-2.5-sunburst";
const DEFAULT_DRAFT_IMAGE = "gpt-image-2.5-flare";
const LEGACY_SHUTDOWN_IMAGE = "gpt-image-1";

/**
 * Image model selection. Premium assets prefer Sunburst; drafts may use Flare.
 * A configured shut-down model (gpt-image-1) is remapped to the documented successor.
 */
export function resolveImageModelForTask(
  task: "image-premium" | "image-draft" = "image-premium",
  env: EnvLike = process.env,
): ImageModelSelection {
  const draftOverride = trim(env.OPENAI_IMAGE_MODEL_DRAFT);
  const premiumConfigured = trim(env.OPENAI_IMAGE_MODEL);

  // Drafts never inherit OPENAI_IMAGE_MODEL (premium). Only an explicit draft override wins.
  if (task === "image-draft") {
    if (draftOverride) return resolveImageId(draftOverride, task, "env:OPENAI_IMAGE_MODEL_DRAFT", true);
    return {
      modelId: DEFAULT_DRAFT_IMAGE,
      task,
      quality: "medium",
      reason: "default-draft-flare",
      routed: true,
    };
  }

  const configured = premiumConfigured || DEFAULT_PREMIUM_IMAGE;
  return resolveImageId(
    configured,
    task,
    premiumConfigured ? "env:OPENAI_IMAGE_MODEL" : "default-premium-sunburst",
    Boolean(premiumConfigured),
  );
}

function resolveImageId(
  modelId: string,
  task: "image-premium" | "image-draft",
  reason: string,
  routed: boolean,
): ImageModelSelection {
  const quality: ImageModelSelection["quality"] = task === "image-premium" ? "high" : "medium";

  if (isImageModelShutDown(modelId) || modelId === LEGACY_SHUTDOWN_IMAGE) {
    const successor = task === "image-draft" ? DEFAULT_DRAFT_IMAGE : DEFAULT_PREMIUM_IMAGE;
    return {
      modelId: successor,
      task,
      quality,
      reason: `remapped-shut-down:${modelId}->${successor}`,
      routed: true,
      remappedFromShutDown: modelId,
    };
  }

  return { modelId, task, quality, reason, routed };
}

/** Eligible chat fallback ID for a task on OpenAI quality routing (for docs/tests). */
export function qualityFallbackModel(task: Exclude<AiTaskCategory, "image-premium" | "image-draft">): string {
  return OPENAI_QUALITY_ROUTE[task].fallback;
}

export function qualityPrimaryModel(task: Exclude<AiTaskCategory, "image-premium" | "image-draft">): string {
  return OPENAI_QUALITY_ROUTE[task].primary;
}

/** True when Luna is eligible as the quality primary for this task (constrained only). */
export function lunaAllowedForTask(task: Exclude<AiTaskCategory, "image-premium" | "image-draft">): boolean {
  return OPENAI_QUALITY_ROUTE[task].primary === "gpt-6-luna";
}
