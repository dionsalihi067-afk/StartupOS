import { getLlmProviderHealth } from "@/lib/ai/client";
import { isImageGenConfigured, selectImageModel } from "@/lib/ai/image";
import { resolveChatModelForTask, routingMode, type AiTaskCategory } from "@/lib/ai/routing";
import { authCapabilityFlags } from "@/lib/auth/providers";
import { getSearchProvider } from "@/lib/services/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAT_TASKS = ["reasoning", "research", "creative", "website", "structured"] as const satisfies readonly Exclude<
  AiTaskCategory,
  "image-premium" | "image-draft"
>[];

/** Reports engine capabilities to the client (no secrets are exposed). */
export async function GET() {
  const health = getLlmProviderHealth();
  const searchProvider = getSearchProvider();
  // Image capability is independent of chat: an Ollama/OpenAI-compatible chat
  // key does not imply /images/generations is available.
  const imageGenConfigured = isImageGenConfigured();
  const imageSelection = selectImageModel("image-premium");
  const draftSelection = selectImageModel("image-draft");
  const taskModels = Object.fromEntries(
    CHAT_TASKS.map((task) => [task, resolveChatModelForTask(task).modelId]),
  ) as Record<(typeof CHAT_TASKS)[number], string>;

  const auth = authCapabilityFlags();

  return Response.json({
    auth,
    llmConfigured: health.configured,
    // Sanitized permanent provider failure (e.g. inactive billing), when known.
    // Lets users and operators distinguish "AI off" from "AI rejected" without logs.
    llmBlockedReason: health.blockedReason,
    llmProvider: health.kind,
    llmConfigReason: health.configReason,
    llmPreference: health.preference,
    llmSelectionReason: health.selectionReason,
    llmIgnoredLocalBase: health.ignoredLocalBase,
    /** Configured default chat model (OPENAI_MODEL); quality mode still routes per task. */
    model: health.model,
    /** single = configured chat model for all tasks; quality = OpenAI task routing (default). */
    modelRouting: routingMode(),
    /** Per-task model IDs under the current routing mode (no secrets). */
    taskModels,
    imageGenConfigured,
    imageModel: imageGenConfigured ? imageSelection.modelId : null,
    imageDraftModel: imageGenConfigured ? draftSelection.modelId : null,
    imageRemappedFrom: imageSelection.remappedFromShutDown ?? null,
    searchConfigured: searchProvider !== null,
    searchProvider,
    // Configuration presence only — not proof that a live request would succeed.
    capabilities: {
      chat: health.configured && !health.blockedReason,
      image: imageGenConfigured,
      search: searchProvider !== null,
    },
    providerStatusNote:
      "Flags reflect configuration and known permanent blocks, not a live provider health probe. OpenAI is primary when a real OPENAI_API_KEY (sk-…) is set.",
    engine: health.configured && !health.blockedReason ? "hybrid" : "deterministic",
  });
}
