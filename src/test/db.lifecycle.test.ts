import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { business } from "@/lib/db/schema";
import { createTestDb, createUser, type TestDb } from "@/test/db";

describe("createTestDb lifecycle", () => {
  const handles: { db: TestDb; close: () => Promise<void> }[] = [];

  // First createTestDb in a worker runs migrate; that belongs under hookTimeout,
  // not the 30s per-test budget (full-suite contention previously timed out the it()).
  beforeAll(async () => {
    const warm = await createTestDb();
    await warm.close();
  });

  afterAll(async () => {
    for (const h of handles.splice(0)) await h.close();
  });

  it("applies migrations and isolates clones from each other", async () => {
    const a = await createTestDb();
    const b = await createTestDb();
    handles.push(a, b);

    await createUser(a.db, "alice");
    await createUser(b.db, "bob");

    // Schema from real migrations is present on both clones.
    await a.db.execute(sql`select 1 from "user" limit 1`);
    await b.db.execute(sql`select 1 from "user" limit 1`);

    // Mutations on one clone must not appear on the other.
    await a.db.insert(business).values({
      id: "biz_a",
      userId: "alice",
      status: "generating",
      input: { idea: "A", audience: "x", location: "y", budget: "1", style: "Organic / Natural" },
    });

    const onA = await a.db.select().from(business).where(eq(business.id, "biz_a"));
    const onB = await b.db.select().from(business).where(eq(business.id, "biz_a"));
    expect(onA).toHaveLength(1);
    expect(onB).toHaveLength(0);
  });

  it("closes without throwing and leaves other clones usable", async () => {
    const closing = await createTestDb();
    const survivor = await createTestDb();
    handles.push(survivor);

    await createUser(closing.db, "carol");
    await closing.close();

    await createUser(survivor.db, "dave");
    const rows = await survivor.db.execute(sql`select id from "user" where id = 'dave'`);
    expect(rows.rows?.length ?? (rows as unknown as unknown[]).length).toBeGreaterThan(0);
  });
});
