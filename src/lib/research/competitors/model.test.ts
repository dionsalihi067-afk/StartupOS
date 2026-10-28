import { describe, expect, it } from "vitest";
import { buildCompetitorIntelligence } from "@/lib/research/competitors/assemble";
import {
  competitorIntelligenceSchema,
  competitorProfileSchema,
  competitorProvenanceIssues,
  type CompetitorIntelligence,
  type CompetitorProfile,
} from "@/lib/research/competitors/model";
import type { ResearchSnapshot } from "@/lib/research/model";
import { competitorResults, researchRun } from "@/test/research";

async function valid(): Promise<{ intel: CompetitorIntelligence; snapshot: ResearchSnapshot }> {
  const run = await researchRun({ results: competitorResults() });
  if (run.status === "failed") throw new Error(run.error);
  const intel = buildCompetitorIntelligence(run.snapshot);
  if (!intel) throw new Error("intelligence failed validation");
  return { intel, snapshot: run.snapshot };
}

const clone = <T>(value: T): T => structuredClone(value);
const first = (intel: CompetitorIntelligence): CompetitorProfile => intel.competitors[0]!;

describe("competitor model", () => {
  it("accepts intelligence assembled from a real snapshot", async () => {
    const { intel, snapshot } = await valid();
    expect(competitorIntelligenceSchema.safeParse(intel).success).toBe(true);
    expect(competitorProvenanceIssues(intel, snapshot)).toEqual([]);
  });

  it("accepts a profile without optional fields (unknown location stays absent)", async () => {
    const { intel } = await valid();
    const profile = clone(first(intel));
    delete profile.location;
    expect(competitorProfileSchema.safeParse(profile).success).toBe(true);
  });

  it("rejects a profile missing required provenance", async () => {
    const { intel } = await valid();
    expect(competitorProfileSchema.safeParse({ ...first(intel), sourceIds: [] }).success).toBe(false);
    expect(competitorProfileSchema.safeParse({ ...first(intel), evidenceIds: [] }).success).toBe(false);
    expect(competitorProfileSchema.safeParse({ ...first(intel), queryIds: [] }).success).toBe(false);
  });

  it("rejects invalid URLs and malformed ids", async () => {
    const { intel } = await valid();
    expect(competitorProfileSchema.safeParse({ ...first(intel), website: "not a url" }).success).toBe(false);
    expect(competitorProfileSchema.safeParse({ ...first(intel), id: "competitor-1" }).success).toBe(false);
    expect(competitorProfileSchema.safeParse({ ...first(intel), sourceIds: ["src_nothex"] }).success).toBe(false);
  });

  it("rejects an unknown classification type or confidence level", async () => {
    const { intel } = await valid();
    const profile = first(intel);
    expect(competitorProfileSchema.safeParse({ ...profile, classification: { ...profile.classification, type: "local" } }).success).toBe(false);
    expect(competitorProfileSchema.safeParse({ ...profile, confidence: "certain" }).success).toBe(false);
  });

  it("rejects observed pricing without observations", async () => {
    const { intel } = await valid();
    expect(competitorProfileSchema.safeParse({ ...first(intel), pricing: { status: "observed", observations: [] } }).success).toBe(false);
  });

  it("rejects duplicate competitor ids and domains", async () => {
    const { intel } = await valid();
    const dupId = clone(intel);
    dupId.competitors[1] = { ...dupId.competitors[1]!, id: first(intel).id };
    expect(competitorIntelligenceSchema.safeParse(dupId).success).toBe(false);

    const dupDomain = clone(intel);
    dupDomain.competitors[1] = { ...dupDomain.competitors[1]!, domain: first(intel).domain };
    expect(competitorIntelligenceSchema.safeParse(dupDomain).success).toBe(false);
  });

  it("rejects a signal citing evidence its competitor does not own", async () => {
    const { intel } = await valid();
    const broken = clone(intel);
    const foreign = intel.competitors[1]!.evidenceIds[0]!;
    broken.competitors[0]!.listing.evidenceIds = [foreign];
    expect(competitorIntelligenceSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects an observation referencing an unknown competitor or foreign evidence", async () => {
    const { intel } = await valid();
    const index = intel.findings.findIndex((f) => f.kind === "observation");
    expect(index).toBeGreaterThanOrEqual(0);

    const unknown = clone(intel);
    const obs = unknown.findings[index]!;
    if (obs.kind !== "observation") throw new Error("expected an observation");
    obs.competitorIds = ["cmp_000000000000"];
    expect(competitorIntelligenceSchema.safeParse(unknown).success).toBe(false);

    const foreign = clone(intel);
    const obs2 = foreign.findings[index]!;
    if (obs2.kind !== "observation") throw new Error("expected an observation");
    obs2.evidenceIds = ["ev_000000000000"];
    expect(competitorIntelligenceSchema.safeParse(foreign).success).toBe(false);
  });

  it("rejects derived findings built on a recommendation or on a later finding", async () => {
    const { intel } = await valid();
    const recommendation = intel.findings.find((f) => f.kind === "recommendation");
    expect(recommendation).toBeDefined();

    const onRecommendation = clone(intel);
    onRecommendation.findings.push({ id: "cf_000000000000", topic: "gap", statement: "x", kind: "inference", basedOn: [recommendation!.id] });
    expect(competitorIntelligenceSchema.safeParse(onRecommendation).success).toBe(false);

    const forward = clone(intel);
    forward.findings.unshift({ id: "cf_000000000001", topic: "gap", statement: "x", kind: "inference", basedOn: [intel.findings[0]!.id] });
    expect(competitorIntelligenceSchema.safeParse(forward).success).toBe(false);
  });

  it("reports references that do not exist in the snapshot", async () => {
    const { intel, snapshot } = await valid();
    const broken = clone(intel);
    broken.competitors[0]!.evidenceIds.push("ev_000000000000");
    broken.competitors[0]!.sourceIds.push("src_000000000000");
    broken.competitors[0]!.website = "https://invented.example/";
    broken.rejected.push({ sourceId: "src_000000000001", reason: "article" });
    const issues = competitorProvenanceIssues(broken, snapshot);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("unknown source src_000000000000"),
        expect.stringContaining("unknown evidence ev_000000000000"),
        expect.stringContaining("website is not a retrieved page"),
        expect.stringContaining("rejection cites unknown source"),
      ]),
    );
  });

  it("reports evidence borrowed from another competitor's source and failed queries", async () => {
    const { intel, snapshot } = await valid();
    const broken = clone(intel);
    broken.competitors[0]!.evidenceIds.push(intel.competitors[1]!.evidenceIds[0]!);
    const failedSnapshot: ResearchSnapshot = {
      ...snapshot,
      queries: snapshot.queries.map((q) => (q.id === first(intel).queryIds[0] ? { ...q, status: "failed" as const } : q)),
    };
    expect(competitorProvenanceIssues(broken, snapshot).some((i) => i.includes("from a source it does not own"))).toBe(true);
    expect(competitorProvenanceIssues(intel, failedSnapshot).some((i) => i.includes("did not succeed"))).toBe(true);
  });
});
