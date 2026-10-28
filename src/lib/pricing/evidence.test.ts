import { describe, expect, it } from "vitest";
import { buildPricingEvidence, NO_RESEARCH_EVIDENCE } from "@/lib/pricing/evidence";
import { pricingEvidenceIssues, pricingEvidenceSchema } from "@/lib/pricing/model";
import { buildCompetitorIntelligence } from "@/lib/research/competitors/assemble";
import { runResearch } from "@/lib/research/engine";
import type { ResearchRunResult } from "@/lib/research/model";
import { competitorPricing, pricingEvidence } from "@/test/pricing";
import { competitorResults, researchRun, sampleInput } from "@/test/research";

const withSnippets = (snippets: Record<string, string>) => {
  const results = competitorResults();
  for (const hits of Object.values(results)) {
    for (const h of hits ?? []) if (h.title && snippets[h.title] !== undefined) h.snippet = snippets[h.title];
  }
  return results;
};

const snapshotOf = (run: ResearchRunResult) => {
  if (run.status === "failed") throw new Error(run.error);
  return run.snapshot;
};

describe("pricing evidence schema", () => {
  it("accepts published, on-request, ambiguous and unavailable pricing", () => {
    const evidence = pricingEvidence([
      { prices: ["€29/month", "€290/year"] },
      { status: "onRequest" },
      { status: "ambiguous" },
      {},
    ]);
    expect(pricingEvidenceSchema.safeParse(evidence).success).toBe(true);
  });

  it("rejects duplicate competitor pricing", () => {
    const one = competitorPricing(1, { prices: ["€29"] });
    const result = pricingEvidenceSchema.safeParse({ research: "complete", competitors: [one, structuredClone(one)] });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("duplicate competitor pricing");
  });

  it("rejects invalid source and evidence ids", () => {
    const badSource = competitorPricing(1, { prices: ["€29"] });
    badSource.points[0]!.sourceIds = ["https://attacker.example"];
    expect(pricingEvidenceSchema.safeParse({ research: "complete", competitors: [badSource] }).success).toBe(false);

    const badEvidence = competitorPricing(1, { prices: ["€29"] });
    badEvidence.evidenceIds = [];
    expect(pricingEvidenceSchema.safeParse({ research: "complete", competitors: [badEvidence] }).success).toBe(false);
  });

  it("rejects points without provenance, outside the competitor's provenance, or duplicated", () => {
    const noProvenance = competitorPricing(1, { prices: ["€29"] });
    noProvenance.points[0]!.evidenceIds = [];
    expect(pricingEvidenceSchema.safeParse({ research: "complete", competitors: [noProvenance] }).success).toBe(false);

    const foreign = competitorPricing(1, { prices: ["€29"] });
    foreign.points[0]!.sourceIds = ["src_ffffffffffff"];
    expect(pricingEvidenceSchema.safeParse({ research: "complete", competitors: [foreign] }).success).toBe(false);

    const duplicated = competitorPricing(1, { prices: ["€29", "€29"] });
    expect(pricingEvidenceSchema.safeParse({ research: "complete", competitors: [duplicated] }).success).toBe(false);
  });

  it("only published pricing carries price points, and failed or absent research carries none", () => {
    const fake = { ...competitorPricing(1, { prices: ["€29"] }), status: "unavailable" as const };
    expect(pricingEvidenceSchema.safeParse({ research: "complete", competitors: [fake] }).success).toBe(false);
    const empty = { ...competitorPricing(1), status: "published" as const };
    expect(pricingEvidenceSchema.safeParse({ research: "complete", competitors: [empty] }).success).toBe(false);
    for (const research of ["failed", "absent"] as const) {
      expect(pricingEvidenceSchema.safeParse(pricingEvidence([{ prices: ["€29"] }], research)).success).toBe(false);
    }
  });

  it("keeps missing currency and missing billing period as null instead of forcing them", () => {
    const [c] = pricingEvidence([{ prices: [["$49", "Only $49"], ["€29", "Plans at €29"]] }]).competitors;
    expect(c!.points.map((p) => [p.currency, p.currencySymbol, p.cadence, p.billing])).toEqual([
      [null, "$", null, "unspecified"],
      ["EUR", null, null, "unspecified"],
    ]);
  });
});

