import type { PricingStrategy } from "@/lib/types";
import { generateJson } from "@/lib/ai/client";
import { pricingLlmSchema } from "@/lib/schemas";
import { fallbackNote, withBrief, withLlmTelemetry, withResearch, type AgentOutput, type GenerationContext } from "@/lib/agents/context";
import { NO_RESEARCH_EVIDENCE } from "@/lib/pricing/evidence";
import { mergeLlmPricing, toPricingStrategy } from "@/lib/pricing/output";
import { renderPricingContext } from "@/lib/pricing/prompt";
import { buildPricingStrategy } from "@/lib/pricing/strategy";

/**
 * Pricing Agent.
 *
 * The pricing engine decides structure, tier prices and grounding from the
 * business context plus validated competitor pricing evidence (when research
 * was supplied). The model only writes the human-readable copy around those
 * decisions; it never sets prices. No searches run here.
 */
export async function runPricingAgent(ctx: GenerationContext): Promise<AgentOutput<PricingStrategy>> {
  const evidence = ctx.research?.pricing?.pricingEvidence ?? NO_RESEARCH_EVIDENCE;
  const engine = buildPricingStrategy(ctx.input, ctx.industry, evidence);
  const base = toPricingStrategy(engine);
  if (!ctx.useLlm) return { data: base, source: "deterministic" };

  const { input, industry } = ctx;
  const res = await generateJson({
    system:
      "You are a pricing strategist. Explain and package the pricing strategy you are given. Observed competitor prices are evidence; the recommended tiers are strategy. Never invent prices, competitors, market averages or statistics, and never present a recommendation as a market fact.",
    user: withResearch(ctx, "pricing", withBrief(ctx, `Return JSON: rationale (2 sentences explaining the strategy), tiers (exactly ${base.tiers.length}, in the order given: name, tagline, features[3-5] describing what the customer receives, cta), psychology[4], upsells[3]. Do not include prices in tiers; they are fixed by the pricing engine.
Business: ${input.idea}
Industry: ${industry.label}
Audience: ${input.audience}
Budget (launch constraint only, not a price signal): ${input.budget}

${renderPricingContext(engine)}`)),
    task: "structured",
    temperature: 0.5,
    maxTokens: 1100,
    schema: pricingLlmSchema,
  });

  // Defense in depth for mocks / edge payloads that skip client-side schema.
  const parsed = pricingLlmSchema.safeParse(res.data);
  if (!res.data || !parsed.success) {
    return withLlmTelemetry({ data: base, source: "deterministic", note: fallbackNote(res.note) }, res);
  }
  return withLlmTelemetry({ data: mergeLlmPricing(engine, base, parsed.data), source: "llm" }, res);
}
