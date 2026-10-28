import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  isLocalOllamaBaseUrl,
  isOllamaBaseUrl,
  looksLikeOpenAiSecret,
  resolveLlmProvider,
} from "@/lib/ai/provider";

/** Partial env bags for resolver tests — cast via unknown so ProcessEnv's required keys are not faked. */
function env(partial: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return partial as unknown as NodeJS.ProcessEnv;
}

/** Fake OpenAI-shaped key (not a real secret). Length satisfies looksLikeOpenAiSecret. */
const FAKE_OPENAI_KEY = "sk-testkey1234567890abcdef";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isLocalOllamaBaseUrl", () => {
  it("detects loopback Ollama ports", () => {
    expect(isLocalOllamaBaseUrl("http://127.0.0.1:11434/v1")).toBe(true);
    expect(isLocalOllamaBaseUrl("http://localhost:11434/v1")).toBe(true);
    expect(isLocalOllamaBaseUrl("https://api.openai.com/v1")).toBe(false);
    expect(isLocalOllamaBaseUrl("https://ollama.com/v1")).toBe(false);
  });
});

describe("isOllamaBaseUrl", () => {
  it("covers cloud and local hosts", () => {
    expect(isOllamaBaseUrl("https://ollama.com/v1")).toBe(true);
    expect(isOllamaBaseUrl("http://127.0.0.1:11434/v1")).toBe(true);
    expect(isOllamaBaseUrl("https://api.openai.com/v1")).toBe(false);
  });
});

describe("looksLikeOpenAiSecret", () => {
  it("accepts sk- keys of sufficient length", () => {
    expect(looksLikeOpenAiSecret(FAKE_OPENAI_KEY)).toBe(true);
    expect(looksLikeOpenAiSecret("sk-short")).toBe(false);
    expect(looksLikeOpenAiSecret("ollama")).toBe(false);
    expect(looksLikeOpenAiSecret("")).toBe(false);
  });
});

describe("resolveLlmProvider", () => {
  it("is not configured with empty env", () => {
    const cfg = resolveLlmProvider(env({}));
    expect(cfg.configured).toBe(false);
    expect(cfg.reason).toBe("not-configured");
    expect(cfg.preference).toBe("auto");
  });

  it("uses OpenAI when only OPENAI_API_KEY is set", () => {
    const cfg = resolveLlmProvider(env({ OPENAI_API_KEY: FAKE_OPENAI_KEY }));
    expect(cfg).toMatchObject({
      configured: true,
      kind: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-6.1-sol",
      apiKey: FAKE_OPENAI_KEY,
      selectionReason: "auto: OPENAI_API_KEY",
    });
  });

  it("prefers OpenAI over local OPENAI_BASE_URL when a real sk- key is set (auto)", () => {
    const cfg = resolveLlmProvider(
      env({
        OPENAI_API_KEY: FAKE_OPENAI_KEY,
        OPENAI_BASE_URL: "http://127.0.0.1:11434/v1",
        OPENAI_MODEL: "gemma3:1b",
        NODE_ENV: "development",
      }),
    );
    expect(cfg.configured).toBe(true);
    expect(cfg.kind).toBe("openai");
    expect(cfg.baseUrl).toBe("https://api.openai.com/v1");
    // Ollama-shaped OPENAI_MODEL must not be sent to api.openai.com.
    expect(cfg.model).toBe("gpt-6.1-sol");
    expect(cfg.ignoredLocalBase).toBe(true);
    expect(cfg.selectionReason).toContain("OpenAI key preferred over local");
  });

  it("keeps an explicit OpenAI model id when preferring OpenAI over local base", () => {
    const cfg = resolveLlmProvider(
      env({
        OPENAI_API_KEY: FAKE_OPENAI_KEY,
        OPENAI_BASE_URL: "http://127.0.0.1:11434/v1",
        OPENAI_MODEL: "gpt-6-astra",
        NODE_ENV: "development",
      }),
    );
    expect(cfg.kind).toBe("openai");
    expect(cfg.model).toBe("gpt-6-astra");
  });

  it("uses local Ollama when LLM_PROVIDER=ollama-local even with a real OpenAI key", () => {
    const cfg = resolveLlmProvider(
      env({
        LLM_PROVIDER: "ollama-local",
        OPENAI_API_KEY: FAKE_OPENAI_KEY,
        OPENAI_BASE_URL: "http://127.0.0.1:11434/v1",
        OPENAI_MODEL: "gemma3:1b",
        NODE_ENV: "development",
      }),
    );
    expect(cfg.kind).toBe("ollama-local");
    expect(cfg.configured).toBe(true);
    expect(cfg.selectionReason).toBe("llm-provider=ollama-local");
  });

  it("requires OpenAI when LLM_PROVIDER=openai and refuses without a real key", () => {
    const cfg = resolveLlmProvider(
      env({
        LLM_PROVIDER: "openai",
        OPENAI_BASE_URL: "http://127.0.0.1:11434/v1",
        OPENAI_API_KEY: "ollama",
        NODE_ENV: "development",
      }),
    );
    expect(cfg.configured).toBe(false);
    expect(cfg.reason).toBe("openai-required");
    expect(cfg.preference).toBe("openai");
  });

  it("uses Ollama Cloud when only OLLAMA_API_KEY is set", () => {
    const cfg = resolveLlmProvider(env({ OLLAMA_API_KEY: "ol_test" }));
    expect(cfg).toMatchObject({
      configured: true,
      kind: "ollama-cloud",
      baseUrl: "https://ollama.com/v1",
      model: "gemma4:31b",
      apiKey: "ol_test",
    });
  });

  it("configures local Ollama without a real key in development", () => {
    const cfg = resolveLlmProvider(
      env({
        OPENAI_BASE_URL: "http://127.0.0.1:11434/v1",
        OPENAI_MODEL: "gemma3:1b",
        NODE_ENV: "development",
      }),
    );
    expect(cfg.configured).toBe(true);
    expect(cfg.kind).toBe("ollama-local");
    expect(cfg.model).toBe("gemma3:1b");
    expect(cfg.defaultTimeoutMs).toBeGreaterThanOrEqual(60_000);
  });

  it("refuses localhost Ollama in production", () => {
    const cfg = resolveLlmProvider(
      env({
        OPENAI_BASE_URL: "http://127.0.0.1:11434/v1",
        OPENAI_API_KEY: "ollama",
        NODE_ENV: "production",
      }),
    );
    expect(cfg.configured).toBe(false);
    expect(cfg.reason).toBe("localhost-in-production");
  });

  it("refuses localhost Ollama on Vercel", () => {
    const cfg = resolveLlmProvider(env({ OPENAI_BASE_URL: "http://localhost:11434/v1", VERCEL: "1" }));
    expect(cfg.configured).toBe(false);
    expect(cfg.reason).toBe("localhost-in-production");
  });

  it("honors explicit Ollama Cloud base URL + key", () => {
    const cfg = resolveLlmProvider(
      env({
        OPENAI_BASE_URL: "https://ollama.com/v1",
        OLLAMA_API_KEY: "ol_cloud",
        OPENAI_MODEL: "gemma4:31b",
      }),
    );
    expect(cfg).toMatchObject({
      configured: true,
      kind: "ollama-cloud",
      apiKey: "ol_cloud",
      model: "gemma4:31b",
    });
  });
});
