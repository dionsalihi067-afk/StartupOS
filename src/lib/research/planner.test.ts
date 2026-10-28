import { describe, expect, it } from "vitest";
import { composeQuery, planResearch, researchContextFrom, sanitizeTerm } from "@/lib/research/planner";
import { RESEARCH_LIMITS } from "@/lib/research/limits";
import { RESEARCH_DIMENSIONS } from "@/lib/research/model";
import { sampleInput } from "@/test/research";
import type { BusinessInput } from "@/lib/types";

const legacy: BusinessInput = {
  idea: "Organic coffee roastery",
  audience: "Remote workers",
  location: "Prishtinë",
  budget: "10.000 €",
  style: "Organic / Natural",
};

describe("research query planner", () => {
  it("produces the same queries for the same input", () => {
    const input = sampleInput({ offer: { main: "Pour-over coffee", status: "planned" } });
    expect(planResearch(input)).toEqual(planResearch(structuredClone(input)));
  });

  it("covers each research dimension once, within the query limit", () => {
    const { queries } = planResearch(sampleInput());
    expect(queries.map((q) => q.id)).toEqual([...RESEARCH_DIMENSIONS]);
    expect(queries.length).toBeLessThanOrEqual(RESEARCH_LIMITS.maxQueries);
    for (const q of queries) expect(q.text.length).toBeLessThanOrEqual(RESEARCH_LIMITS.maxQueryChars);
  });

  it("uses business context: idea, customer, market, offer and revenue model", () => {
    const input = sampleInput({
      customer: { ideal: "Freelance designers", type: "b2c", geography: "Durrës" },
      offer: { main: "Coworking desk", status: "planned" },
      model: { revenue: ["subscription"] },
    });
    const byId = Object.fromEntries(planResearch(input).queries.map((q) => [q.id, q.text]));
    expect(byId.demand).toContain("Specialty coffee shop");
    expect(byId.demand).toContain("Durrës");
    expect(byId.customerNeeds).toContain("Freelance designers");
    expect(byId.competitors).toContain("Coworking desk");
    expect(byId.pricing).toContain("subscription");

    const other = sampleInput({ customer: { ideal: "Students", type: "b2c", geography: "Vlorë" } });
    expect(planResearch(other).queries).not.toEqual(planResearch(input).queries);
  });

  it("handles legacy input without discovery or location", () => {
    const { queries, context } = planResearch({ ...legacy, location: "" });
    expect(context.location).toBeUndefined();
    expect(context.offer).toBeUndefined();
    for (const q of queries) {
      expect(q.text).not.toMatch(/undefined|null|\s{2,}/);
      expect(q.text).toBe(q.text.trim());
    }
  });

  it("never includes names, budgets, private notes, URLs or emails", () => {
    const input = sampleInput({
      business: { name: "SecretBrandCo", idea: "Coffee shop see https://internal.example/x or ops@example.com" },
      model: { revenue: ["oneTime"], budget: "€48,000" },
      brand: { style: "Modern / Minimal", tone: "calm", language: "sq", notes: "internal launch codename" },
      market: { competitors: "private competitor notes" },
    });
    const text = planResearch(input).queries.map((q) => q.text).join(" | ");
    expect(text).not.toMatch(/SecretBrandCo|48,000|codename|private competitor|https?:|@|internal\.example/);
  });

  it("drops repeated terms within a query", () => {
    expect(composeQuery(["coffee shop", "Coffee", "Tirana", "tirana."])).toBe("coffee shop Tirana");
    const input = sampleInput({ offer: { main: "Specialty coffee", status: "planned" } });
    for (const q of planResearch(input).queries) {
      const words = q.text.toLowerCase().split(" ");
      expect(new Set(words).size).toBe(words.length);
    }
  });

  it("plans location-aware competitor discovery queries", () => {
    const input = sampleInput({ customer: { ideal: "Remote workers", type: "b2c", geography: "Durrës" } });
    const byId = Object.fromEntries(planResearch(input).queries.map((q) => [q.id, q.text]));
    expect(byId.localCompetitors).toContain("Durrës");
    expect(byId.directCompetitors).toContain("Durrës");
    expect(byId.nicheCompetitors).toContain("Remote workers");
    expect(byId.nicheCompetitors).toContain("Durrës");
    expect(new Set(Object.values(byId)).size).toBe(Object.keys(byId).length);
  });

  it("skips discovery queries the business context cannot support", () => {
    const ids = planResearch({ ...legacy, location: "", audience: "" }).queries.map((q) => q.id);
    expect(ids).not.toContain("localCompetitors");
    expect(ids).not.toContain("nicheCompetitors");
    expect(ids).toContain("directCompetitors");
  });

  it("respects a lower query limit", () => {
    expect(planResearch(sampleInput(), { maxQueries: 2, maxQueryChars: 160 }).queries).toHaveLength(2);
  });
});

describe("sanitizeTerm", () => {
  it("normalizes whitespace and punctuation runs", () => {
    expect(sanitizeTerm("  Coffee!!!   shop???  ")).toBe("Coffee shop");
    expect(sanitizeTerm("B2B -- tools,,, for teams...")).toBe("B2B - tools, for teams");
  });

  it("returns undefined for empty or symbol-only values", () => {
    expect(sanitizeTerm(undefined)).toBeUndefined();
    expect(sanitizeTerm("   ")).toBeUndefined();
    expect(sanitizeTerm("!!! ###")).toBeUndefined();
  });

  it("truncates long answers at a word boundary", () => {
    const long = "word ".repeat(40);
    const out = sanitizeTerm(long)!;
    expect(out.length).toBeLessThanOrEqual(RESEARCH_LIMITS.maxTermChars);
    expect(out.endsWith("word")).toBe(true);
  });

  it("keeps non-Latin letters", () => {
    expect(researchContextFrom(legacy).location).toBe("Prishtinë");
  });
});
