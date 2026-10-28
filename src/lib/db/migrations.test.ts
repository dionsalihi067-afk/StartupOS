import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { schema } from "@/lib/db/schema";
import { createTestDb, type TestDb } from "@/test/db";

const folder = path.resolve(__dirname, "../../../drizzle");
const journal = JSON.parse(readFileSync(path.join(folder, "meta/_journal.json"), "utf8")) as {
  entries: { idx: number; when: number; tag: string }[];
};

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});

afterAll(async () => {
  await close();
});

describe("migration journal", () => {
  it("lists every migration file in order", () => {
    journal.entries.forEach((entry, i) => {
      expect(entry.idx).toBe(i);
      expect(existsSync(path.join(folder, `${entry.tag}.sql`))).toBe(true);
    });
  });

  // The migrator skips any migration whose timestamp is not newer than the last one applied.
  it("uses strictly increasing timestamps that are not in the future", () => {
    const whens = journal.entries.map((e) => e.when);
    for (let i = 1; i < whens.length; i++) expect(whens[i]).toBeGreaterThan(whens[i - 1]!);
    expect(Math.max(...whens)).toBeLessThanOrEqual(Date.now());
  });

  it("keeps the latest drizzle-kit snapshot in step with the schema", () => {
    const snapshots = journal.entries
      .map((e) => path.join(folder, "meta", `${e.tag.slice(0, 4)}_snapshot.json`))
      .filter((file) => existsSync(file));
    const latest = JSON.parse(readFileSync(snapshots.at(-1)!, "utf8")) as { tables: Record<string, { columns: Record<string, unknown> }> };
    for (const table of Object.values(schema) as PgTable[]) {
      const config = getTableConfig(table);
      const snap = latest.tables[`public.${config.name}`];
      expect(snap, config.name).toBeDefined();
      expect(Object.keys(snap!.columns).sort()).toEqual(config.columns.map((c) => c.name).sort());
    }
  });
});

describe("migrated database", () => {
  it("creates the (user_id, status, created_at, id) index used by export and stale-generation recovery", async () => {
    const rows = await db.execute<{ indexname: string; indexdef: string }>(
      sql`select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname = 'business_user_status_created_idx'`,
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]!.indexdef).toContain("user_id");
    expect(rows.rows[0]!.indexdef).toContain("status");
    expect(rows.rows[0]!.indexdef).toContain("created_at");
  });

  it("can use the new index for the export query shape (EXPLAIN, seqscan disabled)", async () => {
    await db.execute(sql`set enable_seqscan = off`);
    try {
      const rows = await db.execute<Record<string, string>>(
        sql`explain select id, created_at, package from business where user_id = 'alice' and status = 'ready' order by created_at desc, id desc limit 20`,
      );
      const plan = rows.rows.map((r) => Object.values(r).join(" ")).join("\n");
      expect(plan).toContain("business_user_status_created_idx");
    } finally {
      await db.execute(sql`set enable_seqscan = on`);
    }
  });

  it("has every table and column the schema defines", async () => {
    const rows = await db.execute<{ table_name: string; column_name: string }>(
      sql`select table_name, column_name from information_schema.columns where table_schema = 'public'`,
    );
    const actual = new Set(rows.rows.map((r) => `${r.table_name}.${r.column_name}`));
    for (const table of Object.values(schema) as PgTable[]) {
      const config = getTableConfig(table);
      for (const column of config.columns) expect(actual.has(`${config.name}.${column.name}`), `${config.name}.${column.name}`).toBe(true);
    }
  });
});
