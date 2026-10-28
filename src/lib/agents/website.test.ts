import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const llm = vi.hoisted(() => ({
  prompts: [] as { system: string; user: string }[],
  response: null as unknown,
  note: "llm-unavailable" as string | undefined,
}));

vi.mock("@/lib/ai/client", () => ({
  isLlmConfigured: () => false,
  generateJson: vi.fn(async (opts: { system: string; user: string }) => {
    llm.prompts.push({ system: opts.system, user: opts.user });
    return llm.response === null ? { data: null, source: "none", note: llm.note } : { data: llm.response, source: "llm" };
  }),
}));

vi.mock("@/lib/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/search")>()),
  multiSearch: vi.fn(async () => {
    throw new Error("the website agent must not search");
  }),
}));

import { createContext, type GenerationContext } from "@/lib/agents/context";
import { runWebsiteAgent } from "@/lib/agents/website";
import { buildWebsiteSpec } from "@/lib/website/builder";
import { parseWebsiteSpec } from "@/lib/website/model";
import { runResearch } from "@/lib/research/engine";
import type { ResearchRunResult } from "@/lib/research/model";
import { multiSearch } from "@/lib/services/search";
import { makePackage } from "@/test/db";
import { researchRun, sampleInput } from "@/test/research";

const pkg = makePackage();
const input = sampleInput({ offer: { main: "Espresso", others: "Pastries" }, brand: { language: "en" } });
const deterministic = buildWebsiteSpec({ input, brand: pkg.brand, pricing: pkg.pricing });

function context(useLlm: boolean, research?: ResearchRunResult): GenerationContext {
  const ctx = createContext(input, { research, now: new Date("2026-10-08T13:00:00.000Z") });
  ctx.useLlm = useLlm;
  return ctx;
}

beforeEach(() => {
  llm.prompts.length = 0;
  llm.response = null;
  llm.note = "llm-unavailable";
  vi.mocked(multiSearch).mockClear();
});

describe("website agent", () => {
  it("builds the deterministic website without a model", async () => {
    const out = await runWebsiteAgent(context(false), pkg.brand, pkg.pricing);
    expect(out.source).toBe("deterministic");
    expect(out.data.spec).toEqual(deterministic);
    expect(out.data.pages.map((p) => p.slug)).toEqual(deterministic.pages.map((p) => p.slug));
    expect(llm.prompts).toHaveLength(0);
  });

  it("falls back to the deterministic website when the model fails or times out", async () => {
    llm.note = "llm-timeout";
    const out = await runWebsiteAgent(context(true), pkg.brand, pkg.pricing);
    expect(out).toMatchObject({ source: "deterministic", note: "llm-timeout" });
    expect(out.data.spec).toEqual(deterministic);
  });

  it("falls back to the deterministic website when the model output is malformed", async () => {
    for (const response of ["<html>", 42, [1, 2], { hero: "not an object" }, { faq: [{ question: 1 }] }]) {
      llm.response = response;
      llm.note = undefined;
      const out = await runWebsiteAgent(context(true), pkg.brand, pkg.pricing);
      expect(out.source).toBe("deterministic");
      expect(out.note).toBe("llm-invalid-output");
      expect(out.data.spec).toEqual(deterministic);
    }
  });

  it("applies valid model copy inside the deterministic structure", async () => {
    llm.response = {
      hero: { heading: "Coffee for focused mornings" },
      pages: [{ slug: "/", seoDescription: "Espresso and pastries for remote workers." }],
      html: "<script>alert(1)</script>",
      pagesToAdd: [{ slug: "https://evil.example" }],
    };
    const out = await runWebsiteAgent(context(true), pkg.brand, pkg.pricing);
    expect(out.source).toBe("llm");
    expect(parseWebsiteSpec(out.data.spec)).toEqual(out.data.spec);
    expect(out.data.spec.pages.map((p) => p.slug)).toEqual(deterministic.pages.map((p) => p.slug));
    expect(out.data.spec.pages[0]!.sections[0]).toMatchObject({ type: "hero", heading: "Coffee for focused mornings" });
    expect(JSON.stringify(out.data)).not.toMatch(/<script|evil\.example/);
  });

  it("makes one model call that asks for copy only and carries the business context", async () => {
    await runWebsiteAgent(context(true), pkg.brand, pkg.pricing);
    expect(llm.prompts).toHaveLength(1);
    const { system, user } = llm.prompts[0]!;
    expect(system).toMatch(/Never invent reviews, testimonials, statistics/);
    expect(user).toMatch(/Write all customer-facing text in English/);
    expect(user).toContain("Kafeja");
    expect(user).toContain("Espresso | Pastries");
    expect(user).toContain("/menu");
  });

  it("requests bilingual copy when discovery language is both", async () => {
    const bothInput = sampleInput({ offer: { main: "Espresso" }, brand: { language: "both" } });
    const ctx = createContext(bothInput, { now: new Date("2026-10-08T13:00:00.000Z") });
    ctx.useLlm = true;
    await runWebsiteAgent(ctx, pkg.brand, pkg.pricing);
    expect(llm.prompts[0]!.user).toMatch(/both Albanian and English/i);
  });

  it("uses only its research projection and never searches", async () => {
    await runWebsiteAgent(context(true, await researchRun()), pkg.brand, pkg.pricing);
    const prompt = llm.prompts[0]!.user;
    expect(prompt).toContain("RESEARCH CONTEXT");
    expect(prompt).toContain("customerNeeds signal");
    expect(prompt).not.toContain("pricing signal");
    expect(multiSearch).not.toHaveBeenCalled();
  });

  it("still builds a website when research failed", async () => {
    const out = await runWebsiteAgent(context(true, await runResearch(input, null)), pkg.brand, pkg.pricing);
    expect(out.data.spec).toEqual(deterministic);
    expect(llm.prompts[0]!.user).toContain("Status: failed");
    expect(multiSearch).not.toHaveBeenCalled();
  });
});
