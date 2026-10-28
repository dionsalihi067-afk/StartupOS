import { describe, expect, it } from "vitest";
import { assembleSnapshot, type AssemblyInput } from "@/lib/research/assemble";
import { buildFactClaims, categorize, extractEvidence } from "@/lib/research/evidence";
import { normalizeHit } from "@/lib/research/normalize";
import {
  factClaimSchema,
  researchClaimSchema,
  researchEvidenceSchema,
  researchSnapshotSchema,
  type ResearchSnapshot,
  type ResearchSource,
} from "@/lib/research/model";
import { hit } from "@/test/research";

const retrievedAt = "2026-10-08T12:00:01.000Z";

function source(path: string, queryId: ResearchSource["queryIds"][number], extra: Partial<ResearchSource> = {}): ResearchSource {
  return { ...normalizeHit({ queryId, hit: hit(path) }, retrievedAt)!, ...extra };
}

function assemblyInput(overrides: Partial<AssemblyInput> = {}): AssemblyInput {
  return {
    startedAt: "2026-10-08T12:00:00.000Z",
    completedAt: "2026-10-08T12:00:02.000Z",
    provider: "fake",
    context: { idea: "Specialty coffee shop", customer: "Remote workers", location: "Tirana", revenueModels: ["oneTime"] },
    queries: [
      { id: "demand", text: "Specialty coffee shop demand Tirana", status: "ok", resultCount: 1 },
      { id: "competitors", text: "Specialty coffee shop competitors alternatives Tirana", status: "ok", resultCount: 1 },
    ],
    sources: [source("market", "demand"), source("rival", "competitors")],
    ...overrides,
  };
}

function validSnapshot(): ResearchSnapshot {
  const result = assembleSnapshot(assemblyInput());
  if (result.status === "failed") throw new Error(`expected a snapshot, got ${result.error}`);
  return result.snapshot;
}

describe("evidence", () => {
  it("references the source it was taken from and inherits its query provenance", () => {
    const sources = [source("a", "demand")];
    const [e] = extractEvidence(sources);
    expect(e).toMatchObject({ sourceId: sources[0]!.id, excerpt: "Snippet about a.", category: "market", queryIds: ["demand"] });
  });

  it("is not created from sources without text", () => {
    expect(extractEvidence([source("a", "demand", { snippet: "" })])).toEqual([]);
  });

  it("requires a source reference", () => {
    expect(researchEvidenceSchema.safeParse({ id: "ev_000000000000", excerpt: "x", category: "market", queryIds: ["demand"] }).success).toBe(false);
  });

  it("stays unclassified when the discovering queries disagree on a category", () => {
    expect(categorize({ queryIds: ["demand", "trends"] })).toBe("market");
    expect(categorize({ queryIds: ["demand", "competitors"] })).toBeNull();
  });
});

