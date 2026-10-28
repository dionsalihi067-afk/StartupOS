import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

const cpuCount = os.cpus()?.length ?? 4;
const maxForks = Math.max(2, Math.min(4, cpuCount - 1));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
    // First PGlite boot + migrate per worker can exceed 60s under heavy load;
    // subsequent createTestDb calls clone the migrated template (see src/test/db.ts).
    hookTimeout: 120_000,
    // Cap fork workers so many WASM DBs are not created at once on constrained hosts.
    pool: "forks",
    poolOptions: {
      forks: { maxForks },
    },
  },
});
