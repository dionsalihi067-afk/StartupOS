/**
 * Phase Nine scenario matrix (deterministic, no providers configured).
 * Radically different business ideas must each produce a coherent, parseable
 * package that (a) preserves the user's actual idea/market, (b) never invents
 * competitors, market facts, or research that did not happen, and (c) records
 * honestly that every step ran on the deterministic engine.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { orchestrate } from "@/lib/orchestrator";
import { parseBusinessPackage } from "@/lib/package-schema";
import type { BusinessPackage, OrchestrationEvent } from "@/lib/types";
import { sampleInput } from "@/test/research";

beforeEach(() => {
  for (const key of ["OPENAI_API_KEY", "TAVILY_API_KEY", "SERPER_API_KEY", "BRAVE_API_KEY"]) vi.stubEnv(key, "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function generate(input: ReturnType<typeof sampleInput>): Promise<BusinessPackage> {
  let result: BusinessPackage | undefined;
  for await (const event of orchestrate(input) as AsyncGenerator<OrchestrationEvent>) {
    if (event.type === "complete") result = event.result;
    if (event.type === "error") throw new Error("generation failed");
  }
  if (!result) throw new Error("generation did not complete");
  return result;
}

const SCENARIOS: { name: string; input: ReturnType<typeof sampleInput> }[] = [
  {
    name: "clothing e-commerce in Kosovo",
    input: sampleInput({
      business: { name: "Veshje", idea: "Online clothing brand selling streetwear", type: "online", category: "ecommerce", location: "Prishtina, Kosovo" },
      customer: { ideal: "Young adults 18-30", type: "b2c" },
      model: { revenue: ["oneTime"] },
    }),
  },
  {
    name: "SaaS for small businesses",
    input: sampleInput({
      business: { name: "Taskora", idea: "Invoicing and scheduling SaaS for tradespeople", type: "online", category: "software", location: "Berlin, Germany" },
      customer: { ideal: "Small trades businesses", type: "b2b" },
      model: { revenue: ["subscription"] },
    }),
  },
  {
    name: "local restaurant",
    input: sampleInput({
      business: { name: "Furra", idea: "Neighborhood restaurant serving traditional food", type: "physical", category: "food", location: "Shkodra, Albania" },
      customer: { ideal: "Local families", type: "b2c" },
      model: { revenue: ["oneTime"] },
    }),
  },
  {
    name: "web-development agency",
    input: sampleInput({
      business: { name: "Studio Veri", idea: "Web development agency for startups", type: "online", category: "services", location: "Tirana, Albania" },
      customer: { ideal: "Early-stage founders", type: "b2b" },
      model: { revenue: ["oneTime"] },
    }),
  },
  {
    name: "physical manufacturing",
    input: sampleInput({
      business: { name: "Fabrika Jone", idea: "Small factory producing wooden furniture", type: "physical", category: "general", location: "Peja, Kosovo" },
      customer: { ideal: "Furniture retailers", type: "b2b" },
      model: { revenue: ["oneTime"] },
    }),
  },
  {
    name: "two-sided marketplace",
    input: sampleInput({
      business: { name: "Tregu", idea: "Marketplace connecting home cooks with buyers", type: "online", category: "general", location: "Prishtina, Kosovo" },
      customer: { ideal: "Home cooks and busy families", type: "b2c" },
      model: { revenue: ["commission"] },
    }),
  },
  {
    name: "limited public research market",
    input: sampleInput({
      business: { name: "Kafe Fieri", idea: "Specialty coffee shop", type: "physical", category: "food", location: "Fier, Albania" },
      customer: { ideal: "Local coffee drinkers", type: "b2c" },
    }),
  },
];

describe("diverse business scenarios without providers", () => {
  it("produces coherent, honest packages for every scenario", { timeout: 300_000 }, async () => {
    for (const scenario of SCENARIOS) {
      const pkg = await generate(scenario.input);
      const parsed = parseBusinessPackage(pkg);
      expect(parsed, scenario.name).not.toBeNull();
      const p = parsed!;

      // The user's actual business is preserved, not replaced by a template business.
      expect(p.input.idea, scenario.name).toBe(scenario.input.idea);
      expect(p.input.location, scenario.name).toBe(scenario.input.location);
      expect(p.brand.name.length, scenario.name).toBeGreaterThan(0);

      // Honest provenance: no provider was configured, so nothing may claim otherwise.
      expect(p.meta.engine, scenario.name).toBe("deterministic");
      expect(p.meta.agentLog.length, scenario.name).toBeGreaterThanOrEqual(14);
      expect(p.meta.agentLog.every((l) => l.source === "deterministic"), scenario.name).toBe(true);

      // No invented research: without a search provider there are no competitors or market facts.
      expect(p.competitors.available, scenario.name).toBe(false);
      expect(p.competitors.competitors, scenario.name).toEqual([]);
      expect(p.competitors.sources, scenario.name).toEqual([]);
      expect(p.marketResearch.available, scenario.name).toBe(false);
      expect(p.marketResearch.sources, scenario.name).toEqual([]);

      // No fabricated social proof or pricing theatre.
      const all = JSON.stringify(p);
      expect(all, scenario.name).not.toMatch(/trusted by thousands|guaranteed results|most popular/i);
    }
  });

  it("treats insufficient information honestly instead of inventing a market", { timeout: 120_000 }, async () => {
    const pkg = await generate(
      sampleInput({
        business: { name: "Mystery", idea: "A business", location: "Unspecified" },
        customer: { ideal: "Anyone", type: "b2c" },
      }),
    );
    const p = parseBusinessPackage(pkg)!;
    expect(p).not.toBeNull();
    expect(p.competitors.available).toBe(false);
    // Unknown location must not silently become a specific foreign market.
    expect(JSON.stringify(p.website.seo)).not.toMatch(/United States|New York|Los Angeles/);
    expect(p.meta.quality?.outcome).toMatch(/^(success|provisional|degraded)$/);
  });
});
