import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { estimateChatCostUsd, isImageModelShutDown, isGpt6ChatModel } from "@/lib/ai/models";
import {
  lunaAllowedForTask,
  qualityFallbackModel,
  qualityPrimaryModel,
  resolveChatModelForTask,
  resolveImageModelForTask,
  resolveReasoningEffort,
  routingMode,
} from "@/lib/ai/routing";
import type { LlmProviderConfig } from "@/lib/ai/provider";

function openaiProvider(model = "gpt-6.1-sol"): LlmProviderConfig {
  return {
    configured: true,
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-testkey1234567890abcdef",
    model,
    kind: "openai",
    defaultTimeoutMs: 45_000,
    selectionReason: "test",
    preference: "auto",
  };
}

function ollamaCloud(model = "gemma4:31b"): LlmProviderConfig {
  return {
    configured: true,
    baseUrl: "https://ollama.com/v1",
    apiKey: "ol_test",
    model,
    kind: "ollama-cloud",
    defaultTimeoutMs: 45_000,
    selectionReason: "test",
    preference: "auto",
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("routingMode", () => {
  it("defaults to quality-first", () => {
    expect(routingMode({})).toBe("quality");
    expect(routingMode({ OPENAI_MODEL_ROUTING: "quality" })).toBe("quality");
    expect(routingMode({ OPENAI_MODEL_ROUTING: "task" })).toBe("quality");
  });

  it("retains single/legacy compatibility mode", () => {
    expect(routingMode({ OPENAI_MODEL_ROUTING: "single" })).toBe("single");
    expect(routingMode({ OPENAI_MODEL_ROUTING: "legacy" })).toBe("single");
  });
});

describe("resolveChatModelForTask", () => {
  it("keeps the configured model in single mode", () => {
    const sel = resolveChatModelForTask("reasoning", {
      provider: openaiProvider("gpt-4o-mini"),
      env: { OPENAI_MODEL_ROUTING: "single" },
    });
    expect(sel).toMatchObject({
      modelId: "gpt-4o-mini",
      routed: false,
      reason: "configured-model-single-mode",
    });
    expect(sel.reasoningEffort).toBeUndefined();
  });

  it("routes OpenAI reasoning to gpt-6-astra with high reasoning effort", () => {
    const sel = resolveChatModelForTask("reasoning", {
      provider: openaiProvider("gpt-4o-mini"),
      env: {},
    });
    expect(sel.modelId).toBe("gpt-6-astra");
    expect(sel.modelId).toBe(qualityPrimaryModel("reasoning"));
    expect(qualityFallbackModel("reasoning")).toBe("gpt-6.1-sol");
    expect(sel.routed).toBe(true);
    expect(sel.reason).toContain("quality-route:reasoning");
    expect(sel.reasoningEffort).toBe("high");
  });

  it("does not pin reasoning onto Sol when OPENAI_MODEL is the quality fallback", () => {
    // Remapped defaults often land on gpt-6.1-sol; reasoning must still use Astra.
    const sel = resolveChatModelForTask("reasoning", {
      provider: openaiProvider("gpt-6.1-sol"),
      env: {},
    });
    expect(sel.modelId).toBe("gpt-6-astra");
    expect(sel.routed).toBe(true);
    expect(sel.reason).toContain("quality-route:reasoning");
  });

  it("keeps Sol when it is already the quality primary for the task", () => {
    const sel = resolveChatModelForTask("research", {
      provider: openaiProvider("gpt-6.1-sol"),
      env: {},
    });
    expect(sel.modelId).toBe("gpt-6.1-sol");
    expect(sel.routed).toBe(false);
    expect(sel.reason).toBe("configured-model-matches-quality-primary");
  });

  it("routes research/creative/website to gpt-6.1-sol", () => {
    for (const task of ["research", "creative", "website"] as const) {
      const sel = resolveChatModelForTask(task, {
        provider: openaiProvider("gpt-4o-mini"),
        env: {},
      });
      expect(sel.modelId).toBe("gpt-6.1-sol");
      expect(qualityFallbackModel(task)).toBe("gpt-6-astra");
      expect(sel.reasoningEffort).toBe("medium");
      expect(lunaAllowedForTask(task)).toBe(false);
    }
  });

  it("routes structured (constrained) work to gpt-6-luna with none effort", () => {
    const sel = resolveChatModelForTask("structured", {
      provider: openaiProvider("gpt-4o-mini"),
      env: {},
    });
    expect(sel.modelId).toBe("gpt-6-luna");
    expect(qualityFallbackModel("structured")).toBe("gpt-6.1-sol");
    expect(sel.reasoningEffort).toBe("none");
    expect(lunaAllowedForTask("structured")).toBe(true);
  });

  it("never uses Luna as quality primary for complex tasks", () => {
    for (const task of ["reasoning", "research", "creative", "website"] as const) {
      expect(qualityPrimaryModel(task)).not.toBe("gpt-6-luna");
      expect(lunaAllowedForTask(task)).toBe(false);
    }
  });

  it("does not substitute OpenAI models when chat is Ollama Cloud", () => {
    const sel = resolveChatModelForTask("reasoning", {
      provider: ollamaCloud(),
      env: {},
    });
    expect(sel.modelId).toBe("gemma4:31b");
    expect(sel.routed).toBe(false);
    expect(sel.reason).toContain("ollama-cloud");
    expect(sel.reasoningEffort).toBeUndefined();
  });

  it("honors per-task env overrides over quality routing", () => {
    const sel = resolveChatModelForTask("creative", {
      provider: openaiProvider(),
      env: { OPENAI_MODEL_CREATIVE: "gpt-6-astra" },
    });
    expect(sel).toMatchObject({
      modelId: "gpt-6-astra",
      reason: "env:OPENAI_MODEL_CREATIVE",
      routed: true,
      reasoningEffort: "medium",
    });
  });

  it("never uses an image model as a chat fallback", () => {
    for (const task of ["reasoning", "research", "creative", "website", "structured"] as const) {
      const sel = resolveChatModelForTask(task, {
        provider: openaiProvider(),
        env: {},
      });
      expect(sel.modelId).not.toMatch(/image/i);
    }
  });

  it("does not silently downgrade complex tasks to Luna via fallback IDs", () => {
    expect(qualityFallbackModel("reasoning")).not.toBe("gpt-6-luna");
    expect(qualityFallbackModel("research")).not.toBe("gpt-6-luna");
    expect(qualityFallbackModel("website")).not.toBe("gpt-6-luna");
  });
});

describe("resolveReasoningEffort", () => {
  it("omits effort for legacy models", () => {
    expect(resolveReasoningEffort("gpt-4o-mini", "reasoning")).toBeUndefined();
    expect(isGpt6ChatModel("gpt-4.1")).toBe(false);
  });

  it("maps structured none away from Astra/Sol", () => {
    expect(resolveReasoningEffort("gpt-6-astra", "structured")).toBe("low");
    expect(resolveReasoningEffort("gpt-6.1-sol", "structured")).toBe("low");
    expect(resolveReasoningEffort("gpt-6-luna", "structured")).toBe("none");
  });

  it("omits reasoning_effort for uncatalogued GPT-6-like IDs", () => {
    expect(resolveReasoningEffort("gpt-6.2-nova", "structured")).toBeUndefined();
    expect(resolveReasoningEffort("gpt-6.2-nova", "reasoning")).toBeUndefined();
  });
});

describe("resolveImageModelForTask", () => {
  it("defaults premium logos to gpt-image-2.5-sunburst with high quality", () => {
    const sel = resolveImageModelForTask("image-premium", {});
    expect(sel).toMatchObject({
      modelId: "gpt-image-2.5-sunburst",
      quality: "high",
      reason: "default-premium-sunburst",
    });
  });

  it("remaps shut-down gpt-image-1 to Sunburst", () => {
    expect(isImageModelShutDown("gpt-image-1")).toBe(true);
    const sel = resolveImageModelForTask("image-premium", { OPENAI_IMAGE_MODEL: "gpt-image-1" });
    expect(sel.modelId).toBe("gpt-image-2.5-sunburst");
    expect(sel.remappedFromShutDown).toBe("gpt-image-1");
    expect(sel.reason).toContain("remapped-shut-down");
  });

  it("uses Flare for drafts when no draft override is set", () => {
    const sel = resolveImageModelForTask("image-draft", {});
    expect(sel).toMatchObject({ modelId: "gpt-image-2.5-flare", quality: "medium" });
  });

  it("does not let OPENAI_IMAGE_MODEL force drafts onto Sunburst", () => {
    const sel = resolveImageModelForTask("image-draft", {
      OPENAI_IMAGE_MODEL: "gpt-image-2.5-sunburst",
    });
    expect(sel.modelId).toBe("gpt-image-2.5-flare");
    expect(sel.quality).toBe("medium");
  });
});

describe("estimateChatCostUsd", () => {
  it("estimates frontier Sol pricing and never invents usage", () => {
    const est = estimateChatCostUsd("gpt-6.1-sol", { promptTokens: 1_000_000, completionTokens: 1_000_000 });
    expect(est).toMatchObject({ usd: 2 + 10, estimated: true, modelId: "gpt-6.1-sol" });
    expect(estimateChatCostUsd("unknown-model", { promptTokens: 10, completionTokens: 10 })).toBeNull();
  });

  it("estimates Astra and Luna from documented prices", () => {
    expect(estimateChatCostUsd("gpt-6-astra", { promptTokens: 1_000_000, completionTokens: 0 })?.usd).toBe(10);
    expect(estimateChatCostUsd("gpt-6-luna", { promptTokens: 1_000_000, completionTokens: 1_000_000 })?.usd).toBe(0.1 + 0.5);
  });

  it("prices cached input cheaper when cachedTokens are reported", () => {
    const est = estimateChatCostUsd("gpt-6.1-sol", {
      promptTokens: 1_000_000,
      completionTokens: 0,
      cachedTokens: 500_000,
    });
    // 500k fresh @ $2 + 500k cached @ $0.10 = 1.0 + 0.05
    expect(est?.usd).toBeCloseTo(1.05, 6);
  });
});
