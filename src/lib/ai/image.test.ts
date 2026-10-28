import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { generateImage } from "@/lib/ai/image";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "sk-testkey1234567890abcdef");
  vi.stubEnv("OLLAMA_API_KEY", "");
  vi.stubEnv("OPENAI_BASE_URL", "https://api.openai.com/v1");
  vi.stubEnv("NODE_ENV", "test");
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("generateImage", () => {
  it("returns validated PNG bytes", async () => {
    const fetchImpl = vi.fn(async () => json({ data: [{ b64_json: PNG.toString("base64") }] }));
    const res = await generateImage({ prompt: "logo" }, fetchImpl as unknown as typeof fetch);
    expect(res).toMatchObject({ ok: true, contentType: "image/png" });
    expect(res.ok && res.bytes.equals(PNG)).toBe(true);
  });

  it("does not call the provider without credentials", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchImpl = vi.fn();
    expect(await generateImage({ prompt: "logo" }, fetchImpl as unknown as typeof fetch)).toMatchObject({ ok: false, reason: "not-configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not treat Ollama as an image provider", async () => {
    vi.stubEnv("OPENAI_API_KEY", "ollama");
    vi.stubEnv("OPENAI_BASE_URL", "http://127.0.0.1:11434/v1");
    vi.stubEnv("NODE_ENV", "development");
    const fetchImpl = vi.fn();
    expect(await generateImage({ prompt: "logo" }, fetchImpl as unknown as typeof fetch)).toMatchObject({ ok: false, reason: "not-configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects responses that are not PNG images", async () => {
    const notPng = Buffer.from("<svg onload=alert(1)>").toString("base64");
    const fetchImpl = vi.fn(async () => json({ data: [{ b64_json: notPng }] }));
    expect(await generateImage({ prompt: "logo" }, fetchImpl as unknown as typeof fetch)).toMatchObject({ ok: false, reason: "invalid-response" });
  });

  it("rejects malformed JSON bodies", async () => {
    const fetchImpl = vi.fn(async () => new Response("not json", { status: 200 }));
    expect(await generateImage({ prompt: "logo" }, fetchImpl as unknown as typeof fetch)).toMatchObject({ ok: false, reason: "invalid-response" });
  });

  it("does not retry client errors", async () => {
    const fetchImpl = vi.fn(async () => json({ error: { message: "bad" } }, 400));
    expect(await generateImage({ prompt: "logo" }, fetchImpl as unknown as typeof fetch)).toMatchObject({
      ok: false,
      reason: "rejected",
      status: 400,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry a spending limit or exhausted quota, which arrive as 429 too", async () => {
    for (const code of ["project_spend_limit_exceeded", "insufficient_quota"]) {
      const fetchImpl = vi.fn(async () => json({ error: { code, message: "limit reached for test-key" } }, 429));
      const res = await generateImage({ prompt: "logo" }, fetchImpl as unknown as typeof fetch);
      expect(res).toMatchObject({ ok: false, reason: "rejected", status: 429 });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("retries a rate limit once", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { code: "rate_limit_exceeded" } }, 429))
      .mockResolvedValueOnce(json({ data: [{ b64_json: PNG.toString("base64") }] }));
    expect((await generateImage({ prompt: "logo" }, fetchImpl as unknown as typeof fetch)).ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries a server error once, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({ data: [{ b64_json: PNG.toString("base64") }] }));
    const res = await generateImage({ prompt: "logo" }, fetchImpl as unknown as typeof fetch);
    expect(res.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reports a timeout without retrying", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    );
    expect(await generateImage({ prompt: "logo", timeoutMs: 20 }, fetchImpl as unknown as typeof fetch)).toMatchObject({
      ok: false,
      reason: "timeout",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("never puts the API key in the result", async () => {
    const fetchImpl = vi.fn(async () => json({}, 401));
    const res = await generateImage({ prompt: "logo" }, fetchImpl as unknown as typeof fetch);
    expect(JSON.stringify(res)).not.toContain("test-key");
  });

  it("sends gpt-image-2.5-sunburst and high quality for premium logos by default", async () => {
    const fetchImpl = vi.fn(async () => json({ data: [{ b64_json: PNG.toString("base64") }] }));
    const res = await generateImage({ prompt: "logo", task: "image-premium" }, fetchImpl as unknown as typeof fetch);
    expect(res).toMatchObject({ ok: true, model: "gpt-image-2.5-sunburst" });
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]?.body));
    expect(body.model).toBe("gpt-image-2.5-sunburst");
    expect(body.quality).toBe("high");
  });

  it("remaps shut-down gpt-image-1 before calling the provider", async () => {
    vi.stubEnv("OPENAI_IMAGE_MODEL", "gpt-image-1");
    const fetchImpl = vi.fn(async () => json({ data: [{ b64_json: PNG.toString("base64") }] }));
    const res = await generateImage({ prompt: "logo" }, fetchImpl as unknown as typeof fetch);
    expect(res.ok && res.model).toBe("gpt-image-2.5-sunburst");
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]?.body));
    expect(body.model).toBe("gpt-image-2.5-sunburst");
  });

  const publicLookup = async () => ({ address: "1.1.1.1", family: 4 });

  it("downloads a HTTPS image URL when b64_json is absent", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/images/generations")) {
        return json({ data: [{ url: "https://cdn.example.com/logo.png" }] });
      }
      expect(init?.redirect).toBe("manual");
      expect(new Headers(init?.headers).get("Authorization")).toBeNull();
      return new Response(PNG, { status: 200, headers: { "Content-Type": "image/png" } });
    });
    const res = await generateImage(
      { prompt: "logo", lookup: publicLookup },
      fetchImpl as unknown as typeof fetch,
    );
    expect(res).toMatchObject({ ok: true, contentType: "image/png" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects HTTPS image URLs that declare oversized Content-Length", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("/images/generations")) {
        return json({ data: [{ url: "https://cdn.example.com/huge.png" }] });
      }
      return new Response(PNG, {
        status: 200,
        headers: { "Content-Type": "image/png", "Content-Length": String(20_000_000) },
      });
    });
    expect(
      await generateImage({ prompt: "logo", lookup: publicLookup }, fetchImpl as unknown as typeof fetch),
    ).toMatchObject({
      ok: false,
      reason: "invalid-response",
    });
  });

  it("rejects provider image URLs that target loopback / metadata hosts", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("/images/generations")) {
        return json({ data: [{ url: "https://127.0.0.1/logo.png" }] });
      }
      throw new Error("should not fetch");
    });
    expect(await generateImage({ prompt: "logo" }, fetchImpl as unknown as typeof fetch)).toMatchObject({
      ok: false,
      reason: "invalid-response",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
