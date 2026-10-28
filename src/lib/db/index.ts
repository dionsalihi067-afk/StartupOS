import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { getServerEnv } from "@/lib/env";
import { schema } from "./schema";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as { startupDb?: ReturnType<typeof create> };

function create() {
  const client = postgres(getServerEnv().DATABASE_URL, {
    max: 10,
    // Compatible with transaction-mode connection poolers (e.g. PgBouncer, Neon pooled URLs).
    prepare: false,
  });
  return drizzle(client, { schema });
}

/** Lazily-created shared connection pool (reused across hot reloads in development). */
export function getDb(): Database {
  if (!globalForDb.startupDb) globalForDb.startupDb = create();
  return globalForDb.startupDb;
}
