import { describe, expect, it } from "vitest";

import {
  acceptMarketInsight,
  containsQuantitativeClaim,
  containsUnsupportedCompetitorMetric,
  isHttpUrl,
  sanitizeCompetitorAnnotations,
  sanitizeMarketSummary,
  sanitizeStrategicItems,
  sanitizeSwot,
} from "@/lib/evidence/claims";

describe("acceptMarketInsight", () => {
  it("requires text and at least one citation", () => {
    expect(acceptMarketInsight("", ["https://a.example"])).toBe(false);
    expect(acceptMarketInsight("Demand is rising", [])).toBe(false);
    expect(acceptMarketInsight("Demand is rising", ["https://a.example"])).toBe(true);
  });

  it("blocks unsourced statistics from looking like verified market facts", () => {
    expect(acceptMarketInsight("TAM is €4,238,712", [])).toBe(false);
    expect(acceptMarketInsight("23% YoY growth", [])).toBe(false);
  });

  it("rejects malformed or non-http citation strings", () => {
    expect(acceptMarketInsight("Demand is rising", ["not-a-url"])).toBe(false);
    expect(acceptMarketInsight("Demand is rising", ["ftp://files.example/a"])).toBe(false);
    expect(acceptMarketInsight("Demand is rising", ["javascript:alert(1)"])).toBe(false);
    expect(acceptMarketInsight("Demand is rising", ["https://ok.example", "bogus"])).toBe(true);
  });
});

describe("isHttpUrl", () => {
  it("accepts http(s) URLs with a host and rejects others", () => {
    expect(isHttpUrl("https://news.example/path")).toBe(true);
    expect(isHttpUrl("http://localhost:3000")).toBe(true);
    expect(isHttpUrl("")).toBe(false);
    expect(isHttpUrl("example.com")).toBe(false);
  });
});

describe("sanitizeMarketSummary", () => {
  it("keeps qualitative summaries and scrubs quantitative ones", () => {
    expect(sanitizeMarketSummary("Local cafés are busier on weekdays.")).toContain("busier");
    expect(sanitizeMarketSummary("The market is worth €50 million with 40% CAGR.")).toMatch(/omitted/i);
  });
});

describe("SWOT / strategic item sanitization", () => {
  it("drops competitor metric overclaims from SWOT", () => {
    const swot = sanitizeSwot({
      strengths: ["Owner already knows the neighbourhood"],
      weaknesses: ["Competitor X has 40% market share"],
      opportunities: ["Remote workers need quiet space"],
      threats: ["Chain cafés have €2M annual revenue"],
    });
    expect(swot.strengths).toEqual(["Owner already knows the neighbourhood"]);
    expect(swot.weaknesses).toEqual([]);
    expect(swot.opportunities).toEqual(["Remote workers need quiet space"]);
    expect(swot.threats).toEqual([]);
  });

  it("drops revenue/CAC-style annotations on competitors", () => {
    expect(sanitizeCompetitorAnnotations(["Roasts in-house", "Revenue of €1M", "Busy weekends"], 3)).toEqual([
      "Roasts in-house",
      "Busy weekends",
    ]);
  });

  it("keeps qualitative differentiation lines", () => {
    expect(sanitizeStrategicItems(["Focus on quiet hours for remote workers", "Undercut on CAC by 30%"], 4)).toEqual([
      "Focus on quiet hours for remote workers",
    ]);
  });
});

describe("metric detectors", () => {
  it("flags quantitative and performance language", () => {
    expect(containsQuantitativeClaim("up 12%")).toBe(true);
    expect(containsQuantitativeClaim("growth of 23 percent")).toBe(true);
    expect(containsQuantitativeClaim("$1,200,000 ARR")).toBe(true);
    expect(containsQuantitativeClaim("10,000+ customers")).toBe(true);
    expect(containsQuantitativeClaim("doubled year over year")).toBe(true);
    expect(containsQuantitativeClaim("Quiet space for remote workers")).toBe(false);
    expect(containsUnsupportedCompetitorMetric("strong brand")).toBe(false);
    expect(containsUnsupportedCompetitorMetric("high profitability")).toBe(true);
    expect(containsUnsupportedCompetitorMetric("low customer acquisition cost")).toBe(true);
  });
});
