import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  brandLlmSchema,
  competitorLlmSchema,
  competitorResearchLlmSchema,
  emailLlmSchema,
  growthLlmSchema,
  marketResearchLlmSchema,
  marketingLlmSchema,
  personaLlmSchema,
  pricingLlmSchema,
} from "@/lib/schemas";
import { executiveLlmSchema } from "@/lib/agents/strategy";
import { financialAssumptionsLlmSchema } from "@/lib/finance/model";
import { websiteContentLlmSchema } from "@/lib/website/content";

/**
 * Inventory of structured AI operations that must pass a Zod schema into
 * `generateJson({ schema })`. Image generation and deterministic agents are
 * intentionally excluded.
 */
const STRUCTURED_AGENT_FILES = [
  "brand.ts",
  "persona.ts",
  "market.ts",
  "competitor.ts",
  "pricing.ts",
  "marketing.ts",
  "email.ts",
  "growth.ts",
  "website.ts",
  "strategy.ts",
] as const;

const AGENTS_DIR = join(process.cwd(), "src/lib/agents");

function agentSource(name: string): string {
  return readFileSync(join(AGENTS_DIR, name), "utf8");
}

describe("structured AI contract inventory", () => {
  it("lists only agent modules that exist", () => {
    const present = new Set(readdirSync(AGENTS_DIR));
    for (const file of STRUCTURED_AGENT_FILES) {
      expect(present.has(file), file).toBe(true);
    }
  });

  it("requires every generateJson call in structured agents to pass schema:", () => {
    const missing: string[] = [];
    for (const file of STRUCTURED_AGENT_FILES) {
      const source = agentSource(file);
      const calls = source.match(/generateJson(?:<[^>\n]+>)?\(/g)?.length ?? 0;
      // Property lines only (avoids `{name, slogan}` text inside prompt templates).
      const schemas = source.match(/^\s*schema:\s*[A-Za-z_][\w.]*/gm)?.length ?? 0;
      expect(calls, `${file} should call generateJson`).toBeGreaterThan(0);
      if (schemas < calls) missing.push(`${file}: ${calls} generateJson call(s), ${schemas} schema:`);
    }
    expect(missing).toEqual([]);
  });

  it("keeps non-JSON AI paths out of the structured inventory", () => {
    expect(agentSource("logo.ts")).toContain("generateImage");
    expect(agentSource("logo.ts")).not.toContain("generateJson(");
    for (const file of ["design.ts", "launch.ts", "seo.ts", "whatsapp.ts"] as const) {
      expect(agentSource(file)).not.toContain("generateJson(");
    }
  });
});

describe("agent schemas reject invalid structured payloads", () => {
  const cases: { name: string; schema: z.ZodTypeAny; invalid: unknown }[] = [
    { name: "brand", schema: brandLlmSchema, invalid: { name: 12 } },
    { name: "persona", schema: personaLlmSchema, invalid: { goals: "not-an-array" } },
    { name: "market", schema: marketResearchLlmSchema, invalid: { trends: "x" } },
    { name: "competitor", schema: competitorLlmSchema, invalid: { competitors: [{ type: "alien" }] } },
    { name: "competitorResearch", schema: competitorResearchLlmSchema, invalid: { competitors: [{ strengths: "x" }] } },
    { name: "pricing", schema: pricingLlmSchema, invalid: { tiers: "x" } },
    { name: "marketing", schema: marketingLlmSchema, invalid: null },
    { name: "email", schema: emailLlmSchema, invalid: { sequence: "x" } },
    { name: "growth", schema: growthLlmSchema, invalid: 42 },
    { name: "website", schema: websiteContentLlmSchema, invalid: { hero: "not-object" } },
    { name: "executive", schema: executiveLlmSchema, invalid: { summary: "too short", priorities: [] } },
    {
      name: "financialAssumptions",
      schema: financialAssumptionsLlmSchema,
      invalid: { startupCosts: [], monthlyFixedCosts: [], revenueStreams: [{ name: "A", unit: "x", price: -1, variableCost: 0, monthlyUnits: { conservative: 1, base: 1, optimistic: 1 } }] },
    },
  ];

  for (const c of cases) {
    it(`${c.name} schema rejects structurally invalid output`, () => {
      expect(c.schema.safeParse(c.invalid).success).toBe(false);
    });
  }

  it("accepts a minimal valid brand payload", () => {
    expect(brandLlmSchema.safeParse({ name: "Lume", slogan: "Calm care" }).success).toBe(true);
  });

  it("accepts coerced financial assumptions with string amounts", () => {
    const parsed = financialAssumptionsLlmSchema.safeParse({
      startupCosts: [{ item: "Stock", amount: "1,200", essential: true }],
      monthlyFixedCosts: [{ item: "Rent", amount: "500" }],
      revenueStreams: [
        {
          name: "Orders",
          unit: "order",
          price: "25",
          variableCost: "10",
          monthlyUnits: { conservative: "5", base: "10", optimistic: "20" },
        },
      ],
      notes: "Estimate for first year",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.startupCosts[0]!.amount).toBe(1200);
      expect(parsed.data.revenueStreams[0]!.monthlyUnits.base).toBe(10);
    }
  });

  it("growth schema drops unusable windows instead of inventing phases", () => {
    const parsed = growthLlmSchema.safeParse({ phases: [{ window: "10-30", title: "Wrong" }] });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.phases).toEqual([]);
  });
});
