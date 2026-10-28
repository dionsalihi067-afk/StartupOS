import { describe, expect, it } from "vitest";
import { assessGenerationQuality, packageQuality } from "@/lib/generation-quality";
import type { AgentLogEntry, BusinessPackage } from "@/lib/types";
import { makePackage } from "@/test/db";
import { sampleInput } from "@/test/research";

function log(entries: Partial<AgentLogEntry>[]): AgentLogEntry[] {
  return entries.map((e) => ({
    agent: e.agent ?? "Brand Agent",
    status: e.status ?? "ok",
    source: e.source ?? "llm",
    durationMs: e.durationMs ?? 1,
    note: e.note,
  }));
}

function pkg(agentLog: AgentLogEntry[], overrides: Partial<BusinessPackage> = {}): BusinessPackage {
  return makePackage({
    meta: { engine: "hybrid", searchProvider: "tavily", durationMs: 10, agentLog },
    competitors: {
      available: true,
      status: "ok",
      provider: "tavily",
      queries: [],
      marketOverview: "Local peers in the same offer category.",
      competitors: [
        {
          name: "Peer Studio",
          type: "direct",
          category: "same-sector",
          description: "Comparable local offer",
          website: "https://peer.example",
          strengths: ["Local"],
          weaknesses: ["Narrow"],
          sources: [],
        },
      ],
      swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
      differentiation: [],
      opportunityGaps: [],
      sources: [{ title: "Peer", url: "https://peer.example", snippet: "Comparable offer" }],
    },
    marketResearch: {
      available: true,
      status: "ok",
      provider: "tavily",
      queries: [],
      summary: "Demand signals observed in local search snippets.",
      trends: [{ insight: "Local discovery via search", sources: ["https://market.example"] }],
      painPoints: [],
      demandSignals: [{ insight: "Queries for the stated offer", sources: ["https://market.example"] }],
      opportunities: [],
      sources: [{ title: "Market note", url: "https://market.example", snippet: "Local demand" }],
    },
    ...overrides,
  });
}

