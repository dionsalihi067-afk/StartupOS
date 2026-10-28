import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  acceptMarketInsight,
  containsQuantitativeClaim,
  sanitizeMarketSummary,
} from "@/lib/agents/market";

describe("acceptMarketInsight", () => {
  it("rejects empty insight or missing citations", () => {
    expect(acceptMarketInsight("", ["https://example.com"])).toBe(false);
    expect(acceptMarketInsight("Demand is rising", [])).toBe(false);
    expect(acceptMarketInsight("  ", ["https://example.com"])).toBe(false);
  });

  it("rejects unsourced statistics that would otherwise look verified", () => {
    expect(acceptMarketInsight("The market is worth €4,238,712", [])).toBe(false);
    expect(acceptMarketInsight("Growth of 23% year over year", [])).toBe(false);
    expect(acceptMarketInsight("Over 10,000 customers already", [])).toBe(false);
  });

  it("accepts cited insights, including source-reported quantities", () => {
    expect(acceptMarketInsight("Demand is rising in the city centre", ["https://news.example/a"])).toBe(true);
    expect(acceptMarketInsight("One report cited 12% growth", ["https://news.example/a"])).toBe(true);
  });
});

describe("containsQuantitativeClaim / sanitizeMarketSummary", () => {
  it("detects percentages, currency, and customer counts", () => {
    expect(containsQuantitativeClaim("up 15% this year")).toBe(true);
    expect(containsQuantitativeClaim("valued at €2.5 million")).toBe(true);
    expect(containsQuantitativeClaim("serves 5000 customers")).toBe(true);
    expect(containsQuantitativeClaim("Local cafés are busier on weekdays")).toBe(false);
  });

  it("replaces unsourced quantitative summaries", () => {
    const safe = sanitizeMarketSummary("Local demand appears steady.");
    expect(safe).toBe("Local demand appears steady.");
    const scrubbed = sanitizeMarketSummary("The TAM is €50 million with 40% CAGR.");
    expect(scrubbed).not.toMatch(/%|€\s*\d/);
    expect(scrubbed.toLowerCase()).toContain("omitted");
  });
});
