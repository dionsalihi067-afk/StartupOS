import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/client", () => ({ generateJson: vi.fn(), isLlmConfigured: () => false }));

import { createContext } from "@/lib/agents/context";
import { runBrandAgent } from "@/lib/agents/brand";
import { runMarketingAgent } from "@/lib/agents/marketing";
import { runEmailAgent } from "@/lib/agents/email";
import { runDesignAgent } from "@/lib/agents/design";
import { midSentence } from "@/lib/utils";
import { makePackage } from "@/test/db";

const pkg = makePackage();
const input = {
  ...pkg.input,
  idea: "Small-batch natural soap and skincare made in Prishtina, sold online",
  audience: "Women 25-40 in Kosovo who prefer natural skincare",
  location: "Prishtina, Kosovo",
  style: "Organic / Natural" as const,
};

describe("midSentence", () => {
  it("lowercases only a leading capital so proper nouns survive", () => {
    expect(midSentence("Women 25-40 in Kosovo")).toBe("women 25-40 in Kosovo");
    expect(midSentence("SMEs in Tirana")).toBe("SMEs in Tirana");
    expect(midSentence("B2B buyers")).toBe("B2B buyers");
    expect(midSentence("  Families ")).toBe("families");
  });
});

describe("template copy used when the AI provider is unavailable", () => {
  it("keeps the owner's proper nouns and reads as grammatical sentences", async () => {
    const ctx = createContext(input);
    const brand = await runBrandAgent(ctx);
    const marketing = await runMarketingAgent(ctx, { ...pkg.brand, ...brand.data }, pkg.persona);
    const email = await runEmailAgent(ctx, { ...pkg.brand, ...brand.data });

    const text = JSON.stringify([brand.data, marketing.data.strategy, marketing.data.facebookAds, marketing.data.instagram, email.data]);
    expect(text).toContain("in Kosovo");
    expect(text).not.toMatch(/in kosovo/);
    expect(text).not.toMatch(/tired of unsure/i);
    expect(text).not.toMatch(/\ba [aeiou]\w*\s+experience/i);
    expect(text).not.toContain("-like customers");
    expect(marketing.data.strategy.positioning).toMatch(/^For women 25-40 in Kosovo who prefer natural skincare, /);
  });

  it("phrases the tone-of-voice guideline without a hard-coded article", async () => {
    const ctx = createContext(input);
    const brand = await runBrandAgent(ctx);
    const design = runDesignAgent(ctx, { ...brand.data, voice: ["Earthy", "Honest"] });
    const rule = design.data.guidelines.find((g) => g.title === "Tone of voice")?.rule;
    expect(rule).toBe("Keep the voice earthy, honest. Be human, never robotic.");
  });
});
