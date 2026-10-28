import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { schema } from "@/lib/db/schema";
import journal from "../../drizzle/meta/_journal.json";

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export type HealthReport = {
  status: "ok" | "degraded";
  database: "ok" | "unavailable";
  /** "pending" means this build expects migrations the database has not applied yet. */
  migrations: "current" | "pending" | "unknown";
  version: string | null;
};

const CHECK_TIMEOUT_MS = 3000;

/** The newest migration this build ships, matched against drizzle's applied-migrations table. */
export const EXPECTED_MIGRATION = Math.max(...journal.entries.map((e) => e.when));

function rowsOf<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows?: T[] }).rows ?? []) as T[];
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("health check timed out")), CHECK_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Checks database reachability and migration state. Never throws; failures are reported via `onError`. */
export async function checkHealth(
  getDb: () => Db,
  onError: (scope: string, err: unknown) => void,
  env: Record<string, string | undefined> = process.env,
): Promise<HealthReport> {
  const version = env.APP_VERSION || env.VERCEL_GIT_COMMIT_SHA || null;
  let db: Db;
  try {
    db = getDb();
    await withTimeout(db.execute(sql`select 1`));
  } catch (err) {
    onError("health:database", err);
    return { status: "degraded", database: "unavailable", migrations: "unknown", version };
  }

  try {
    const result = await withTimeout(db.execute(sql`select max(created_at)::text as latest from drizzle.__drizzle_migrations`));
    const latest = Number(rowsOf<{ latest: string | null }>(result)[0]?.latest ?? 0);
    const migrations = latest >= EXPECTED_MIGRATION ? "current" : "pending";
    return { status: migrations === "current" ? "ok" : "degraded", database: "ok", migrations, version };
  } catch (err) {
    onError("health:migrations", err);
    return { status: "degraded", database: "ok", migrations: "unknown", version };
  }
}
