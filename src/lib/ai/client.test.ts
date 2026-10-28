import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { generateJson, getLlmProviderHealth, readLlmUsage, resetLlmCircuitBreaker } from "@/lib/ai/client";

const KEY = "sk-test-not-a-real-key-1234";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function completion(content: string, finish = "stop", usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }): Response {
  return json(200, {
    choices: [{ message: { content }, finish_reason: finish }],
    ...(usage ? { usage } : {}),
  });
}

function fakeFetch(...responses: (Response | Error)[]) {
  return vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra request");
    if (next instanceof Error) throw next;
    return next;
  });
}

const opts = { system: "s", user: "u" };

beforeEach(() => {
  resetLlmCircuitBreaker();
  vi.stubEnv("OPENAI_API_KEY", KEY);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function run(fetchImpl: ReturnType<typeof fakeFetch>) {
  const pending = generateJson(opts, fetchImpl as unknown as typeof fetch);
  await vi.runAllTimersAsync();
  return pending;
}

describe("readLlmUsage", () => {
  it("returns usage only when all token fields are finite non-negative numbers", () => {
    expect(readLlmUsage({ usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
    expect(readLlmUsage({ usage: { prompt_tokens: 10, completion_tokens: "5", total_tokens: 15 } })).toBeUndefined();
    expect(readLlmUsage({})).toBeUndefined();
  });
});

describe("generateJson", () => {
  it("parses a valid JSON answer", async () => {
    const f = fakeFetch(completion('{"a":1}'));
    expect(await run(f)).toMatchObject({ data: { a: 1 }, source: "llm" });
  });

  it("forwards provider usage metadata when present and never invents it", async () => {
    const withUsage = fakeFetch(completion('{"a":1}', "stop", { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 }));
    const used = await run(withUsage);
    expect(used).toMatchObject({
      data: { a: 1 },
      source: "llm",
      usage: { promptTokens: 12, completionTokens: 4, totalTokens: 16 },
    });
    expect(used.selection?.modelId).toBeTruthy();
    expect(used.costEstimate?.estimated).toBe(true);
    expect(typeof used.costEstimate?.usd).toBe("number");
    const without = fakeFetch(completion('{"a":1}'));
    const bare = await run(without);
    expect(bare).toMatchObject({ data: { a: 1 }, source: "llm" });
    expect(bare.costEstimate).toBeUndefined();
  });

  it("sends Astra + reasoning_effort for quality-routed reasoning tasks", async () => {
    vi.stubEnv("OPENAI_MODEL", "gpt-4o-mini");
    const f = fakeFetch(completion('{"ok":true}'));
    const pending = generateJson({ ...opts, task: "reasoning" }, f as unknown as typeof fetch);
    await vi.runAllTimersAsync();
    const res = await pending;
    expect(res).toMatchObject({ data: { ok: true }, source: "llm" });
    expect(res.selection?.modelId).toBe("gpt-6-astra");
    expect(res.selection?.reasoningEffort).toBe("high");
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1]?.body));
    expect(body.model).toBe("gpt-6-astra");
    expect(body.reasoning_effort).toBe("high");
    expect(body.temperature).toBeUndefined();
    expect(body.max_completion_tokens).toBeGreaterThanOrEqual(8_000);
    expect(body.max_tokens).toBeUndefined();
  });

  it("omits temperature on Luna and uses max_completion_tokens", async () => {
    vi.stubEnv("OPENAI_MODEL", "gpt-4o-mini");
    const f = fakeFetch(completion('{"ok":true}'));
    const pending = generateJson({ ...opts, task: "structured" }, f as unknown as typeof fetch);
    await vi.runAllTimersAsync();
    const res = await pending;
    expect(res.selection?.modelId).toBe("gpt-6-luna");
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1]?.body));
    expect(body.reasoning_effort).toBe("none");
    expect(body.temperature).toBeUndefined();
    expect(body.max_completion_tokens).toBeTypeOf("number");
    expect(body.max_tokens).toBeUndefined();
  });

  it("keeps OPENAI_MODEL in single compatibility mode", async () => {
    vi.stubEnv("OPENAI_MODEL_ROUTING", "single");
    vi.stubEnv("OPENAI_MODEL", "gpt-4o-mini");
    const f = fakeFetch(completion('{"ok":true}'));
    const pending = generateJson({ ...opts, task: "reasoning" }, f as unknown as typeof fetch);
    await vi.runAllTimersAsync();
    const res = await pending;
    expect(res.selection?.modelId).toBe("gpt-4o-mini");
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1]?.body));
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBeTypeOf("number");
    expect(body.max_completion_tokens).toBeUndefined();
  });

  it("does not retry a spending limit and reports its code without the provider message", async () => {
    const f = fakeFetch(json(429, { error: { code: "project_spend_limit_exceeded", message: `Key ${KEY} is over its limit` } }));
    const res = await run(f);
    expect(f).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ data: null, source: "none", note: "llm-unavailable:http-429:project_spend_limit_exceeded" });
    expect(JSON.stringify(res)).not.toContain(KEY);
  });

  it("does not retry an invalid key", async () => {
    const f = fakeFetch(json(401, { error: { code: "invalid_api_key" } }));
    expect((await run(f)).note).toBe("llm-unavailable:http-401:invalid_api_key");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("opens the circuit after a permanent billing failure so later agents skip the provider", async () => {
    const billing = json(429, { error: { code: "billing_not_active" } });
    const f = fakeFetch(billing, json(429, { error: { code: "billing_not_active" } }), json(429, { error: { code: "billing_not_active" } }));
    expect((await run(f)).note).toBe("llm-unavailable:http-429:billing_not_active");
    expect(getLlmProviderHealth().blockedReason).toBe("http-429:billing_not_active");
    // Subsequent calls report the same reason without touching the provider again.
    expect((await run(f)).note).toBe("llm-unavailable:http-429:billing_not_active");
    expect((await run(f)).note).toBe("llm-unavailable:http-429:billing_not_active");
    expect(f).toHaveBeenCalledTimes(1);
    resetLlmCircuitBreaker();
    expect(getLlmProviderHealth().blockedReason).toBeNull();
  });

  it("does not open the circuit for transient rate limits", async () => {
    const f = fakeFetch(
      json(429, { error: { code: "rate_limit_exceeded" } }),
      json(429, { error: { code: "rate_limit_exceeded" } }),
      json(429, { error: { code: "rate_limit_exceeded" } }),
    );
    await run(f);
    expect(getLlmProviderHealth().blockedReason).toBeNull();
  });

  it("retries rate limits and server errors a bounded number of times", async () => {
    const recovered = fakeFetch(json(429, { error: { code: "rate_limit_exceeded" } }), json(503, {}), completion('{"ok":true}'));
    expect((await run(recovered)).data).toEqual({ ok: true });
    expect(recovered).toHaveBeenCalledTimes(3);

    const down = fakeFetch(json(500, {}), json(500, {}), json(500, {}));
    expect((await run(down)).note).toBe("llm-unavailable:http-500");
    expect(down).toHaveBeenCalledTimes(3);
  });

  it("does not retry a timeout", async () => {
    const f = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    const pending = generateJson({ ...opts, timeoutMs: 1000 }, f as unknown as typeof fetch);
    await vi.runAllTimersAsync();
    expect((await pending).note).toBe("llm-unavailable:timeout");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("rejects output cut off at the token limit even when it can be repaired", async () => {
    const f = fakeFetch(completion('{"phases":[{"title":"A"}]}', "length"));
    expect(await run(f)).toMatchObject({ data: null, source: "none", note: "llm-truncated" });
  });

  it("reports unparseable text", async () => {
    const f = fakeFetch(completion("Sorry, I cannot help with that."));
    expect((await run(f)).note).toBe("llm-unparseable");
  });

  it("accepts markdown-fenced JSON and prose-wrapped objects", async () => {
    const fenced = fakeFetch(completion('```json\n{"ok":true,"n":1}\n```'));
    expect(await run(fenced)).toMatchObject({ data: { ok: true, n: 1 }, source: "llm" });

    const wrapped = fakeFetch(completion('Here is the plan:\n{"ok":true}\nEnd.'));
    expect(await run(wrapped)).toMatchObject({ data: { ok: true }, source: "llm" });
  });

  it("rejects empty content, primitives, arrays, and null as unusable agent payloads", async () => {
    expect((await run(fakeFetch(completion("")))).note).toBe("llm-unavailable:empty-response");
    expect((await run(fakeFetch(completion("   \n")))).note).toBe("llm-unavailable:empty-response");
    expect((await run(fakeFetch(completion("42")))).note).toBe("llm-unparseable");
    expect((await run(fakeFetch(completion('"just a string"')))).note).toBe("llm-unparseable");
    expect((await run(fakeFetch(completion("[1,2,3]")))).note).toBe("llm-unparseable");
    expect((await run(fakeFetch(completion("null")))).note).toBe("llm-unparseable");
  });

  it("does not treat optional-field-only objects as parse failures", async () => {
    const f = fakeFetch(completion("{}"));
    expect(await run(f)).toMatchObject({ data: {}, source: "llm" });
  });

  it("rejects JSON that fails an optional Zod schema", async () => {
    const { z } = await import("zod");
    const schema = z.object({ ok: z.literal(true) });

    const okFetch = fakeFetch(completion('{"ok":true}'));
    const okPending = generateJson({ ...opts, schema }, okFetch as unknown as typeof fetch);
    await vi.runAllTimersAsync();
    expect(await okPending).toMatchObject({ data: { ok: true }, source: "llm" });

    const badFetch = fakeFetch(completion('{"ok":false}'));
    const badPending = generateJson({ ...opts, schema }, badFetch as unknown as typeof fetch);
    await vi.runAllTimersAsync();
    expect(await badPending).toMatchObject({ data: null, source: "none", note: "llm-invalid-schema" });
  });

  it("makes no request without a key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OLLAMA_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "");
    const f = fakeFetch();
    expect((await run(f)).note).toBe("llm-unavailable:not-configured");
    expect(f).not.toHaveBeenCalled();
  });

  it("calls local Ollama without OPENAI_API_KEY", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OLLAMA_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "http://127.0.0.1:11434/v1");
    vi.stubEnv("OPENAI_MODEL", "gemma3:1b");
    vi.stubEnv("NODE_ENV", "development");
    const f = fakeFetch(completion('{"ok":true}'));
    expect(await run(f)).toMatchObject({ data: { ok: true }, source: "llm" });
    expect(f).toHaveBeenCalledTimes(1);
    const first = f.mock.calls[0] as unknown as [string, RequestInit?];
    expect(String(first[0])).toContain("127.0.0.1:11434/v1/chat/completions");
  });

  it("does not shorten local Ollama timeouts below the provider default", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OLLAMA_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "http://127.0.0.1:11434/v1");
    vi.stubEnv("OPENAI_MODEL", "gemma3:1b");
    vi.stubEnv("NODE_ENV", "development");
    const f = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    // Agent-style 60s request must still wait the local default (120s).
    const pending = generateJson({ ...opts, timeoutMs: 60_000 }, f as unknown as typeof fetch);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await pending).note).toBe("llm-unavailable:timeout");
    expect(settled).toBe(true);
  });

  it("opens the circuit after consecutive local timeouts so later agents fail fast", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OLLAMA_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "http://127.0.0.1:11434/v1");
    vi.stubEnv("OPENAI_MODEL", "gemma3:1b");
    vi.stubEnv("NODE_ENV", "development");
    const hang = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    const first = generateJson({ ...opts, timeoutMs: 1000 }, hang as unknown as typeof fetch);
    await vi.runAllTimersAsync();
    expect((await first).note).toBe("llm-unavailable:timeout");
    expect(getLlmProviderHealth().blockedReason).toBeNull();

    const second = generateJson({ ...opts, timeoutMs: 1000 }, hang as unknown as typeof fetch);
    await vi.runAllTimersAsync();
    expect((await second).note).toBe("llm-unavailable:timeout");
    expect(getLlmProviderHealth().blockedReason).toBe("timeout");

    const thirdFetch = fakeFetch(completion('{"ok":true}'));
    expect((await run(thirdFetch)).note).toBe("llm-unavailable:timeout");
    expect(thirdFetch).not.toHaveBeenCalled();
  });

  it("does not call localhost Ollama when NODE_ENV is production", async () => {
    vi.stubEnv("OPENAI_API_KEY", "ollama");
    vi.stubEnv("OPENAI_BASE_URL", "http://127.0.0.1:11434/v1");
    vi.stubEnv("NODE_ENV", "production");
    const f = fakeFetch();
    expect((await run(f)).note).toBe("llm-unavailable:localhost-in-production");
    expect(f).not.toHaveBeenCalled();
  });

  it("uses Ollama Cloud when OLLAMA_API_KEY is set", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OLLAMA_API_KEY", "ol-test-key");
    vi.stubEnv("OPENAI_BASE_URL", "");
    const f = fakeFetch(completion('{"ok":true}'));
    expect(await run(f)).toMatchObject({ data: { ok: true }, source: "llm" });
    expect(f).toHaveBeenCalledTimes(1);
    const first = f.mock.calls[0] as unknown as [string, RequestInit?];
    expect(String(first[0])).toContain("ollama.com/v1/chat/completions");
    const headers = first[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer ol-test-key");
  });
});
