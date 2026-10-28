import { describe, expect, it } from "vitest";
import {
  classifyPersistedCompetitor,
  competitorsNeedingRevalidation,
  confirmedCompetitors,
  confirmedCompetitorAnalysis,
} from "@/lib/research/competitors/revalidate";
import type { Competitor, CompetitorAnalysis } from "@/lib/types";

function competitor(partial: Partial<Competitor>): Competitor {
  return {
    name: "Example",
    description: "A clothing store",
    type: "direct",
    category: "retail",
    website: "https://example.com",
    strengths: [],
    weaknesses: [],
    sources: [],
    ...partial,
  };
}

describe("classifyPersistedCompetitor", () => {
  it("flags findglocal and MapQuest rows without rewriting them", () => {
    expect(
      classifyPersistedCompetitor(
        competitor({
          name: "Find Local Businesses",
          website: "https://www.findglocal.com/XK/example",
          description: "Find clothing stores. Listings include Moda Italia.",
        }),
      ),
    ).toBe("platformListing");

    expect(
      classifyPersistedCompetitor(
        competitor({
          name: "MapQuest",
          website: "https://www.mapquest.com/us/new-york/kosovo-grocery",
          description: "Printable directions will be ready after this ad.",
        }),
      ),
    ).toBe("platformListing");
  });

  it("accepts a named clothing retailer", () => {
    expect(
      classifyPersistedCompetitor(
        competitor({ name: "Moda Italia Store", website: "https://example.com/moda", description: "Local fashion boutique" }),
      ),
    ).toBe("accepted");
  });

  it("lists platform rows for revalidation messaging", () => {
    const rows = [
      competitor({ name: "Moda Italia Store" }),
      competitor({ name: "Find Local Businesses", description: "findglocal directory" }),
    ];
    expect(competitorsNeedingRevalidation(rows).map((c) => c.name)).toEqual(["Find Local Businesses"]);
  });

  it("keeps confirmed rivals only and does not rewrite the stored array", () => {
    const rows = [
      competitor({ name: "Moda Italia Store", website: "https://modaitalia.example" }),
      competitor({
        name: "Find Local Businesses",
        website: "https://www.findglocal.com/XK/example",
        description: "Listings include Moda Italia.",
      }),
      competitor({
        name: "Kosovo Grocery",
        website: "https://www.mapquest.com/us/new-york/kosovo-grocery",
        description: "Printable directions will be ready.",
      }),
    ];
    const confirmed = confirmedCompetitors(rows);
    expect(confirmed.map((c) => c.name)).toEqual(["Moda Italia Store"]);
    expect(rows).toHaveLength(3);

    const analysis: CompetitorAnalysis = {
      available: true,
      status: "ok",
      provider: "tavily",
      queries: [],
      marketOverview: "Overview kept for historical honesty",
      competitors: rows,
      swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
      differentiation: [],
      opportunityGaps: [],
      sources: [],
    };
    const view = confirmedCompetitorAnalysis(analysis);
    expect(view.competitors.map((c) => c.name)).toEqual(["Moda Italia Store"]);
    expect(view.available).toBe(true);
    expect(analysis.competitors).toHaveLength(3);
  });

  it("does not invent rivals when only directory rows exist", () => {
    const rows = [
      competitor({
        name: "Find Local Businesses",
        website: "https://www.findglocal.com/XK/example",
        description: "Find clothing stores.",
      }),
    ];
    expect(confirmedCompetitors(rows)).toEqual([]);
  });
});
