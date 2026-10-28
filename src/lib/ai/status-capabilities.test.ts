import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isImageGenConfigured } from "@/lib/ai/image";
import { isLlmConfigured, resetLlmCircuitBreaker } from "@/lib/ai/client";

beforeEach(() => {
  resetLlmCircuitBreaker();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("chat vs image capability (logo indicator)", () => {
  it("does not treat Ollama chat as image generation", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OLLAMA_API_KEY", "ol-test");
    vi.stubEnv("OPENAI_BASE_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(isLlmConfigured()).toBe(true);
    expect(isImageGenConfigured()).toBe(false);
  });

  it("does not treat local Ollama as image generation", () => {
    vi.stubEnv("OPENAI_API_KEY", "ollama");
    vi.stubEnv("OLLAMA_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "http://127.0.0.1:11434/v1");
    vi.stubEnv("NODE_ENV", "development");
    expect(isLlmConfigured()).toBe(true);
    expect(isImageGenConfigured()).toBe(false);
  });

  it("enables image generation only for non-Ollama OpenAI-compatible chat with a key", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-testkey1234567890abcdef");
    vi.stubEnv("OLLAMA_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "https://api.openai.com/v1");
    vi.stubEnv("NODE_ENV", "test");
    expect(isLlmConfigured()).toBe(true);
    expect(isImageGenConfigured()).toBe(true);
  });

  it("does not enable chat or images when OPENAI_API_KEY is a non-sk placeholder on the OpenAI base", () => {
    vi.stubEnv("OPENAI_API_KEY", "ollama");
    vi.stubEnv("OLLAMA_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "https://api.openai.com/v1");
    vi.stubEnv("NODE_ENV", "test");
    expect(isLlmConfigured()).toBe(false);
    expect(isImageGenConfigured()).toBe(false);
  });
});
