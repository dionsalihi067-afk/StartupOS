/**
 * Deterministic output-quality evaluation harness.
 * Uses the real orchestrator with providers disabled — never claims live AI quality.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { agentProvenance } from "@/lib/client/insights";
import { assessGenerationQuality, packageQuality } from "@/lib/generation-quality";
import { orchestrate } from "@/lib/orchestrator";
import { parseBusinessPackage } from "@/lib/package-schema";
import type { BusinessInput, BusinessPackage, OrchestrationEvent } from "@/lib/types";
import { sampleInput } from "@/test/research";

async function finalPackage(events: AsyncGenerator<OrchestrationEvent>): Promise<{
  pkg: BusinessPackage;
  events: OrchestrationEvent[];
}> {
  const collected: OrchestrationEvent[] = [];
  let result: BusinessPackage | undefined;
  for await (const event of events) {
    collected.push(event);
    if (event.type === "complete") result = event.result;
    if (event.type === "error") throw new Error(`generation failed: ${JSON.stringify(event)}`);
  }
  if (!result) throw new Error("generation did not complete");
  return { pkg: result, events: collected };
}

const FABRICATED_CLAIM =
  /\b(?:trusted by thousands|industry-leading|guaranteed results|most trusted|#1 in (?:the )?market)\b/i;

beforeEach(() => {
  for (const key of ["OPENAI_API_KEY", "OLLAMA_API_KEY", "TAVILY_API_KEY", "SERPER_API_KEY", "BRAVE_API_KEY", "OPENAI_BASE_URL"]) {
    vi.stubEnv(key, "");
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("deterministic output-quality evaluation", () => {
  it("labels a no-provider run as deterministic engine with template provenance", async () => {
    const input = sampleInput({
      business: {
        idea: "Mobile bike-repair service for office parks in Tirana",
        location: "Tirana, Albania",
      },
      customer: { ideal: "commuters who bike to work" },
    });
    const { pkg, events } = await finalPackage(orchestrate(input));
    const parsed = parseBusinessPackage(pkg);
    expect(parsed).not.toBeNull();

    expect(pkg.meta.engine).toBe("deterministic");
    expect(pkg.meta.agentLog.every((e) => e.source === "deterministic")).toBe(true);
    expect(pkg.meta.agentLog.some((e) => e.source === "llm")).toBe(false);

    // Stream must not mark recovery-free intentional deterministic steps as fallback failures,
    // and must never claim LLM source when no provider ran.
    const completes = events.filter((e) => e.type === "agent-complete");
    expect(completes.every((e) => e.source !== "llm")).toBe(true);

    expect(agentProvenance(pkg, "Brand Agent")).toBe("template");
    expect(agentProvenance(pkg, "Website Agent")).toBe("template");
    expect(packageQuality(pkg).outcome).toMatch(/^(success|provisional|degraded)$/);
  });

  it("keeps audience and idea signals in brand/website and avoids fabricated market claims", async () => {
    const input: BusinessInput = {
      idea: "Artisan sourdough bakery for weekend farmers markets",
      audience: "families who cook at home on weekends",
      location: "Prishtina, Kosovo",
      budget: "3000",
      style: "Organic / Natural",
    };
    const { pkg } = await finalPackage(orchestrate(input));
    const blob = JSON.stringify({
      brand: pkg.brand,
      website: pkg.website,
      marketing: pkg.marketing,
      competitors: pkg.competitors,
      marketResearch: pkg.marketResearch,
    });

    expect(blob.toLowerCase()).toMatch(/sourdough|bakery|bread|artisan/);
    expect(blob.toLowerCase()).toMatch(/families|weekend|home/);
    expect(blob).not.toMatch(FABRICATED_CLAIM);

    // No search provider — research must not pretend live evidence exists.
    expect(pkg.competitors.available).toBe(false);
    expect(pkg.competitors.status).not.toBe("ok");
    expect(pkg.marketResearch.status).not.toBe("ok");
    expect(pkg.competitors.sources ?? []).toEqual([]);
    expect(pkg.marketResearch.sources ?? []).toEqual([]);

    const quality = assessGenerationQuality(pkg);
    expect(quality.limitations).toContain("logoUnavailable");
    expect(quality.limitations).toContain("researchLimited");
  });

  it("does not treat a structurally valid deterministic package as hybrid AI success", async () => {
    const { pkg } = await finalPackage(orchestrate(sampleInput()));
    expect(pkg.meta.engine).toBe("deterministic");
    // Quality outcome may be success when templates fill critical sections cleanly,
    // but engine + sources must still disclose that no LLM wrote the copy.
    expect(pkg.meta.agentLog.filter((e) => e.source === "llm")).toHaveLength(0);
    expect(parseBusinessPackage(pkg)).not.toBeNull();
  });

  it("stops before complete when the soft deadline has already expired", async () => {
    const events: OrchestrationEvent[] = [];
    for await (const event of orchestrate(sampleInput(), { deadlineAt: Date.now() - 5_000 })) {
      events.push(event);
    }
    expect(events.some((e) => e.type === "complete")).toBe(false);
    expect(events.some((e) => e.type === "error" && e.message === "time-budget")).toBe(true);
  });
});
