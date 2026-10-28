/**
 * Client-side interpretation of `/api/status`.
 *
 * Configuration flags are not live probes. Chat availability must not imply
 * image generation, and a permanent provider block must not look “configured”.
 * “Configured” means local env/config looks usable — never that a live request succeeded.
 */

export type ProviderStatusPayload = {
  /** Auth feature flags from server config (not live probes). */
  auth?: {
    passwordRecovery?: boolean;
    googleSignIn?: boolean;
  };
  llmConfigured: boolean;
  llmBlockedReason?: string | null;
  /** Non-secret config failure (e.g. localhost-in-production). */
  llmConfigReason?: string | null;
  /** openai | ollama-local | ollama-cloud | … when configured. */
  llmProvider?: string | null;
  /** Operator preference: auto | openai | ollama-local | ollama-cloud. */
  llmPreference?: string | null;
  /** Safe explanation of how the provider was chosen (no secrets). */
  llmSelectionReason?: string | null;
  /** True when a local OPENAI_BASE_URL was ignored in favor of OpenAI. */
  llmIgnoredLocalBase?: boolean;
  imageGenConfigured?: boolean;
  searchConfigured: boolean;
  model?: string | null;
  searchProvider?: string | null;
  /** hybrid when chat capability is ready; otherwise deterministic. */
  engine?: "hybrid" | "deterministic";
  capabilities?: {
    chat?: boolean;
    image?: boolean;
    search?: boolean;
  };
};

export function isPasswordRecoveryReady(status: ProviderStatusPayload | null | undefined): boolean {
  return status?.auth?.passwordRecovery === true;
}

export function isGoogleSignInReady(status: ProviderStatusPayload | null | undefined): boolean {
  return status?.auth?.googleSignIn === true;
}

export type CapabilityKind = "chat" | "image" | "search";
/** Local configuration assessment — not a live health probe. */
export type CapabilityAvailability = "configured" | "unavailable" | "notConfigured";

export type CapabilityAssessment = {
  id: CapabilityKind;
  availability: CapabilityAvailability;
  /** Optional detail for the UI (model id, search provider id). */
  detailKey?: "model" | "provider";
  detailValue?: string;
};

/** True when chat is configured and not permanently blocked. */
export function isChatCapabilityReady(status: ProviderStatusPayload): boolean {
  if (typeof status.capabilities?.chat === "boolean") return status.capabilities.chat;
  return status.llmConfigured && !status.llmBlockedReason;
}

/** True when image generation appears configured (independent of chat). */
export function isImageCapabilityReady(status: ProviderStatusPayload): boolean {
  if (typeof status.capabilities?.image === "boolean") return status.capabilities.image;
  return status.imageGenConfigured === true;
}

/** True when a search provider key is configured. */
export function isSearchCapabilityReady(status: ProviderStatusPayload): boolean {
  if (typeof status.capabilities?.search === "boolean") return status.capabilities.search;
  return status.searchConfigured;
}

/**
 * Maps `/api/status` into the three dashboard capability rows.
 * Logo/image never inherits chat configuration.
 * Ready capabilities are labeled `configured`, never “live” or “connected”.
 */
export function assessProviderCapabilities(status: ProviderStatusPayload): CapabilityAssessment[] {
  const chatReady = isChatCapabilityReady(status);
  const imageReady = isImageCapabilityReady(status);
  const searchReady = isSearchCapabilityReady(status);

  const chat: CapabilityAssessment = {
    id: "chat",
    availability: chatReady ? "configured" : status.llmConfigured && status.llmBlockedReason ? "unavailable" : "notConfigured",
  };
  if (chatReady && status.model) {
    chat.detailKey = "model";
    chat.detailValue = status.model;
  }

  const image: CapabilityAssessment = {
    id: "image",
    availability: imageReady ? "configured" : "notConfigured",
  };

  const search: CapabilityAssessment = {
    id: "search",
    availability: searchReady ? "configured" : "notConfigured",
  };
  if (searchReady && status.searchProvider) {
    search.detailKey = "provider";
    search.detailValue = status.searchProvider;
  }

  return [chat, image, search];
}
