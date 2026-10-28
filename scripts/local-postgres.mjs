// Development only: runs a real PostgreSQL server from npm-provided binaries so
// the app can be used locally without installing Postgres or Docker.
// Data lives in ./.local-db (git-ignored). Stop with Ctrl+C.
import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const port = Number(process.env.LOCAL_PG_PORT ?? 5433);
const databaseDir = path.resolve(".local-db");
const firstRun = !existsSync(databaseDir);

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: "postgres",
  port,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

if (firstRun) await pg.initialise();
await pg.start();
if (firstRun) await pg.createDatabase("startupos");

console.log(`Local PostgreSQL ready: postgres://postgres:postgres@localhost:${port}/startupos`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
