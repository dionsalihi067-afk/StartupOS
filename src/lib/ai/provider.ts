import "server-only";

/**
 * Central LLM provider resolution — OpenAI-primary.
 *
 * Default preference order (`LLM_PROVIDER=auto` or unset):
 *  1. Real OpenAI API key (`sk-…`) → https://api.openai.com/v1
 *     (a localhost OPENAI_BASE_URL does NOT override this — set LLM_PROVIDER=ollama-local to opt in)
 *  2. Explicit LLM_PROVIDER=ollama-cloud / OLLAMA_API_KEY alone → Ollama Cloud
 *  3. Explicit LLM_PROVIDER=ollama-local or local base without a real OpenAI key → Ollama Local (dev only)
 *  4. Otherwise not configured (deterministic templates; must not be labeled as live AI)
 *
 * Set LLM_PROVIDER=openai to require OpenAI and refuse silent Ollama/local fallbacks.
 */

export type LlmProviderKind = "openai" | "ollama-cloud" | "ollama-local" | "openai-compatible";

/** Operator intent — controls whether OpenAI can be overridden by a local base URL. */
export type LlmProviderPreference = "auto" | "openai" | "ollama-local" | "ollama-cloud";

export interface LlmProviderConfig {
  configured: boolean;
  /** Why the provider is not usable, when configured is false. */
  reason?: "not-configured" | "localhost-in-production" | "openai-required";
  baseUrl: string;
  /** Bearer token, or null when the local Ollama server needs none. */
  apiKey: string | null;
  model: string;
  kind: LlmProviderKind;
  /** Longer default timeout for CPU-bound local inference. */
  defaultTimeoutMs: number;
  /** Safe explanation of how the provider was chosen (no secrets). */
  selectionReason: string;
  /** Operator preference that was applied. */
  preference: LlmProviderPreference;
  /**
   * True when an OPENAI_BASE_URL pointing at local Ollama was ignored because a
   * real OpenAI key is present and preference is auto/openai.
   */
  ignoredLocalBase?: boolean;
}

const OPENAI_DEFAULT_BASE = "https://api.openai.com/v1";
const OLLAMA_CLOUD_BASE = "https://ollama.com/v1";
const OLLAMA_LOCAL_DEFAULT = "http://127.0.0.1:11434/v1";

/** Default when OPENAI_MODEL is unset — Sol is the quality/cost primary for OpenAI. */
const DEFAULT_OPENAI_MODEL = "gpt-6.1-sol";
const DEFAULT_OLLAMA_CLOUD_MODEL = "gemma4:31b";
const DEFAULT_OLLAMA_LOCAL_MODEL = "gemma3:1b";

export function isProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" || env.VERCEL === "1";
}

/** True when the base URL targets a loopback Ollama server. */
export function isLocalOllamaBaseUrl(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl.includes("://") ? baseUrl : `http://${baseUrl}`);
    const host = u.hostname.toLowerCase();
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") return false;
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    return port === "11434" || baseUrl.includes("11434");
  } catch {
    return false;
  }
}

export function isOllamaCloudBaseUrl(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl.includes("://") ? baseUrl : `https://${baseUrl}`);
    const host = u.hostname.toLowerCase();
    return host === "ollama.com" || host.endsWith(".ollama.com");
  } catch {
    return false;
  }
}

/** True when the chat endpoint is Ollama (cloud or local) — not OpenAI image-capable. */
export function isOllamaBaseUrl(baseUrl: string): boolean {
  return isLocalOllamaBaseUrl(baseUrl) || isOllamaCloudBaseUrl(baseUrl);
}

