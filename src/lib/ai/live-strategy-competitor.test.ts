/**
 * Focused live repair check after strategy/competitor timeouts.
 * Opt-in: $env:STARTUPOS_LIVE_REPAIR='1'; npx vitest run src/lib/ai/live-strategy-competitor.test.ts
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

const BRIEF = {
  idea: "Small-batch natural skincare made in Prishtina, sold online and at weekend markets",
  audience: "Women 25-40 who prefer natural products and transparent ingredients",
  location: "Prishtina, Kosovo",
  budget: "4000 €",
  style: "Organic / Natural",
} as const;

describe.skipIf(!live)("live strategy + competitor repair (opt-in)", () => {
  it("competitor and strategy complete via OpenAI without timeout fallback", { timeout: 600_000 }, async () => {
    const { resolveLlmProvider } = await import("@/lib/ai/provider");
    const { resolveChatModelForTask } = await import("@/lib/ai/routing");
    const { researchForGeneration } = await import("@/lib/research/generation");
    const { createContext } = await import("@/lib/agents/context");
    const { runCompetitorAgent } = await import("@/lib/agents/competitor");
    const { runStrategyAgent } = await import("@/lib/agents/strategy");
    const { runPricingAgent } = await import("@/lib/agents/pricing");

    const provider = resolveLlmProvider();
    expect(provider.kind).toBe("openai");
    expect(resolveChatModelForTask("reasoning", { provider }).modelId).toBe("gpt-6-astra");

    const research = await researchForGeneration({ ...BRIEF });
    expect(research.status === "complete" || research.status === "partial").toBe(true);

    const ctx = createContext({ ...BRIEF }, { research });
    const tComp = Date.now();
    const competitors = await runCompetitorAgent(ctx);
    const competitorMs = Date.now() - tComp;
    ctx.competitors = competitors.data;
    console.log(
      `[live-repair] competitor source=${competitors.source} note=${competitors.note ?? "-"} model=${competitors.modelId ?? "-"} ms=${competitorMs}`,
    );
    expect(competitors.source).toBe("llm");
    expect(competitors.note).toBeUndefined();

    const pricing = await runPricingAgent(ctx);
    ctx.pricing = pricing.data;

    const tStrat = Date.now();
    const strategy = await runStrategyAgent(ctx);
    const strategyMs = Date.now() - tStrat;
    console.log(
      `[live-repair] strategy source=${strategy.source} note=${strategy.note ?? "-"} model=${strategy.modelId ?? "-"} ms=${strategyMs}`,
    );
    expect(strategy.source).toBe("llm");
    expect(strategy.note ?? "").not.toMatch(/timeout/);
    expect(strategy.data.executive.summary.length).toBeGreaterThan(20);
    expect(strategy.modelId).toBe("gpt-6-astra");
  });
});
