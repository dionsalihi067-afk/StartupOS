/**
 * Phase 9 — partial agent failure resilience through the real orchestrator.
 * Deterministic only; no live AI.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const agentFail = vi.hoisted(() => ({ website: false, email: false }));

vi.mock("@/lib/agents/website", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/website")>();
  return {
    ...actual,
    runWebsiteAgent: (...args: Parameters<typeof actual.runWebsiteAgent>) => {
      if (agentFail.website) throw new Error("website agent unavailable");
      return actual.runWebsiteAgent(...args);
    },
  };
});

vi.mock("@/lib/agents/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/email")>();
  return {
    ...actual,
    runEmailAgent: (...args: Parameters<typeof actual.runEmailAgent>) => {
      if (agentFail.email) throw new Error("email agent unavailable");
      return actual.runEmailAgent(...args);
    },
  };
});

import { assessGenerationQuality, packageQuality } from "@/lib/generation-quality";
import { orchestrate } from "@/lib/orchestrator";
import { parseBusinessPackage } from "@/lib/package-schema";
import type { BusinessPackage, OrchestrationEvent } from "@/lib/types";
import { sampleInput } from "@/test/research";

async function finalPackage(events: AsyncGenerator<OrchestrationEvent>): Promise<BusinessPackage> {
  let result: BusinessPackage | undefined;
  for await (const event of events) {
    if (event.type === "complete") result = event.result;
    if (event.type === "error") throw new Error(`generation failed: ${JSON.stringify(event)}`);
  }
  if (!result) throw new Error("generation did not complete");
  return result;
}

beforeEach(() => {
  for (const key of ["OPENAI_API_KEY", "TAVILY_API_KEY", "SERPER_API_KEY", "BRAVE_API_KEY"]) vi.stubEnv(key, "");
  agentFail.website = false;
  agentFail.email = false;
});

afterEach(() => {
  vi.unstubAllEnvs();
  agentFail.website = false;
  agentFail.email = false;
});

describe("partial-failure resilience", () => {
  it("critical Website Agent error still yields a usable package marked degraded", async () => {
    agentFail.website = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const pkg = await finalPackage(orchestrate(sampleInput({ brand: { language: "en" } })));
    errors.mockRestore();

    const parsed = parseBusinessPackage(pkg);
    expect(parsed).not.toBeNull();
    expect(parsed!.brand.name.length).toBeGreaterThan(0);
    expect(parsed!.pricing.tiers.length).toBeGreaterThan(0);
    expect(parsed!.meta.agentLog.some((e) => e.agent === "Website Agent" && e.status === "error")).toBe(true);
    expect(parsed!.meta.quality?.outcome).toBe("degraded");
    expect(parsed!.meta.quality?.limitations).toContain("criticalFallback");
    expect(packageQuality(parsed!).outcome).toBe("degraded");
    expect(Array.isArray(parsed!.website.pages)).toBe(true);
    expect(parsed!.website.seo.title.length).toBeGreaterThan(0);
  });

  it("noncritical Email Agent error does not force degraded when no critical failure occurred", async () => {
    agentFail.email = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const pkg = await finalPackage(orchestrate(sampleInput({ brand: { language: "en" } })));
    errors.mockRestore();

    const parsed = parseBusinessPackage(pkg)!;
    expect(parsed.meta.agentLog.some((e) => e.agent === "Email Agent" && e.status === "error")).toBe(true);
    expect(parsed.meta.quality?.outcome).toBe("success");
    expect(parsed.meta.quality?.limitations).toContain("optionalFallback");
    expect(parsed.meta.quality?.limitations).not.toContain("criticalFallback");
    expect(assessGenerationQuality(parsed).outcome).toBe("success");
    expect(parsed.website.pages.length).toBeGreaterThan(0);
    expect(parsed.brand.name).toBeTruthy();
  });

  it("invalid assembled packages cannot bypass parseBusinessPackage", async () => {
    const pkg = await finalPackage(orchestrate(sampleInput({ brand: { language: "en" } })));
    const broken = { ...pkg, brand: { ...pkg.brand, name: "" } };
    expect(parseBusinessPackage(broken)).toBeNull();
  });
});
