import { describe, expect, it } from "vitest";
import {
  aiProviderRefused,
  incompleteSections,
  overviewBudgetLabel,
  overviewJoined,
  overviewPositioning,
  regenerationSummary,
} from "@/lib/client/insights";
import { FLEXIBLE_BUDGET, discoverySchema, toEngineFields } from "@/lib/discovery";
import { makePackage } from "@/test/db";
import type { BusinessPackage } from "@/lib/types";
import type { Translator } from "@/i18n/translator";

const t = Object.assign((key: string) => (key === "discovery.review.notDecided" ? "Not decided yet" : key), {
  rich: (key: string) => key,
  optional: () => undefined,
  locale: "en" as const,
}) as Translator;

function withLog(entries: { agent: string; note?: string }[]): BusinessPackage {
  const pkg = makePackage();
  return {
    ...pkg,
    meta: {
      ...pkg.meta,
      agentLog: entries.map((e) => ({ agent: e.agent, status: e.note ? "fallback" : "ok", source: e.note ? "deterministic" : "llm", durationMs: 1, note: e.note })),
    },
  };
}

describe("aiProviderRefused", () => {
  it("is true for refusals a retry cannot fix, including inside a combined note", () => {
    expect(aiProviderRefused(withLog([{ agent: "Growth Agent", note: "llm-unavailable:http-429:project_spend_limit_exceeded" }]))).toBe(true);
    expect(aiProviderRefused(withLog([{ agent: "Strategy Agent", note: "llm-unavailable:http-401:invalid_api_key, financials-unavailable" }]))).toBe(true);
    expect(aiProviderRefused(withLog([{ agent: "Logo Agent", note: "image-rejected-429,image-rejected-401" }]))).toBe(true);
  });

  it("is false for rate limits, timeouts and invalid answers", () => {
    expect(
      aiProviderRefused(
        withLog([
          { agent: "Growth Agent", note: "llm-unavailable:http-429:rate_limit_exceeded" },
          { agent: "Marketing Agent", note: "llm-unavailable:timeout" },
          { agent: "Pricing Agent", note: "llm-invalid-output" },
          { agent: "Brand Agent" },
        ]),
      ),
    ).toBe(false);
  });

  it("still lists the affected sections as incomplete", () => {
    const pkg = withLog([{ agent: "Growth Agent", note: "llm-unavailable:http-429:project_spend_limit_exceeded" }]);
    expect(incompleteSections(pkg)).toEqual(["growth"]);
  });
});

describe("regenerationSummary", () => {
  it("does not report a section saved with template content as updated (server response from a real refused run)", () => {
    const summary = regenerationSummary({
      outcomes: [{ section: "growth", status: "fallback", message: "llm-unavailable:http-429:project_spend_limit_exceeded" }],
      succeeded: ["growth"],
      failed: [],
    });
    expect(summary).toEqual({ updated: [], templateOnly: ["growth"], failed: [], providerRefused: true, complete: false });
  });

  it("is complete only when every section was written again", () => {
    expect(
      regenerationSummary({
        outcomes: [
          { section: "growth", status: "ok" },
          { section: "marketing", status: "ok" },
        ],
        succeeded: ["growth", "marketing"],
        failed: [],
      }),
    ).toEqual({ updated: ["growth", "marketing"], templateOnly: [], failed: [], providerRefused: false, complete: true });

    const mixed = regenerationSummary({
      outcomes: [
        { section: "growth", status: "ok" },
        { section: "strategy", status: "fallback", message: "llm-unavailable:timeout" },
        { section: "marketing", status: "error", message: "boom" },
      ],
      succeeded: ["growth", "strategy"],
      failed: ["marketing"],
    });
    expect(mixed).toEqual({ updated: ["growth"], templateOnly: ["strategy"], failed: ["marketing"], providerRefused: false, complete: false });
  });

  it("explains a logo the image model refused (server response from a real refused run)", () => {
    const summary = regenerationSummary({
      outcomes: [{ section: "logo", status: "error", message: "image-rejected-429" }],
      succeeded: [],
      failed: ["logo"],
    });
    expect(summary).toEqual({ updated: [], templateOnly: [], failed: ["logo"], providerRefused: true, complete: false });
    expect(regenerationSummary({ outcomes: [{ section: "logo", status: "error", message: "image-rate-limited-429" }], succeeded: [], failed: ["logo"] }).providerRefused).toBe(false);
    expect(regenerationSummary({ outcomes: [{ section: "logo", status: "error", message: "image-rejected-400" }], succeeded: [], failed: ["logo"] }).providerRefused).toBe(false);
  });
});

describe("overview integrity", () => {
  it("prefers owner positioning and never invents text when both are empty", () => {
    const base = makePackage();
    expect(overviewPositioning(base)).toBeNull();

    const withAi = makePackage({
      marketing: {
        ...base.marketing,
        strategy: { ...base.marketing.strategy, positioning: "AI-written niche claim" },
      },
    });
    expect(overviewPositioning(withAi)).toEqual({ text: "AI-written niche claim", source: "ai" });

    const discovery = discoverySchema.parse({
      business: { idea: base.input.idea, stage: "idea", type: "online", category: "general", location: base.input.location },
      customer: { ideal: base.input.audience, type: "b2c" },
      offer: { status: "planned" },
      model: { revenue: ["oneTime"] },
      market: { positioning: "Owner-stated fair-trade coffee for remote workers" },
      brand: { style: base.input.style, tone: "friendly", language: "en" },
      goals: { priority: "launch" },
    });
    const withOwner = makePackage({
      input: { ...toEngineFields(discovery), discovery },
      marketing: {
        ...base.marketing,
        strategy: { ...base.marketing.strategy, positioning: "Conflicting AI positioning" },
      },
    });
    expect(overviewPositioning(withOwner)).toEqual({
      text: "Owner-stated fair-trade coffee for remote workers",
      source: "owner",
    });
  });

  it("handles missing market fragments and flexible budgets without fabricating values", () => {
    expect(overviewJoined([undefined, "", "Online"])).toBe("Online");
    expect(overviewJoined([null, undefined])).toBe("—");
    expect(overviewBudgetLabel(FLEXIBLE_BUDGET, t)).toBe("Not decided yet");
    expect(overviewBudgetLabel(undefined, t)).toBe("Not decided yet");
    expect(overviewBudgetLabel("€5,000", t)).toBe("€5,000");
  });

  it("reads legacy packages that lack discovery metadata", () => {
    const legacy = makePackage();
    expect(legacy.input.discovery).toBeUndefined();
    expect(overviewPositioning(legacy)).toBeNull();
    expect(overviewBudgetLabel(legacy.input.budget, t)).toBe("10.000 €");
  });
});
