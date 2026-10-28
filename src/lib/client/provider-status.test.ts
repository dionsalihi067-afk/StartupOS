import { describe, expect, it } from "vitest";

import {
  assessProviderCapabilities,
  isChatCapabilityReady,
  isImageCapabilityReady,
  isSearchCapabilityReady,
} from "@/lib/client/provider-status";

describe("provider capability honesty", () => {
  it("does not treat chat configuration as image generation", () => {
    const status = {
      llmConfigured: true,
      imageGenConfigured: false,
      searchConfigured: false,
      model: "gemma3:1b",
    };
    expect(isChatCapabilityReady(status)).toBe(true);
    expect(isImageCapabilityReady(status)).toBe(false);
    expect(assessProviderCapabilities(status).find((c) => c.id === "image")?.availability).toBe("notConfigured");
  });

  it("marks chat unavailable when the provider is permanently blocked", () => {
    const status = {
      llmConfigured: true,
      llmBlockedReason: "http-429:billing_not_active",
      imageGenConfigured: true,
      searchConfigured: true,
      searchProvider: "tavily",
      model: "gpt-4o-mini",
    };
    expect(isChatCapabilityReady(status)).toBe(false);
    expect(assessProviderCapabilities(status).find((c) => c.id === "chat")?.availability).toBe("unavailable");
    expect(assessProviderCapabilities(status).find((c) => c.id === "image")?.availability).toBe("configured");
  });

  it("prefers explicit capabilities flags when present", () => {
    const status = {
      llmConfigured: true,
      imageGenConfigured: false,
      searchConfigured: false,
      capabilities: { chat: false, image: true, search: true },
    };
    expect(isChatCapabilityReady(status)).toBe(false);
    expect(isImageCapabilityReady(status)).toBe(true);
    expect(isSearchCapabilityReady(status)).toBe(true);
  });

  it("reports configured chat with model detail when usable (not a live probe)", () => {
    const rows = assessProviderCapabilities({
      llmConfigured: true,
      imageGenConfigured: true,
      searchConfigured: false,
      model: "gpt-4o-mini",
    });
    expect(rows).toEqual([
      { id: "chat", availability: "configured", detailKey: "model", detailValue: "gpt-4o-mini" },
      { id: "image", availability: "configured" },
      { id: "search", availability: "notConfigured" },
    ]);
  });
});