describe("assessGenerationQuality", () => {
  it("classifies a clean LLM-backed run as success", () => {
    const result = assessGenerationQuality(
      pkg(
        log([
          { agent: "Brand Agent", status: "ok", source: "llm" },
          { agent: "Design Agent", status: "ok", source: "deterministic" },
          { agent: "Website Agent", status: "ok", source: "llm" },
          { agent: "Logo Agent", status: "ok", source: "llm" },
        ]),
        {
          brand: {
            ...makePackage().brand,
            logo: {
              generated: true,
              imageUrl: "/a.png",
              iconUrl: "/i.png",
              prompt: "x",
              model: "gpt-image-1",
              status: "generated",
              concept: "mark",
            },
          },
        },
      ),
    );
    expect(result.outcome).toBe("success");
    expect(result.limitations.filter((l) => l !== "thinEvidence" && l !== "researchLimited")).toEqual([]);
    expect(result.limitations).not.toContain("criticalFallback");
    expect(result.limitations).not.toContain("genericContent");
  });

  it("marks thin research as a limitation without degrading when core sections succeeded", () => {
    const result = assessGenerationQuality(
      pkg(log([{ agent: "Brand Agent", status: "ok", source: "llm" }]), {
        competitors: {
          available: false,
          status: "no-results",
          provider: "tavily",
          queries: [],
          marketOverview: "",
          competitors: [],
          swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
          differentiation: [],
          opportunityGaps: [],
          sources: [],
        },
        marketResearch: {
          available: false,
          status: "no-results",
          provider: "tavily",
          queries: [],
          summary: "",
          trends: [],
          painPoints: [],
          demandSignals: [],
          opportunities: [],
          sources: [],
        },
      }),
    );
    expect(result.outcome).toBe("success");
    expect(result.limitations).toEqual(expect.arrayContaining(["thinEvidence", "researchLimited"]));
  });

  it("marks critical section fallback as degraded without failing the package", () => {
    const result = assessGenerationQuality(
      pkg(
        log([
          { agent: "Brand Agent", status: "fallback", source: "deterministic", note: "llm-invalid-output" },
          { agent: "Website Agent", status: "ok", source: "llm" },
        ]),
      ),
    );
    expect(result.outcome).toBe("degraded");
    expect(result.limitations).toContain("criticalFallback");
  });

  it("does not degrade solely because research or logo is unavailable", () => {
    const result = assessGenerationQuality(
      pkg(
        log([
          { agent: "Brand Agent", status: "ok", source: "llm" },
          { agent: "Competitor Agent", status: "fallback", source: "deterministic", note: "search-not-configured" },
          { agent: "Market Research Agent", status: "fallback", source: "deterministic", note: "search-not-configured" },
          { agent: "Logo Agent", status: "fallback", source: "deterministic", note: "image-gen-not-configured" },
        ]),
        {
          brand: {
            ...makePackage().brand,
            logo: {
              generated: false,
              imageUrl: "",
              iconUrl: "",
              prompt: "",
              model: null,
              status: "unavailable",
              concept: "",
            },
          },
          competitors: {
            available: false,
            status: "search-not-configured",
            provider: null,
            queries: [],
            marketOverview: "",
            competitors: [],
            swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
            differentiation: [],
            opportunityGaps: [],
            sources: [],
          },
          marketResearch: {
            available: false,
            status: "search-not-configured",
            provider: null,
            queries: [],
            summary: "",
            trends: [],
            painPoints: [],
            demandSignals: [],
            opportunities: [],
            sources: [],
          },
        },
      ),
    );
    expect(result.outcome).toBe("success");
    expect(result.limitations).toEqual(expect.arrayContaining(["researchLimited", "logoUnavailable"]));
    expect(result.limitations).not.toContain("criticalFallback");
  });

  it("treats optional email/whatsapp fallback as non-critical", () => {
    const result = assessGenerationQuality(
      pkg(
        log([
          { agent: "Brand Agent", status: "ok", source: "llm" },
          { agent: "Email Agent", status: "fallback", source: "deterministic", note: "llm-unparseable" },
          { agent: "WhatsApp Agent", status: "error", source: "deterministic", note: "unknown error" },
        ]),
      ),
    );
    expect(result.outcome).toBe("success");
    expect(result.limitations).toContain("optionalFallback");
  });

  it("does not flag logoUnavailable when a partial logo still generated", () => {
    const result = assessGenerationQuality(
      pkg(
        log([
          { agent: "Logo Agent", agentKey: "logo", status: "fallback", note: "partial:image-timeout" },
          { agent: "Brand Agent", agentKey: "brand", status: "ok", source: "llm" },
        ]),
        {
          brand: {
            ...makePackage().brand,
            logo: {
              generated: true,
              imageUrl: "/a.png",
              iconUrl: "/a.png",
              prompt: "x",
              model: "gpt-image-2.5-sunburst",
              status: "generated",
              concept: "mark",
            },
          },
        },
      ),
    );
    expect(result.outcome).toBe("success");
    expect(result.limitations).not.toContain("logoUnavailable");
  });

  it("packageQuality prefers stored meta.quality and derives for historical packages", () => {
    const historical = pkg(log([{ agent: "Brand Agent", status: "fallback", note: "llm-invalid-output" }]));
    expect(packageQuality(historical).outcome).toBe("degraded");

    const stored = pkg(log([{ agent: "Brand Agent", status: "ok", source: "llm" }]), {
      meta: {
        engine: "hybrid",
        searchProvider: null,
        durationMs: 1,
        agentLog: log([{ agent: "Brand Agent", status: "ok", source: "llm" }]),
        quality: { outcome: "degraded", limitations: ["criticalFallback"] },
      },
    });
    const quality = packageQuality(stored);
    expect(quality.outcome).toBe("degraded");
    expect(quality.limitations).toEqual(expect.arrayContaining(["criticalFallback"]));
  });

  it("never upgrades stored degraded to success and merges limitations", () => {
    const storedDegraded = pkg(log([{ agent: "Brand Agent", status: "ok", source: "llm" }]), {
      meta: {
        engine: "hybrid",
        searchProvider: null,
        durationMs: 1,
        agentLog: log([{ agent: "Brand Agent", status: "ok", source: "llm" }]),
        quality: { outcome: "degraded", limitations: ["criticalFallback"] },
      },
    });
    const merged = packageQuality(storedDegraded);
    expect(merged.outcome).toBe("degraded");
    expect(merged.limitations).toEqual(expect.arrayContaining(["criticalFallback"]));
  });

  it("keeps lifecycle completion separate from degraded quality", () => {
    const degraded = assessGenerationQuality(
      pkg(log([{ agent: "Brand Agent", status: "fallback", source: "deterministic", note: "llm-invalid-output" }])),
    );
    expect(degraded.outcome).toBe("degraded");
    // Quality assessment does not mutate or imply generation lifecycle failure.
    expect(degraded).not.toHaveProperty("lifecycle");
    expect(degraded).not.toHaveProperty("status");
  });

  it("surfaces consistencyWarnings even when stored quality omitted them", () => {
    const clothing = makePackage({
      input: sampleInput({
        business: {
          name: "Veshje",
          idea: "Online clothing brand selling streetwear",
          type: "online",
          category: "ecommerce",
          location: "Prishtina, Kosovo",
        },
        customer: { ideal: "Young adults", type: "b2c" },
      }),
      brand: {
        ...makePackage().brand,
        name: "Veshje",
        description: "Streetwear clothing",
        logo: { status: "unavailable", generated: false, imageUrl: "", iconUrl: "", prompt: "", model: null, concept: "" },
      },
      competitors: {
        available: true,
        status: "ok",
        provider: "test",
        queries: [],
        marketOverview: "",
        competitors: [
          {
            name: "Raiffeisen Bank",
            type: "direct",
            category: "banking",
            description: "Retail banking in Kosovo",
            website: "https://bank.example",
            strengths: [],
            weaknesses: [],
            sources: [],
          },
        ],
        swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
        differentiation: [],
        opportunityGaps: [],
        sources: [],
      },
      meta: {
        engine: "hybrid",
        searchProvider: null,
        durationMs: 1,
        agentLog: log([{ agent: "Brand Agent", status: "ok", source: "llm" }]),
        quality: { outcome: "success", limitations: [] },
      },
    });
    const quality = packageQuality(clothing);
    expect(quality.outcome).toBe("degraded");
    expect(quality.limitations).toContain("consistencyWarnings");
  });
});
