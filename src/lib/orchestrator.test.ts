import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { orchestrate } from "@/lib/orchestrator";
import type { BusinessPackage, OrchestrationEvent } from "@/lib/types";
import { researchRun, sampleInput } from "@/test/research";

async function finalPackage(events: AsyncGenerator<OrchestrationEvent>): Promise<BusinessPackage> {
  let result: BusinessPackage | undefined;
  for await (const event of events) if (event.type === "complete") result = event.result;
  if (!result) throw new Error("generation did not complete");
  return result;
}

beforeEach(() => {
  for (const key of ["OPENAI_API_KEY", "TAVILY_API_KEY", "SERPER_API_KEY", "BRAVE_API_KEY"]) vi.stubEnv(key, "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("orchestrate", () => {
  it("completes without research, exactly as before", async () => {
    const pkg = await finalPackage(orchestrate(sampleInput()));
    expect(pkg.brand.name).toBe("Drita");
    expect(pkg.meta.agentLog.every((l) => l.status !== "error")).toBe(true);
    expect(pkg.meta.quality?.outcome).toBe("success");
  });

  it("accepts optional research without changing deterministic output", async () => {
    const input = sampleInput();
    const without = await finalPackage(orchestrate(input));
    const withResearch = await finalPackage(orchestrate(input, { research: await researchRun() }));
    expect(withResearch.brand).toEqual(without.brand);
    expect(withResearch.persona).toEqual(without.persona);
    // No competitor prices in this research, so only the evidence status differs.
    const { grounding: groundingWith, ...pricingWith } = withResearch.pricing;
    const { grounding: groundingWithout, ...pricingWithout } = without.pricing;
    expect(pricingWith).toEqual(pricingWithout);
    expect(groundingWithout?.evidence).toBe("notResearched");
    expect(groundingWith?.evidence).toBe("unavailable");
    expect(groundingWith?.observations).toEqual([]);
    // SEO may seed keywords/knowsAbout from research snippets; page structure stays identical.
    const { seo: seoWith, ...siteWith } = withResearch.website;
    const { seo: seoWithout, ...siteWithout } = without.website;
    expect(siteWith).toEqual(siteWithout);
    expect(seoWith.sitemap).toEqual(seoWithout.sitemap);
    expect(seoWith.slugStructure).toEqual(seoWithout.slugStructure);
    expect(seoWith.keywords.length).toBeGreaterThanOrEqual(seoWithout.keywords.length);
    expect(withResearch.launch).toEqual(without.launch);
  });

  it("stops without complete when the soft deadline has already passed", async () => {
    const events: OrchestrationEvent[] = [];
    for await (const event of orchestrate(sampleInput(), { deadlineAt: Date.now() - 1, businessId: "biz_deadline" })) {
      events.push(event);
    }
    expect(events.some((e) => e.type === "complete")).toBe(false);
    expect(events.some((e) => e.type === "error" && e.message === "time-budget")).toBe(true);
  });

  it("flags recovery steps with fallback on agent-complete", async () => {
    // With no LLM configured, brand uses deterministic output without a recovery note.
    const events: OrchestrationEvent[] = [];
    for await (const event of orchestrate(sampleInput())) {
      events.push(event);
    }
    const completes = events.filter((e) => e.type === "agent-complete");
    expect(completes.length).toBeGreaterThan(5);
    // Intentional deterministic steps must not be marked as recovery failures.
    expect(completes.every((e) => e.fallback !== true || e.source === "deterministic")).toBe(true);
  });

  it("starts independent research specialists before any of them complete", async () => {
    const events: OrchestrationEvent[] = [];
    for await (const event of orchestrate(sampleInput())) {
      events.push(event);
      if (
        events.filter(
          (e) =>
            e.type === "agent-start" &&
            (e.agent === "persona" || e.agent === "competitor" || e.agent === "market" || e.agent === "pricing"),
        ).length === 4
      ) {
        // After all four starts, none of those four should have completed yet
        // in a true concurrent start (completes may arrive later in the same tick after awaits).
        break;
      }
    }
    const firstResearchCompleteIdx = events.findIndex(
      (e) =>
        e.type === "agent-complete" &&
        (e.agent === "persona" || e.agent === "competitor" || e.agent === "market" || e.agent === "pricing"),
    );
    const researchStarts = events
      .map((e, i) => ({ e, i }))
      .filter(
        ({ e }) =>
          e.type === "agent-start" &&
          (e.agent === "persona" || e.agent === "competitor" || e.agent === "market" || e.agent === "pricing"),
      );
    expect(researchStarts).toHaveLength(4);
    if (firstResearchCompleteIdx >= 0) {
      expect(researchStarts.every(({ i }) => i < firstResearchCompleteIdx)).toBe(true);
    }
  });

  it("starts SEO with the production wave so it can overlap after website pages exist", async () => {
    const events: OrchestrationEvent[] = [];
    for await (const event of orchestrate(sampleInput())) {
      events.push(event);
    }
    const seoStart = events.findIndex((e) => e.type === "agent-start" && e.agent === "seo");
    const websiteStart = events.findIndex((e) => e.type === "agent-start" && e.agent === "website");
    const marketingStart = events.findIndex((e) => e.type === "agent-start" && e.agent === "marketing");
    const launchStart = events.findIndex((e) => e.type === "agent-start" && e.agent === "launch");
    const firstProdComplete = events.findIndex(
      (e) =>
        e.type === "agent-complete" &&
        (e.agent === "website" ||
          e.agent === "marketing" ||
          e.agent === "email" ||
          e.agent === "whatsapp" ||
          e.agent === "growth" ||
          e.agent === "launch" ||
          e.agent === "seo"),
    );
    const websiteComplete = events.findIndex((e) => e.type === "agent-complete" && e.agent === "website");
    const seoComplete = events.findIndex((e) => e.type === "agent-complete" && e.agent === "seo");
    expect(seoStart).toBeGreaterThan(-1);
    expect(websiteStart).toBeGreaterThan(-1);
    expect(marketingStart).toBeGreaterThan(-1);
    // SEO is announced with the production cohort, not after every peer finishes.
    expect(seoStart).toBeGreaterThan(websiteStart);
    expect(seoStart).toBeLessThanOrEqual(launchStart + 1);
    expect(seoStart).toBeLessThan(firstProdComplete);
    expect(seoComplete).toBeGreaterThan(websiteComplete);
  });

  it("records llm provenance fields on the package meta", async () => {
    const pkg = await finalPackage(orchestrate(sampleInput()));
    expect(pkg.meta).toMatchObject({
      llmProvider: null,
      llmSelectionReason: expect.any(String),
    });
  });
});
