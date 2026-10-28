import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { regenerateSelectedSections } from "@/lib/regenerate";
import { applySectionPatch } from "@/lib/regenerate-core";
import { incompleteSections } from "@/lib/client/insights";
import type { BusinessPackage, LogoAsset } from "@/lib/types";
import { makePackage } from "@/test/db";
import { makeWebsiteCore } from "@/test/website";

const storedLogo: LogoAsset = {
  generated: true,
  imageUrl: "/api/assets/ast_11111111111111111111111111111111",
  iconUrl: "/api/assets/ast_22222222222222222222222222222222",
  prompt: "p",
  model: "gpt-image-1",
  status: "generated",
  concept: "c",
};

function withSite(logo: LogoAsset): BusinessPackage {
  const base = makePackage();
  return makePackage({ brand: { ...base.brand, logo }, website: { ...base.website, ...makeWebsiteCore("Home") } });
}

const originalKey = process.env.OPENAI_API_KEY;
beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
});
afterEach(() => {
  if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey;
});

describe("logo regeneration", () => {
  it("keeps the existing logo when a new one cannot be produced", async () => {
    const result = await regenerateSelectedSections(withSite(storedLogo), ["logo"]);
    expect(result.patches).toEqual([]);
    expect(result.failed).toEqual(["logo"]);
    expect(result.outcomes[0]).toMatchObject({ section: "logo", status: "error", message: "image-gen-not-configured" });
  });

  it("puts a new logo into the website theme so the site shows it", () => {
    const pkg = withSite({ ...storedLogo, generated: false, imageUrl: "", iconUrl: "", status: "error" });
    expect(pkg.website.spec?.theme.logoUrl).toBeUndefined();
    const next = applySectionPatch(pkg, { section: "logo", logo: storedLogo });
    expect(next.brand.logo).toEqual(storedLogo);
    expect(next.website.spec?.theme.logoUrl).toBe(storedLogo.imageUrl);
  });
});

describe("incompleteSections", () => {
  const log = (agent: string, status: "ok" | "fallback" | "error", note?: string) => ({ agent, status, source: "deterministic" as const, durationMs: 1, note });

  it("lists sections that fell back or failed for retryable reasons, in generation order", () => {
    const pkg = makePackage({
      meta: {
        engine: "hybrid",
        searchProvider: null,
        durationMs: 1,
        agentLog: [
          log("Growth Agent", "fallback", "llm-unavailable"),
          log("Logo Agent", "error", "image-timeout"),
          log("Brand Agent", "ok"),
          log("Strategy Agent", "fallback", "financials-unavailable"),
        ],
      },
    });
    expect(incompleteSections(pkg)).toEqual(["logo", "strategy", "growth"]);
  });

  it("does not offer retries that cannot help", () => {
    const pkg = makePackage({
      meta: {
        engine: "hybrid",
        searchProvider: null,
        durationMs: 1,
        agentLog: [
          log("Logo Agent", "fallback", "image-gen-not-configured"),
          log("Competitor Agent", "fallback", "search-not-configured"),
          log("Market Research Agent", "fallback", "research-no-results"),
          log("Logo Agent", "fallback", "partial:image-timeout"),
        ],
      },
    });
    expect(incompleteSections(pkg)).toEqual([]);
  });
});
