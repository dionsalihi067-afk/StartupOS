/**
 * Phase 6 — real persistence round-trip for packages + quality metadata.
 * Uses in-process PGlite with production migrations (not mocks of the repository).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { eq } from "drizzle-orm";
import { business } from "@/lib/db/schema";
import { packageQuality, type GenerationQuality } from "@/lib/generation-quality";
import { parseBusinessPackage } from "@/lib/package-schema";
import type { BusinessPackage } from "@/lib/types";
import { createTestDb, createUser, makePackage, type TestDb } from "@/test/db";
import {
  completeGeneration,
  createGeneratingBusiness,
  deleteBusiness,
  failGeneration,
  getBusiness,
} from "./repository";

let db: TestDb;
let close: () => Promise<void>;

const OWNER = "persist-alice";

function withQuality(quality: GenerationQuality, agentLog: BusinessPackage["meta"]["agentLog"] = []): BusinessPackage {
  const base = makePackage();
  return {
    ...base,
    meta: {
      ...base.meta,
      agentLog,
      quality,
    },
  };
}

function withoutQuality(agentLog: BusinessPackage["meta"]["agentLog"] = []): BusinessPackage {
  const base = makePackage();
  return {
    ...base,
    meta: {
      engine: base.meta.engine,
      searchProvider: base.meta.searchProvider,
      durationMs: base.meta.durationMs,
      agentLog,
    },
  };
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await createUser(db, OWNER);
});

afterAll(async () => {
  await close();
});

describe("package persistence round-trip (real PGlite)", () => {
  it("saves and retrieves a successful package with quality metadata intact", async () => {
    const quality: GenerationQuality = { outcome: "success", limitations: ["logoUnavailable", "researchLimited"] };
    const generated = withQuality(quality);

    const id = await createGeneratingBusiness(db, OWNER, generated.input);
    const stored = await completeGeneration(db, OWNER, id, generated);
    expect(stored).not.toBeNull();
    expect(stored!.meta.quality).toEqual(quality);

    const detail = await getBusiness(db, OWNER, id);
    expect(detail?.status).toBe("ready");
    expect(detail?.package).not.toBeNull();
    expect(detail!.package!.brand.name).toBe("Kafeja");
    expect(detail!.package!.input.location).toBe("Prishtinë");
    expect(detail!.package!.meta.quality).toEqual(quality);
    // Read-time merge may add newly detected limitations (e.g. thinEvidence) without upgrading outcome.
    const live = packageQuality(detail!.package!);
    expect(live.outcome).toBe("success");
    expect(live.limitations).toEqual(expect.arrayContaining(["logoUnavailable", "researchLimited"]));

    const reparsed = parseBusinessPackage(detail!.package);
    expect(reparsed?.meta.quality).toEqual(quality);

    expect(await deleteBusiness(db, OWNER, id)).toBe(true);
  });

  it("keeps degraded status after persistence (does not promote to success)", async () => {
    const quality: GenerationQuality = {
      outcome: "degraded",
      limitations: ["criticalFallback", "logoUnavailable"],
    };
    const generated = withQuality(quality, [
      { agent: "Website Agent", status: "fallback", source: "deterministic", durationMs: 1, note: "llm-invalid-output" },
    ]);

    const id = await createGeneratingBusiness(db, OWNER, generated.input);
    expect(await completeGeneration(db, OWNER, id, generated)).not.toBeNull();

    const detail = await getBusiness(db, OWNER, id);
    expect(detail?.status).toBe("ready");
    expect(detail!.package!.meta.quality).toEqual(quality);
    expect(packageQuality(detail!.package!).outcome).toBe("degraded");
    expect(packageQuality(detail!.package!).limitations).toContain("criticalFallback");

    expect(await deleteBusiness(db, OWNER, id)).toBe(true);
  });

  it("loads historical packages without meta.quality and derives quality", async () => {
    const historical = withoutQuality([
      { agent: "Website Agent", status: "fallback", source: "deterministic", durationMs: 2, note: "llm-invalid-output" },
    ]);
    expect(historical.meta.quality).toBeUndefined();

    const id = await createGeneratingBusiness(db, OWNER, historical.input);
    const stored = await completeGeneration(db, OWNER, id, historical);
    expect(stored).not.toBeNull();
    expect(stored!.meta.quality).toBeUndefined();

    const detail = await getBusiness(db, OWNER, id);
    expect(detail?.status).toBe("ready");
    expect(detail!.package!.meta.quality).toBeUndefined();
    // Derived — does not rewrite storage.
    expect(packageQuality(detail!.package!).outcome).toBe("degraded");
    expect(packageQuality(detail!.package!).limitations).toContain("criticalFallback");

    const [row] = await db.select({ package: business.package }).from(business).where(eq(business.id, id));
    expect((row?.package as BusinessPackage | null)?.meta?.quality).toBeUndefined();

    expect(await deleteBusiness(db, OWNER, id)).toBe(true);
  });

  it("rejects invalid packages at completeGeneration (JSON column acceptance ≠ app validity)", async () => {
    const id = await createGeneratingBusiness(db, OWNER, makePackage().input);
    const broken = { ...makePackage(), brand: { name: "" } } as unknown as BusinessPackage;

    expect(await completeGeneration(db, OWNER, id, broken)).toBeNull();
    expect(await getBusiness(db, OWNER, id)).toMatchObject({
      status: "failed",
      errorCode: "invalidData",
      package: null,
    });

    // Even a raw jsonb write of corrupt data is treated as failed on read.
    const rawId = await createGeneratingBusiness(db, OWNER, makePackage().input);
    await db
      .update(business)
      .set({ status: "ready", package: { not: "a-package" } as unknown as BusinessPackage, errorCode: null })
      .where(eq(business.id, rawId));
    expect(await getBusiness(db, OWNER, rawId)).toMatchObject({
      status: "failed",
      errorCode: "invalidData",
      package: null,
    });

    expect(await deleteBusiness(db, OWNER, id)).toBe(true);
    expect(await deleteBusiness(db, OWNER, rawId)).toBe(true);
  });

  it("does not report successful persistence when the generating row cannot be updated", async () => {
    const gone = await createGeneratingBusiness(db, OWNER, makePackage().input);
    await deleteBusiness(db, OWNER, gone);
    expect(await completeGeneration(db, OWNER, gone, withQuality({ outcome: "success", limitations: [] }))).toBeNull();

    const settled = await createGeneratingBusiness(db, OWNER, makePackage().input);
    expect(await failGeneration(db, OWNER, settled, "generationFailed")).toBe(true);
    expect(await completeGeneration(db, OWNER, settled, withQuality({ outcome: "success", limitations: [] }))).toBeNull();
    expect(await getBusiness(db, OWNER, settled)).toMatchObject({
      status: "failed",
      errorCode: "generationFailed",
      package: null,
    });

    const ready = await createGeneratingBusiness(db, OWNER, makePackage().input);
    const first = withQuality({ outcome: "degraded", limitations: ["criticalFallback"] });
    expect(await completeGeneration(db, OWNER, ready, first)).not.toBeNull();
    // Second complete must not overwrite a settled ready package.
    const attempt = withQuality({ outcome: "success", limitations: [] });
    expect(await completeGeneration(db, OWNER, ready, attempt)).toBeNull();
    expect((await getBusiness(db, OWNER, ready))!.package!.meta.quality).toEqual({
      outcome: "degraded",
      limitations: ["criticalFallback"],
    });

    expect(await deleteBusiness(db, OWNER, settled)).toBe(true);
    expect(await deleteBusiness(db, OWNER, ready)).toBe(true);
  });
});

describe("unknown location compatibility (no schema change)", () => {
  it("rejects empty location at the package validation boundary", async () => {
    const emptyLocation = makePackage({
      input: { ...makePackage().input, location: "" },
    });
    expect(parseBusinessPackage(emptyLocation)).toBeNull();

    const id = await createGeneratingBusiness(db, OWNER, { ...makePackage().input, location: "XX" });
    expect(await completeGeneration(db, OWNER, id, emptyLocation)).toBeNull();
    expect(await getBusiness(db, OWNER, id)).toMatchObject({ status: "failed", errorCode: "invalidData" });
    expect(await deleteBusiness(db, OWNER, id)).toBe(true);
  });

  it("can save and retrieve a package using the Unspecified placeholder without treating it as a verified place", async () => {
    // Product limitation: schema requires location min length 2; tests/docs use "Unspecified"
    // as an explicit unknown-market token — not a physical address.
    const unknownMarket = makePackage({
      input: { ...makePackage().input, location: "Unspecified" },
      meta: {
        engine: "deterministic",
        searchProvider: null,
        durationMs: 1,
        agentLog: [],
        quality: { outcome: "success", limitations: ["researchLimited"] },
      },
    });

    const id = await createGeneratingBusiness(db, OWNER, unknownMarket.input);
    expect(await completeGeneration(db, OWNER, id, unknownMarket)).not.toBeNull();

    const detail = await getBusiness(db, OWNER, id);
    expect(detail?.status).toBe("ready");
    expect(detail!.package!.input.location).toBe("Unspecified");
    expect(detail!.package!.meta.quality?.outcome).toBe("success");
    // Placeholder must not be rewritten into a real market during persistence.
    expect(detail!.package!.input.location).not.toMatch(/Kosovo|Prishtin|Albania/i);

    expect(await deleteBusiness(db, OWNER, id)).toBe(true);
  });
});