describe("pricing evidence from research", () => {
  it("returns no evidence when research is absent and none when it failed", async () => {
    expect(buildPricingEvidence(undefined)).toEqual(NO_RESEARCH_EVIDENCE);
    expect(buildPricingEvidence(await runResearch(sampleInput(), null))).toEqual({ research: "failed", competitors: [] });
  });

  it("builds evidence only from validated competitors, with verbatim prices", async () => {
    const evidence = buildPricingEvidence(await researchRun({ results: competitorResults() }));
    expect(evidence.research).toBe("complete");
    expect(evidence.competitors.map((c) => [c.name, c.status])).toEqual([
      ["Rio Café", "published"],
      ["Nomad Hub", "published"],
      ["Tea House Tirana", "unavailable"],
      ["Mulliri Vjetër", "unavailable"],
    ]);
    const [rio, nomad] = evidence.competitors;
    expect(rio!.points).toEqual([
      expect.objectContaining({ original: "150 ALL", value: 150, currency: "ALL", cadence: null, billing: "unspecified", qualifier: "from" }),
    ]);
    expect(nomad!.points).toEqual([
      expect.objectContaining({ original: "€8/day", value: 8, currency: "EUR", cadence: "day", billing: "perUnit", qualifier: "from" }),
    ]);
    expect(JSON.stringify(evidence)).not.toMatch(/guide\.example\.org|beans-wholesale|cars\.al|instagram/);
  });

  it("reads monthly, yearly and one-time prices, contact-for-pricing and free offers", async () => {
    const run = await researchRun({
      results: withSnippets({
        "Tea House Tirana": "Specialty tea, an alternative to coffee, served in Tirana. Contact us for pricing.",
        "Mulliri Vjetër": "Coffee chain with locations across Albania. Coffee club €15/month or €150/year. Free trial week.",
        "Rio Café | Specialty coffee in Tirana": "Specialty coffee roasted daily in Tirana. Barista course €120 one-time.",
      }),
    });
    const byName = new Map(buildPricingEvidence(run).competitors.map((c) => [c.name, c]));
    expect(byName.get("Tea House Tirana")!.status).toBe("onRequest");
    const mulliri = byName.get("Mulliri Vjetër")!;
    expect(mulliri.points.map((p) => [p.original, p.cadence, p.billing])).toEqual([
      ["€15/month", "month", "recurring"],
      ["€150/year", "year", "recurring"],
    ]);
    expect(mulliri.freeOffer).toBeDefined();
    expect(byName.get("Rio Café")!.points.map((p) => [p.original, p.billing])).toEqual([["€120", "oneTime"]]);
  });

  it("keeps competitors without listed prices as unavailable, not as zero or estimated prices", async () => {
    const evidence = buildPricingEvidence(await researchRun({ results: competitorResults() }));
    for (const c of evidence.competitors.filter((x) => x.status !== "published")) expect(c.points).toEqual([]);
  });

  it("reports partial research", async () => {
    const evidence = buildPricingEvidence(await researchRun({ results: competitorResults(), failing: ["pricing"] }));
    expect(evidence.research).toBe("partial");
  });

  it("drops all pricing evidence when a price is not traceable to retrieved text", async () => {
    const run = await researchRun({ results: competitorResults() });
    const intel = buildCompetitorIntelligence(snapshotOf(run))!;
    const tampered = structuredClone(intel);
    const rio = tampered.competitors[0]!;
    if (rio.pricing.status !== "observed") throw new Error("fixture changed");
    rio.pricing.observations[0]!.amount = "€5";
    expect(buildPricingEvidence(run, tampered)).toEqual({ research: "complete", competitors: [] });
  });

  it("flags unknown sources, unknown evidence and prices missing from their evidence", async () => {
    const run = await researchRun({ results: competitorResults() });
    const snapshot = snapshotOf(run);
    const evidence = buildPricingEvidence(run);
    expect(pricingEvidenceIssues(evidence, snapshot)).toEqual([]);

    const forged = structuredClone(evidence);
    forged.competitors[0]!.points[0]!.original = "99 ALL";
    forged.competitors[1]!.sourceIds.push("src_ffffffffffff");
    forged.competitors[1]!.evidenceIds.push("ev_ffffffffffff");
    const issues = pricingEvidenceIssues(forged, snapshot);
    expect(issues).toContain("price 99 ALL does not appear in its evidence");
    expect(issues.some((i) => i.includes("unknown source src_ffffffffffff"))).toBe(true);
    expect(issues.some((i) => i.includes("unknown evidence ev_ffffffffffff"))).toBe(true);
  });

  it("is deterministic", async () => {
    const a = buildPricingEvidence(await researchRun({ results: competitorResults() }));
    const b = buildPricingEvidence(await researchRun({ results: competitorResults() }));
    expect(a).toEqual(b);
  });
});
