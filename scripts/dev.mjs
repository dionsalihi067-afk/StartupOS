// Development entry point (`npm run dev`).
//
// Why this exists: with the local setup, the app database is an embedded
// PostgreSQL (`npm run db:local`) that must be started separately. Forgetting
// it made every sign-up/sign-in fail with a generic auth error while the real
// cause (database connection refused) was invisible. This wrapper removes
// that trap: when DATABASE_URL points at the local embedded server, it starts
// that server (if it is not already running) before starting Next.js, and
// stops it again when the dev server exits. Any other DATABASE_URL (hosted
// or external PostgreSQL) is left completely alone — Next.js starts directly.
//
// No environment values are printed.
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const root = process.cwd();
const require = createRequire(import.meta.url);

/** Minimal .env reader (values are used, never logged). */
function readEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function effectiveEnv() {
  return {
    ...readEnvFile(path.join(root, ".env")),
    ...readEnvFile(path.join(root, ".env.local")),
    ...process.env,
  };
}

function canConnect(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host }, () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

async function waitForPort(port, host, timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await canConnect(port, host)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const children = new Set();
function run(command, args, opts = {}) {
  const child = spawn(command, args, { stdio: "inherit", ...opts });
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
}
function stopChildren() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

// 1. Make sure local configuration exists (setup script never overwrites values).
if (!existsSync(path.join(root, ".env.local"))) {
  console.log("[dev] No .env.local found — running npm run setup:local first.");
  const res = spawnSync(process.execPath, [path.join(root, "scripts/setup-local-env.mjs")], { stdio: "inherit" });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

// 2. Start the embedded PostgreSQL when (and only when) the configured
//    database is the local one and it is not already listening.
const env = effectiveEnv();
const localPgPort = Number(env.LOCAL_PG_PORT ?? 5433);
let dbChild = null;
try {
  const url = new URL(env.DATABASE_URL ?? "");
  const isLoopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  const port = Number(url.port || 5432);
  if (isLoopback && port === localPgPort) {
    if (await canConnect(port, "127.0.0.1")) {
      console.log("[dev] Local PostgreSQL is already running.");
    } else {
      console.log("[dev] Starting local PostgreSQL (scripts/local-postgres.mjs)…");
      dbChild = run(process.execPath, [path.join(root, "scripts/local-postgres.mjs")]);
      dbChild.on("exit", (code) => {
        if (code && !shuttingDown) {
          console.error("[dev] Local PostgreSQL exited unexpectedly. Stopping.");
          shutdown(code);
        }
      });
      if (!(await waitForPort(port, "127.0.0.1"))) {
        console.error("[dev] Local PostgreSQL did not become ready in time.");
        shutdown(1);
      }
      console.log("[dev] Local PostgreSQL is ready. Run `npm run db:migrate` once if sign-in reports missing tables.");
    }
  }
} catch {
  // Unparseable/missing DATABASE_URL: let Next.js surface the app's own
  // configuration error rather than guessing here.
}

// 3. Start Next.js (Turbopack), forwarding any extra CLI args.
const nextBin = require.resolve("next/dist/bin/next");
const next = run(process.execPath, [nextBin, "dev", "--turbopack", ...process.argv.slice(2)]);

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (dbChild && !dbChild.killed) dbChild.kill();
  stopChildren();
  process.exit(code ?? 0);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
next.on("exit", (code) => shutdown(code ?? 0));
