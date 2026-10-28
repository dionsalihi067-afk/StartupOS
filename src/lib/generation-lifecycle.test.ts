/**
 * Phase 7 — terminal-state and stale-threshold safety at the repository boundary.
 * Sequential controlled races (not a load/concurrency stress suite).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { sql } from "drizzle-orm";
import {
  completeGeneration,
  createGeneratingBusiness,
  createGeneratingHeartbeat,
  failGeneration,
  GENERATION_HEARTBEAT_MIN_INTERVAL_MS,
  GENERATION_ROUTE_MAX_MS,
  GENERATION_SOFT_DEADLINE_MS,
  getBusiness,
  recoverStaleGenerations,
  STALE_GENERATION_MS,
  touchGeneratingBusiness,
} from "@/lib/businesses/repository";
import { createTestDb, createUser, makePackage, type TestDb } from "@/test/db";

let db: TestDb;
let close: () => Promise<void>;
const OWNER = "lifecycle-owner";

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await createUser(db, OWNER);
});

afterAll(async () => {
  await close();
});

describe("generation terminal-state safety", () => {
  it("keeps route maxDuration and stale threshold aligned (stale > route limit)", () => {
    // route.ts export const maxDuration = 300 — keep repository constants in lockstep.
    expect(GENERATION_ROUTE_MAX_MS).toBe(300_000);
    expect(GENERATION_SOFT_DEADLINE_MS).toBeLessThan(GENERATION_ROUTE_MAX_MS);
    expect(GENERATION_SOFT_DEADLINE_MS).toBeGreaterThan(120_000);
    expect(STALE_GENERATION_MS).toBeGreaterThan(GENERATION_ROUTE_MAX_MS);
    expect(GENERATION_HEARTBEAT_MIN_INTERVAL_MS).toBeLessThan(STALE_GENERATION_MS);
  });

  it("settles exactly once when heartbeat, completion, and recovery race", async () => {
    const id = await createGeneratingBusiness(db, OWNER, makePackage().input);
    const pkg = makePackage({ brand: { ...makePackage().brand, name: "RaceWinner" } });
    const [touchA, completed, touchB, recovered] = await Promise.all([
      touchGeneratingBusiness(db, OWNER, id),
      completeGeneration(db, OWNER, id, pkg),
      touchGeneratingBusiness(db, OWNER, id),
      recoverStaleGenerations(db, OWNER),
    ]);
    expect(touchA || completed !== null || touchB).toBe(true);
    expect(recovered).toBe(0);
    const detail = await getBusiness(db, OWNER, id);
    expect(detail?.status).toBe("ready");
    expect(detail?.package?.brand.name).toBe("RaceWinner");
    expect(await completeGeneration(db, OWNER, id, makePackage({ brand: { ...makePackage().brand, name: "Late" } }))).toBeNull();
    expect(await touchGeneratingBusiness(db, OWNER, id)).toBe(false);
    expect((await getBusiness(db, OWNER, id))!.package!.brand.name).toBe("RaceWinner");
  });

  it("lets only one of stale recovery or late completion win", async () => {
    const id = await createGeneratingBusiness(db, OWNER, makePackage().input);
    await db.execute(sql`update business set updated_at = now() - interval '1 hour' where id = ${id}`);
    const [recovered, completed] = await Promise.all([
      recoverStaleGenerations(db, OWNER),
      completeGeneration(db, OWNER, id, makePackage()),
    ]);
    expect(recovered + (completed ? 1 : 0)).toBe(1);
    const detail = await getBusiness(db, OWNER, id);
    expect(detail?.status === "ready" || detail?.status === "failed").toBe(true);
    if (detail?.status === "failed") {
      expect(detail.errorCode).toBe("interrupted");
      expect(detail.package).toBeNull();
    } else {
      expect(detail?.package).not.toBeNull();
    }
  });

  it("lets a heartbeating generation finish after the stale window would have elapsed", async () => {
    const id = await createGeneratingBusiness(db, OWNER, makePackage().input);
    await db.execute(sql`update business set updated_at = now() - interval '1 hour' where id = ${id}`);
    expect(await touchGeneratingBusiness(db, OWNER, id)).toBe(true);
    expect(await recoverStaleGenerations(db, OWNER)).toBe(0);
    expect(await completeGeneration(db, OWNER, id, makePackage())).not.toBeNull();
    expect(await getBusiness(db, OWNER, id)).toMatchObject({ status: "ready" });
  });

  it("does not touch ready/failed rows and reports false when generation already settled", async () => {
    const ready = await createGeneratingBusiness(db, OWNER, makePackage().input);
    await completeGeneration(db, OWNER, ready, makePackage());
    expect(await touchGeneratingBusiness(db, OWNER, ready)).toBe(false);

    const failed = await createGeneratingBusiness(db, OWNER, makePackage().input);
    await failGeneration(db, OWNER, failed, "generationFailed");
    expect(await touchGeneratingBusiness(db, OWNER, failed)).toBe(false);
  });

  it("throttles heartbeats and surfaces a settled row on the next forced pulse", async () => {
    const id = await createGeneratingBusiness(db, OWNER, makePackage().input);
    const touches: boolean[] = [];
    const heartbeat = createGeneratingHeartbeat(async () => {
      const ok = await touchGeneratingBusiness(db, OWNER, id);
      touches.push(ok);
      return ok;
    }, 60_000);

    expect(await heartbeat.pulse(true)).toBe(true);
    expect(await heartbeat.pulse()).toBe(true); // throttled — no second DB write
    expect(touches).toEqual([true]);

    await failGeneration(db, OWNER, id, "interrupted");
    expect(await heartbeat.pulse(true)).toBe(false);
    expect(touches).toEqual([true, false]);
  });

  it("does not let a late failure overwrite a ready package (sequential race)", async () => {
    const id = await createGeneratingBusiness(db, OWNER, makePackage().input);
    const pkg = makePackage({
      meta: {
        engine: "deterministic",
        searchProvider: null,
        durationMs: 1,
        agentLog: [],
        quality: { outcome: "degraded", limitations: ["criticalFallback"] },
      },
    });
    expect(await completeGeneration(db, OWNER, id, pkg)).not.toBeNull();
    expect(await failGeneration(db, OWNER, id, "generationFailed")).toBe(false);
    const detail = await getBusiness(db, OWNER, id);
    expect(detail).toMatchObject({ status: "ready" });
    expect(detail!.package!.meta.quality).toEqual({ outcome: "degraded", limitations: ["criticalFallback"] });
  });

  it("does not let a late success overwrite a failed generation (sequential race)", async () => {
    const id = await createGeneratingBusiness(db, OWNER, makePackage().input);
    expect(await failGeneration(db, OWNER, id, "generationFailed")).toBe(true);
    expect(await completeGeneration(db, OWNER, id, makePackage())).toBeNull();
    expect(await getBusiness(db, OWNER, id)).toMatchObject({ status: "failed", errorCode: "generationFailed", package: null });
  });

  it("ignores duplicate completion attempts after the first settle", async () => {
    const id = await createGeneratingBusiness(db, OWNER, makePackage().input);
    const first = makePackage({
      brand: { ...makePackage().brand, name: "FirstSettle" },
      meta: {
        engine: "deterministic",
        searchProvider: null,
        durationMs: 1,
        agentLog: [],
        quality: { outcome: "success", limitations: [] },
      },
    });
    const second = makePackage({
      brand: { ...makePackage().brand, name: "SecondAttempt" },
      meta: {
        engine: "deterministic",
        searchProvider: null,
        durationMs: 1,
        agentLog: [],
        quality: { outcome: "success", limitations: [] },
      },
    });
    expect(await completeGeneration(db, OWNER, id, first)).not.toBeNull();
    expect(await completeGeneration(db, OWNER, id, second)).toBeNull();
    expect((await getBusiness(db, OWNER, id))!.package!.brand.name).toBe("FirstSettle");
  });

  it("does not mark ready/failed rows stale, and late complete cannot revive an interrupted row", async () => {
    const ready = await createGeneratingBusiness(db, OWNER, makePackage().input);
    await completeGeneration(db, OWNER, ready, makePackage());
    const failed = await createGeneratingBusiness(db, OWNER, makePackage().input);
    await failGeneration(db, OWNER, failed, "generationFailed");
    const stale = await createGeneratingBusiness(db, OWNER, makePackage().input);

    await db.execute(
      sql`update business set updated_at = now() - interval '1 hour' where id in (${ready}, ${failed}, ${stale})`,
    );

    expect(await recoverStaleGenerations(db, OWNER)).toBe(1);
    expect(await getBusiness(db, OWNER, ready)).toMatchObject({ status: "ready" });
    expect(await getBusiness(db, OWNER, failed)).toMatchObject({ status: "failed", errorCode: "generationFailed" });
    expect(await getBusiness(db, OWNER, stale)).toMatchObject({ status: "failed", errorCode: "interrupted" });
    expect(await completeGeneration(db, OWNER, stale, makePackage())).toBeNull();
    expect(await getBusiness(db, OWNER, stale)).toMatchObject({ status: "failed", errorCode: "interrupted", package: null });
  });
});
