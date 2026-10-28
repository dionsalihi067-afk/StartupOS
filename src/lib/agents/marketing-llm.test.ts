import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/client", () => ({ generateJson: vi.fn(), isLlmConfigured: () => true }));

import { generateJson } from "@/lib/ai/client";
import { createContext } from "@/lib/agents/context";
import { ownerChannels, runMarketingAgent } from "@/lib/agents/marketing";
import { makePackage } from "@/test/db";

const pkg = makePackage();

function context() {
  const ctx = createContext(pkg.input);
  ctx.useLlm = true;
  return ctx;
}

const owner = [
  { channel: "Website and search", rationale: "Owner rationale A", budgetPercent: 50 },
  { channel: "Instagram", rationale: "Owner rationale B", budgetPercent: 50 },
];

describe("marketing agent with a language model", () => {
  it("accepts null fields instead of discarding the whole answer", async () => {
    vi.mocked(generateJson).mockResolvedValue({
      source: "llm",
      data: {
        positioning: "Calm skincare for busy people.",
        messaging: ["Simple routines", null],
        channels: null,
        kpis: [{ metric: "Repeat customers", target: null }],
        contentPillars: [{ pillar: "Routines", description: null, sampleTopics: "Morning routine" }],
        instagramCaptions: [{ headline: "Meet Lume", caption: "Simple skincare ✨", cta: null }],
        facebookAds: null,
      },
    });
    const out = await runMarketingAgent(context(), pkg.brand, pkg.persona);
    expect(out.source).toBe("llm");
    expect(out.note).toBeUndefined();
    expect(out.data.strategy.positioning).toBe("Calm skincare for busy people.");
    expect(out.data.strategy.messaging).toEqual(["Simple routines"]);
    expect(out.data.strategy.kpis).toEqual([{ metric: "Repeat customers", target: "Measure a baseline in the first 30 days" }]);
    expect(out.data.strategy.contentPillars[0]!.sampleTopics).toEqual(["Morning routine"]);
  });

  it("replaces KPI targets with invented numbers by a measured baseline", async () => {
    vi.mocked(generateJson).mockResolvedValue({
      source: "llm",
      data: { kpis: [{ metric: "Followers", target: "Reach 5,000 followers" }, { metric: "Conversion", target: 3 }, { metric: "Reviews", target: "Ask every customer" }] },
    });
    const out = await runMarketingAgent(context(), pkg.brand, pkg.persona);
    expect(out.data.strategy.kpis.map((k) => k.target)).toEqual([
      "Measure a baseline in the first 30 days",
      "Measure a baseline in the first 30 days",
      "Ask every customer",
    ]);
  });

  it("keeps the usable copy when single fields come back in another shape", async () => {
    vi.mocked(generateJson).mockResolvedValue({
      source: "llm",
      data: {
        marketing: {
          positioning: ["Calm skincare", "for busy people."],
          messaging: [{ message: "Simple routines" }],
          channels: [{ channel: "Instagram", rationale: "Demos", budgetPercent: "~60%" }, "Website"],
          kpis: ["Repeat customers: Ask every customer", { metric: "Followers", target: "Reach 5,000 followers" }],
          facebookAds: [{ objective: "Awareness", primaryText: "Skincare that fits a busy morning.", headline: "Meet Lume", description: "Simple routines", cta: { label: "Shop now" } }],
        },
      },
    });
    const out = await runMarketingAgent(context(), pkg.brand, pkg.persona);
    expect(out.source).toBe("llm");
    expect(out.note).toBeUndefined();
    expect(out.data.strategy.positioning).toBe("Calm skincare for busy people.");
    expect(out.data.strategy.messaging).toEqual(["Simple routines"]);
    expect(out.data.strategy.kpis).toEqual([
      { metric: "Repeat customers", target: "Ask every customer" },
      { metric: "Followers", target: "Measure a baseline in the first 30 days" },
    ]);
    expect(out.data.facebookAds[0]!.cta).toBe("Shop now");
  });

  it("reports an answer with no usable content as invalid output, not as AI-written", async () => {
    vi.mocked(generateJson).mockResolvedValue({ source: "llm", data: { unrelated: true } });
    const out = await runMarketingAgent(context(), pkg.brand, pkg.persona);
    expect(out.source).toBe("deterministic");
    expect(out.note).toBe("llm-invalid-output");
  });

  it("passes the provider's failure reason through and keeps template content", async () => {
    vi.mocked(generateJson).mockResolvedValue({ source: "none", data: null, note: "llm-truncated" });
    const out = await runMarketingAgent(context(), pkg.brand, pkg.persona);
    expect(out.source).toBe("deterministic");
    expect(out.note).toBe("llm-truncated");
    expect(out.data.instagram.length).toBeGreaterThan(0);
  });
});

describe("ownerChannels", () => {
  it("keeps exactly the owner's channels and ignores channels the owner did not choose", () => {
    const out = ownerChannels(
      [
        { channel: "TikTok", rationale: "Not chosen", budgetPercent: 40 },
        { channel: "Instagram Reels", rationale: "Short demos", budgetPercent: 30 },
        { channel: "Website & SEO", rationale: "Search traffic", budgetPercent: 30 },
      ],
      owner,
    );
    expect(out).toEqual([
      { channel: "Website and search", rationale: "Search traffic", budgetPercent: 50 },
      { channel: "Instagram", rationale: "Short demos", budgetPercent: 50 },
    ]);
  });

  it("scales shares to 100 and spreads them evenly when one is missing", () => {
    expect(ownerChannels([{ channel: "Website", budgetPercent: 30 }, { channel: "Instagram", budgetPercent: 60 }], owner).map((c) => c.budgetPercent)).toEqual([34, 66]);
    const partial = ownerChannels([{ channel: "Instagram", rationale: "Demos", budgetPercent: 80 }], owner);
    expect(partial).toEqual([
      { channel: "Website and search", rationale: "Owner rationale A", budgetPercent: 50 },
      { channel: "Instagram", rationale: "Demos", budgetPercent: 50 },
    ]);
  });
});