describe("claims", () => {
  it("creates attributed, low-confidence fact claims only for classified evidence", () => {
    const sources = [source("a", "pricing", { publisher: "Price Watch" }), source("b", "demand", { queryIds: ["demand", "pricing"] })];
    const evidence = extractEvidence(sources);
    const claims = buildFactClaims(evidence, sources);
    expect(evidence).toHaveLength(2);
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({
      kind: "fact",
      basis: "source-reported",
      category: "pricing",
      confidence: "low",
      statement: "Price Watch reports: Snippet about a.",
      sourceIds: [sources[0]!.id],
    });
  });

  it("rejects a fact claim without provenance", () => {
    const fact = validSnapshot().claims[0]!;
    expect(factClaimSchema.safeParse({ ...fact, sourceIds: [] }).success).toBe(false);
    expect(factClaimSchema.safeParse({ ...fact, evidenceIds: [] }).success).toBe(false);
  });

  it("rejects facts that cite unknown sources or omit the source of their evidence", () => {
    const snap = validSnapshot();
    const fact = snap.claims[0]!;
    if (fact.kind !== "fact") throw new Error("expected fact");
    const unknownSource = { ...fact, sourceIds: ["src_ffffffffffff"] };
    expect(researchSnapshotSchema.safeParse({ ...snap, claims: [unknownSource] }).success).toBe(false);
    const otherSource = snap.sources.find((s) => !fact.sourceIds.includes(s.id))!;
    const mismatched = { ...fact, sourceIds: [otherSource.id] };
    expect(researchSnapshotSchema.safeParse({ ...snap, claims: [mismatched] }).success).toBe(false);
  });

  it("keeps inferences and recommendations separate from facts and requires a basis", () => {
    const snap = validSnapshot();
    const fact = snap.claims[0]!;
    const inference = {
      id: "cl_aaaaaaaaaaaa",
      kind: "inference",
      category: fact.category,
      statement: "Demand may be growing locally.",
      confidence: "low",
      basedOnClaimIds: [fact.id],
    };
    const recommendation = {
      id: "cl_bbbbbbbbbbbb",
      kind: "recommendation",
      category: fact.category,
      statement: "Validate demand with a pilot.",
      confidence: "low",
      basedOnClaimIds: [inference.id],
    };
    expect(researchSnapshotSchema.safeParse({ ...snap, claims: [...snap.claims, inference, recommendation] }).success).toBe(true);

    expect(researchClaimSchema.safeParse({ ...inference, basedOnClaimIds: [] }).success).toBe(false);
    expect(researchClaimSchema.safeParse({ ...inference, kind: "fact" }).success).toBe(false);
    const forwardReference = { ...inference, basedOnClaimIds: [recommendation.id] };
    expect(researchSnapshotSchema.safeParse({ ...snap, claims: [...snap.claims, forwardReference, recommendation] }).success).toBe(false);
    const onRecommendation = { ...recommendation, id: "cl_cccccccccccc", basedOnClaimIds: [recommendation.id] };
    expect(
      researchSnapshotSchema.safeParse({ ...snap, claims: [...snap.claims, inference, recommendation, onRecommendation] }).success,
    ).toBe(false);
  });

  it("rejects unknown claim kinds and numeric confidence", () => {
    const fact = validSnapshot().claims[0]!;
    expect(researchClaimSchema.safeParse({ ...fact, kind: "rumor" }).success).toBe(false);
    expect(researchClaimSchema.safeParse({ ...fact, confidence: 0.98 }).success).toBe(false);
  });
});

describe("snapshot assembly", () => {
  it("produces a schema-valid snapshot with correct metadata", () => {
    const snap = validSnapshot();
    expect(researchSnapshotSchema.safeParse(snap).success).toBe(true);
    expect(snap).toMatchObject({
      schemaVersion: 1,
      status: "complete",
      provider: "fake",
      startedAt: "2026-10-08T12:00:00.000Z",
      completedAt: "2026-10-08T12:00:02.000Z",
      stats: { queriesPlanned: 2, queriesSucceeded: 2, queriesFailed: 0, sourcesFound: 2 },
    });
    expect(snap.context.idea).toBe("Specialty coffee shop");
    expect(snap.evidence).toHaveLength(2);
    expect(snap.claims.map((c) => c.category).sort()).toEqual(["competitor", "market"]);
  });

  it("marks runs with failed queries as partial", () => {
    const result = assembleSnapshot(
      assemblyInput({
        queries: [
          { id: "demand", text: "q", status: "ok", resultCount: 1 },
          { id: "competitors", text: "q2", status: "failed", resultCount: 0, error: "timeout" },
        ],
        sources: [source("market", "demand")],
      }),
    );
    expect(result.status).toBe("partial");
  });

  it("fails without findings when nothing usable was retrieved", () => {
    const allFailed = assembleSnapshot(
      assemblyInput({ queries: [{ id: "demand", text: "q", status: "failed", resultCount: 0, error: "http" }], sources: [] }),
    );
    expect(allFailed).toMatchObject({ status: "failed", error: "allQueriesFailed" });
    expect("snapshot" in allFailed).toBe(false);
    expect(assembleSnapshot(assemblyInput({ sources: [] }))).toMatchObject({ status: "failed", error: "noResults" });
  });

  it("refuses to emit an invalid snapshot", () => {
    const orphan = source("orphan", "pricing");
    const result = assembleSnapshot(assemblyInput({ sources: [orphan] }));
    expect(result).toMatchObject({ status: "failed", error: "invalidSnapshot" });
  });

  it("rejects inconsistent status, stats and duplicate sources", () => {
    const snap = validSnapshot();
    expect(researchSnapshotSchema.safeParse({ ...snap, status: "partial" }).success).toBe(false);
    expect(researchSnapshotSchema.safeParse({ ...snap, stats: { ...snap.stats, sourcesFound: 99 } }).success).toBe(false);
    expect(researchSnapshotSchema.safeParse({ ...snap, sources: [...snap.sources, snap.sources[0]] }).success).toBe(false);
  });
});