function trim(value: string | undefined): string {
  return (value ?? "").trim();
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

/**
 * Real OpenAI secrets start with `sk-`. Placeholder values like `ollama` must not
 * claim OpenAI primary and must not override an intentional local setup.
 */
export function looksLikeOpenAiSecret(apiKey: string | null | undefined): boolean {
  const k = (apiKey ?? "").trim();
  return k.startsWith("sk-") && k.length >= 20;
}

/**
 * Ollama tags often look like `gemma3:1b` / `llama3.2:latest`. Those IDs must not
 * be sent to api.openai.com when auto-preferring OpenAI over a leftover local setup.
 */
export function looksLikeOllamaModelId(model: string | null | undefined): boolean {
  const m = (model ?? "").trim().toLowerCase();
  if (!m) return false;
  if (m.includes(":")) return true;
  if (m.startsWith("gemma") || m.startsWith("llama") || m.startsWith("qwen") || m.startsWith("mistral")) {
    return !m.startsWith("gpt-");
  }
  return false;
}

/** Model to use on OpenAI when OPENAI_MODEL is unset or is an Ollama-shaped leftover. */
export function resolveOpenAiChatModel(explicitModel: string | undefined | null): string {
  const m = (explicitModel ?? "").trim();
  if (!m || looksLikeOllamaModelId(m)) return DEFAULT_OPENAI_MODEL;
  return m;
}

export function resolveLlmProviderPreference(env: NodeJS.ProcessEnv = process.env): LlmProviderPreference {
  const raw = trim(env.LLM_PROVIDER).toLowerCase();
  if (raw === "openai" || raw === "ollama-local" || raw === "ollama-cloud") return raw;
  return "auto";
}

function notConfigured(
  preference: LlmProviderPreference,
  reason: NonNullable<LlmProviderConfig["reason"]>,
  selectionReason: string,
  partial?: Partial<LlmProviderConfig>,
): LlmProviderConfig {
  return {
    configured: false,
    reason,
    baseUrl: partial?.baseUrl ?? OPENAI_DEFAULT_BASE,
    apiKey: null,
    model: partial?.model ?? DEFAULT_OPENAI_MODEL,
    kind: partial?.kind ?? "openai",
    defaultTimeoutMs: partial?.defaultTimeoutMs ?? 45_000,
    selectionReason,
    preference,
    ...(partial?.ignoredLocalBase ? { ignoredLocalBase: true } : {}),
  };
}

function openaiConfig(
  preference: LlmProviderPreference,
  apiKey: string,
  model: string,
  selectionReason: string,
  ignoredLocalBase?: boolean,
): LlmProviderConfig {
  return {
    configured: true,
    baseUrl: OPENAI_DEFAULT_BASE,
    apiKey,
    model,
    kind: "openai",
    defaultTimeoutMs: 45_000,
    selectionReason,
    preference,
    ...(ignoredLocalBase ? { ignoredLocalBase: true } : {}),
  };
}

/**
 * Picks base URL / key / model with OpenAI as the intended primary provider.
 * Local/cloud Ollama remain available only when explicitly preferred or when no
 * real OpenAI key is present.
 */
export function resolveLlmProvider(env: NodeJS.ProcessEnv = process.env): LlmProviderConfig {
  const openaiKey = trim(env.OPENAI_API_KEY);
  const ollamaKey = trim(env.OLLAMA_API_KEY);
  const explicitBase = trim(env.OPENAI_BASE_URL);
  const explicitModel = trim(env.OPENAI_MODEL);
  const preference = resolveLlmProviderPreference(env);
  const openAiModel = resolveOpenAiChatModel(explicitModel);
  const hasRealOpenAi = looksLikeOpenAiSecret(openaiKey);

  // --- Explicit preference: openai required ---
  if (preference === "openai") {
    if (!hasRealOpenAi) {
      return notConfigured(preference, "openai-required", "llm-provider=openai but no real OPENAI_API_KEY (sk-…)");
    }
    if (explicitBase && isLocalOllamaBaseUrl(explicitBase)) {
      return openaiConfig(preference, openaiKey, openAiModel, "llm-provider=openai; ignored local OPENAI_BASE_URL", true);
    }
    if (explicitBase && isOllamaCloudBaseUrl(explicitBase)) {
      return openaiConfig(preference, openaiKey, openAiModel, "llm-provider=openai; ignored ollama-cloud OPENAI_BASE_URL", true);
    }
    if (explicitBase && !explicitBase.startsWith("https://api.openai.com") && !isOllamaBaseUrl(explicitBase)) {
      // Custom OpenAI-compatible proxy with a real OpenAI key — keep base.
      return {
        configured: true,
        baseUrl: stripTrailingSlash(explicitBase),
        apiKey: openaiKey,
        model: openAiModel,
        kind: "openai-compatible",
        defaultTimeoutMs: 45_000,
        selectionReason: "llm-provider=openai; custom OPENAI_BASE_URL",
        preference,
      };
    }
    return openaiConfig(preference, openaiKey, openAiModel, "llm-provider=openai");
  }

  // --- Explicit preference: ollama-local ---
  if (preference === "ollama-local") {
    const baseUrl = explicitBase && isLocalOllamaBaseUrl(explicitBase) ? stripTrailingSlash(explicitBase) : OLLAMA_LOCAL_DEFAULT;
    const model = explicitModel || DEFAULT_OLLAMA_LOCAL_MODEL;
    if (isProductionRuntime(env)) {
      return notConfigured(preference, "localhost-in-production", "llm-provider=ollama-local refused in production", {
        kind: "ollama-local",
        baseUrl,
        model,
        defaultTimeoutMs: 120_000,
      });
    }
    return {
      configured: true,
      baseUrl,
      apiKey: openaiKey || ollamaKey || "ollama",
      model,
      kind: "ollama-local",
      defaultTimeoutMs: 120_000,
      selectionReason: "llm-provider=ollama-local",
      preference,
    };
  }

  // --- Explicit preference: ollama-cloud ---
  if (preference === "ollama-cloud") {
    if (!ollamaKey) {
      return notConfigured(preference, "not-configured", "llm-provider=ollama-cloud requires OLLAMA_API_KEY");
    }
    return {
      configured: true,
      baseUrl: OLLAMA_CLOUD_BASE,
      apiKey: ollamaKey,
      model: explicitModel || DEFAULT_OLLAMA_CLOUD_MODEL,
      kind: "ollama-cloud",
      defaultTimeoutMs: 45_000,
      selectionReason: "llm-provider=ollama-cloud",
      preference,
    };
  }

  // --- auto (OpenAI-primary) ---
  // Real OpenAI key always wins over a localhost base left over from local experiments.
  if (hasRealOpenAi) {
    if (explicitBase && isLocalOllamaBaseUrl(explicitBase)) {
      return openaiConfig(preference, openaiKey, openAiModel, "auto: OpenAI key preferred over local OPENAI_BASE_URL", true);
    }
    if (explicitBase && isOllamaCloudBaseUrl(explicitBase)) {
      // Operator pointed BASE at Ollama Cloud but also set a real OpenAI key —
      // OpenAI remains primary in auto mode; use LLM_PROVIDER=ollama-cloud to opt in.
      return openaiConfig(preference, openaiKey, openAiModel, "auto: OpenAI key preferred over ollama-cloud OPENAI_BASE_URL", true);
    }
    if (explicitBase && !explicitBase.startsWith("https://api.openai.com")) {
      return {
        configured: true,
        baseUrl: stripTrailingSlash(explicitBase),
        apiKey: openaiKey,
        model: openAiModel,
        kind: "openai-compatible",
        defaultTimeoutMs: 45_000,
        selectionReason: "auto: OpenAI key + custom OPENAI_BASE_URL",
        preference,
      };
    }
    return openaiConfig(preference, openaiKey, openAiModel, "auto: OPENAI_API_KEY");
  }

  if (explicitBase) {
    const baseUrl = stripTrailingSlash(explicitBase);
    if (isLocalOllamaBaseUrl(baseUrl)) {
      if (isProductionRuntime(env)) {
        return notConfigured(preference, "localhost-in-production", "auto: local Ollama refused in production", {
          kind: "ollama-local",
          baseUrl,
          model: explicitModel || DEFAULT_OLLAMA_LOCAL_MODEL,
          defaultTimeoutMs: 120_000,
        });
      }
      return {
        configured: true,
        baseUrl,
        apiKey: openaiKey || ollamaKey || "ollama",
        model: explicitModel || DEFAULT_OLLAMA_LOCAL_MODEL,
        kind: "ollama-local",
        defaultTimeoutMs: 120_000,
        selectionReason: "auto: local OPENAI_BASE_URL without real OpenAI key",
        preference,
      };
    }
    if (isOllamaCloudBaseUrl(baseUrl)) {
      const apiKey = ollamaKey || openaiKey || null;
      if (!apiKey) {
        return notConfigured(preference, "not-configured", "auto: ollama-cloud base without API key", {
          kind: "ollama-cloud",
          baseUrl,
          model: explicitModel || DEFAULT_OLLAMA_CLOUD_MODEL,
        });
      }
      return {
        configured: true,
        baseUrl,
        apiKey,
        model: explicitModel || DEFAULT_OLLAMA_CLOUD_MODEL,
        kind: "ollama-cloud",
        defaultTimeoutMs: 45_000,
        selectionReason: "auto: ollama-cloud OPENAI_BASE_URL",
        preference,
      };
    }
    if (baseUrl.startsWith("https://api.openai.com")) {
      return notConfigured(preference, "not-configured", "auto: OpenAI base without real OPENAI_API_KEY");
    }
    const apiKey = openaiKey || ollamaKey || null;
    if (!apiKey) {
      return notConfigured(preference, "not-configured", "auto: custom base without API key", {
        kind: "openai-compatible",
        baseUrl,
      });
    }
    return {
      configured: true,
      baseUrl,
      apiKey,
      model: explicitModel || DEFAULT_OPENAI_MODEL,
      kind: "openai-compatible",
      defaultTimeoutMs: 45_000,
      selectionReason: "auto: custom OPENAI_BASE_URL",
      preference,
    };
  }

  if (ollamaKey) {
    return {
      configured: true,
      baseUrl: OLLAMA_CLOUD_BASE,
      apiKey: ollamaKey,
      model: explicitModel || DEFAULT_OLLAMA_CLOUD_MODEL,
      kind: "ollama-cloud",
      defaultTimeoutMs: 45_000,
      selectionReason: "auto: OLLAMA_API_KEY only",
      preference,
    };
  }

  return notConfigured(preference, "not-configured", "auto: no OpenAI or Ollama credentials");
}

/** Default local base URL for docs / .env.example — never auto-selected in production. */
export const OLLAMA_LOCAL_BASE_URL = OLLAMA_LOCAL_DEFAULT;
export const OLLAMA_CLOUD_BASE_URL = OLLAMA_CLOUD_BASE;
export const OPENAI_API_BASE_URL = OPENAI_DEFAULT_BASE;
