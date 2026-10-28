/**
 * Opt-in smoke test against the REAL configured providers (paid calls).
 * Skipped unless STARTUPOS_LIVE_AI=1. Uses synthetic input only, makes a small
 * fixed number of text requests and one search request, and never generates images.
 * Prints which fields failed validation, never credentials.
 *
 *   $env:STARTUPOS_LIVE_AI='1'; npx vitest run src/lib/ai/live-smoke.test.ts
 */
import nextEnv from "@next/env";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = process.env.STARTUPOS_LIVE_AI === "1";
if (live) {
  const env = process.env as Record<string, string | undefined>;
  const nodeEnv = env.NODE_ENV;
  // Next skips .env.local in test mode; load it the way `next dev` does.
  env.NODE_ENV = "development";
  nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error }, true);
  env.NODE_ENV = nodeEnv;
}

const RUNS = Number(process.env.STARTUPOS_LIVE_RUNS ?? 2);

describe.skipIf(!live)("real providers (opt-in)", () => {
  async function setup() {
    const { createContext } = await import("@/lib/agents/context");
    const { makePackage } = await import("@/test/db");
    const pkg = makePackage();
    const input = {
      ...pkg.input,
      idea: "Small-batch natural skincare made in Prishtina, sold online and at weekend markets",
      audience: "Women 25-40 who prefer natural products",
      location: "Prishtina, Kosovo",
      budget: "4000 €",
    };
    return { pkg, ctx: () => createContext(input) };
  }

  function capture() {
    const warnings: string[] = [];
    const spy = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    });
    return { warnings, restore: () => spy.mockRestore() };
  }

  it("Growth, Marketing and Strategy return output that validates", { timeout: 600_000 }, async () => {
    const { isLlmConfigured } = await import("@/lib/ai/client");
    expect(isLlmConfigured()).toBe(true);
    const { runGrowthAgent } = await import("@/lib/agents/growth");
    const { runMarketingAgent } = await import("@/lib/agents/marketing");
    const { runStrategyAgent } = await import("@/lib/agents/strategy");
    const { pkg, ctx } = await setup();

    const results: { agent: string; source: string; note?: string; ms: number; warnings: string[] }[] = [];
    for (let i = 0; i < RUNS; i++) {
      for (const [agent, run] of [
        ["growth", () => runGrowthAgent(ctx(), pkg.brand)],
        ["marketing", () => runMarketingAgent(ctx(), pkg.brand, pkg.persona)],
        ["strategy", () => runStrategyAgent(ctx())],
      ] as const) {
        const c = capture();
        const t0 = Date.now();
        const out = await run();
        c.restore();
        results.push({ agent, source: out.source, note: out.note, ms: Date.now() - t0, warnings: c.warnings });
      }
    }
    for (const r of results) console.log(`[live] ${r.agent} source=${r.source} note=${r.note ?? "-"} ms=${r.ms} ${r.warnings.join(" | ")}`);
    expect(results.filter((r) => r.note && r.note !== "partial")).toEqual([]);
  });

  it("the configured search provider answers one query", { timeout: 60_000 }, async () => {
    const { getSearchProvider, webSearch } = await import("@/lib/services/search");
    const provider = getSearchProvider();
    expect(provider).not.toBeNull();
    const t0 = Date.now();
    const res = await webSearch("natural skincare shops Prishtina", 3);
    console.log(`[live] search provider=${provider} results=${res?.results.length ?? "none"} ms=${Date.now() - t0}`);
    expect(res?.results.length ?? 0).toBeGreaterThan(0);
  });
});
