import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { checkHealth, EXPECTED_MIGRATION } from "@/lib/health";
import { createTestDb, type TestDb } from "@/test/db";

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});

afterAll(async () => {
  await close();
});

describe("checkHealth", () => {
  it("reports ok for a reachable, fully migrated database", async () => {
    const onError = vi.fn();
    const report = await checkHealth(() => db, onError, { APP_VERSION: "abc123" });
    expect(report).toEqual({ status: "ok", database: "ok", migrations: "current", version: "abc123" });
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports pending migrations when the database is behind this build", async () => {
    await db.execute(sql`delete from drizzle.__drizzle_migrations where created_at = ${EXPECTED_MIGRATION}`);
    const report = await checkHealth(() => db, vi.fn(), {});
    expect(report).toMatchObject({ status: "degraded", database: "ok", migrations: "pending", version: null });
  });

  it("reports an unreachable database without leaking the error", async () => {
    const onError = vi.fn();
    const failing = () => {
      throw new Error("connect ECONNREFUSED postgres://user:secret@db:5432");
    };
    const report = await checkHealth(failing as never, onError, {});
    expect(report).toEqual({ status: "degraded", database: "unavailable", migrations: "unknown", version: null });
    expect(JSON.stringify(report)).not.toContain("secret");
    expect(onError).toHaveBeenCalledWith("health:database", expect.any(Error));
  });
});
