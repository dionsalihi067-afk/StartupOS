/**
 * Focused live check for growth (Astra) + email (Sol) after parallel-wave timeouts.
 * Opt-in: $env:STARTUPOS_LIVE_REPAIR='1'; npx vitest run src/lib/ai/live-growth-email.test.ts
 */
import nextEnv from "@next/env";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = process.env.STARTUPOS_LIVE_REPAIR === "1";
if (live) {
  const env = process.env as Record<string, string | undefined>;
  const nodeEnv = env.NODE_ENV;
  env.NODE_ENV = "development";
  nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error }, true);
  env.NODE_ENV = nodeEnv;
}

describe.skipIf(!live)("live growth + email repair (opt-in)", () => {
  it("growth and email complete via OpenAI without timeout fallback", { timeout: 600_000 }, async () => {
    const { createContext } = await import("@/lib/agents/context");
    const { makePackage } = await import("@/test/db");
    const { runGrowthAgent } = await import("@/lib/agents/growth");
    const { runEmailAgent } = await import("@/lib/agents/email");

    const pkg = makePackage();
    const input = {
      ...pkg.input,
      idea: "Small-batch natural skincare made in Prishtina, sold online and at weekend markets",
      audience: "Women 25-40 who prefer natural products",
      location: "Prishtina, Kosovo",
      budget: "4000 €",
    };
    const ctx = createContext(input);
    ctx.brand = pkg.brand;
    ctx.persona = pkg.persona;
    ctx.pricing = pkg.pricing;

    const t0 = Date.now();
    const [growth, email] = await Promise.all([
      runGrowthAgent(ctx, pkg.brand),
      runEmailAgent(ctx, pkg.brand),
    ]);
    console.log(
      `[live-repair] growth source=${growth.source} note=${growth.note ?? "-"} model=${growth.modelId ?? "-"} ms=${Date.now() - t0}`,
    );
    console.log(
      `[live-repair] email source=${email.source} note=${email.note ?? "-"} model=${email.modelId ?? "-"}`,
    );

    expect(growth.source).toBe("llm");
    expect(growth.note ?? "").not.toMatch(/timeout/);
    expect(growth.data.phases.length).toBeGreaterThan(0);
    expect(email.source).toBe("llm");
    expect(email.note ?? "").not.toMatch(/timeout/);
  });
});
