import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const image = vi.hoisted(() => ({ results: [] as unknown[] }));

vi.mock("@/lib/ai/image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/image")>()),
  generateImage: vi.fn(async () => image.results.shift()),
}));

import { createContext, type GenerationContext, type StoredAssetInput } from "@/lib/agents/context";
import { runLogoAgent } from "@/lib/agents/logo";
import { generateImage } from "@/lib/ai/image";
import type { Brand } from "@/lib/types";
import { makePackage } from "@/test/db";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const ok = { ok: true, bytes: PNG, contentType: "image/png", model: "gpt-image-1" };

const brand: Brand = { ...makePackage().brand, name: "Lume" };

function context(store?: (a: StoredAssetInput) => Promise<string>): GenerationContext {
  return createContext(
    { idea: "Skincare brand", audience: "Adults", location: "Kosovo", budget: "€8,000", style: "Modern / Minimal" },
    store ? { storeAsset: store } : {},
  );
}

const FAKE_OPENAI_KEY = "sk-testkey1234567890abcdef";
const originalKey = process.env.OPENAI_API_KEY;
const originalBase = process.env.OPENAI_BASE_URL;
beforeEach(() => {
  process.env.OPENAI_API_KEY = FAKE_OPENAI_KEY;
  // Ensure image capability resolves to OpenAI, not a leftover local base from the host env.
  delete process.env.OPENAI_BASE_URL;
  image.results = [];
  vi.mocked(generateImage).mockClear();
});
afterEach(() => {
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  if (originalBase === undefined) delete process.env.OPENAI_BASE_URL;
  else process.env.OPENAI_BASE_URL = originalBase;
});

describe("logo agent", () => {
  it("stores both images and returns their served URLs", async () => {
    image.results = [ok, ok];
    const stored: StoredAssetInput[] = [];
    const out = await runLogoAgent(
      context(async (a) => {
        stored.push(a);
        return `/api/assets/ast_${String(stored.length).padStart(32, "0")}`;
      }),
      brand,
    );
    expect(out.source).toBe("llm");
    expect(out.note).toBeUndefined();
    expect(out.data).toMatchObject({ generated: true, status: "generated", model: "gpt-image-1" });
    expect(out.data.imageUrl).toMatch(/^\/api\/assets\/ast_/);
    expect(out.data.iconUrl).toMatch(/^\/api\/assets\/ast_/);
    expect(stored.map((s) => s.kind).sort()).toEqual(["icon", "logo"]);
    expect(stored.every((s) => s.bytes.equals(PNG))).toBe(true);
  });

  it("reports missing credentials without calling the provider", async () => {
    delete process.env.OPENAI_API_KEY;
    const out = await runLogoAgent(context(async () => "/api/assets/x"), brand);
    expect(out.data).toMatchObject({ generated: false, status: "unavailable", imageUrl: "" });
    expect(out.note).toBe("image-gen-not-configured");
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("never claims a logo without somewhere durable to store it", async () => {
    const out = await runLogoAgent(context(), brand);
    expect(out.data).toMatchObject({ generated: false, status: "error" });
    expect(out.note).toBe("image-storage-unavailable");
    expect(generateImage).not.toHaveBeenCalled();
  });

  it.each([
    [{ ok: false, reason: "provider-error", status: 500 }, "image-provider-error-500"],
    [{ ok: false, reason: "timeout" }, "image-timeout"],
    [{ ok: false, reason: "invalid-response" }, "image-invalid-response"],
    [{ ok: false, reason: "rate-limited", status: 429 }, "image-rate-limited-429"],
  ])("reports provider failure %o as %s", async (failure, note) => {
    image.results = [failure, failure];
    const out = await runLogoAgent(context(async () => "/api/assets/x"), brand);
    expect(out.data).toMatchObject({ generated: false, status: "error", imageUrl: "", iconUrl: "" });
    expect(out.note).toBe(note);
  });

  it("reports a storage failure instead of returning an unsaved image", async () => {
    image.results = [ok, ok];
    const out = await runLogoAgent(
      context(async () => {
        throw new Error("db down");
      }),
      brand,
    );
    expect(out.data).toMatchObject({ generated: false, status: "error" });
    expect(out.note).toBe("image-storage-failed");
  });

  it("uses one stored image for both when the other fails, and notes the partial result", async () => {
    image.results = [{ ok: false, reason: "timeout" }, ok];
    const out = await runLogoAgent(context(async () => "/api/assets/ast_00000000000000000000000000000001"), brand);
    expect(out.data.generated).toBe(true);
    expect(out.data.imageUrl).toBe(out.data.iconUrl);
    expect(out.note).toBe("partial:image-timeout");
  });
});
