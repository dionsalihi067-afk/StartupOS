import type { Brand, PricingStrategy } from "@/lib/types";
import { generateJson } from "@/lib/ai/client";
import { fallbackNote, withBrief, withLlmTelemetry, withResearch, type AgentOutput, type GenerationContext } from "@/lib/agents/context";
import { copyBrief } from "@/lib/agents/copy-brief";
import { languageInstruction } from "@/lib/agents/language";
import { buildWebsiteSpec } from "@/lib/website/builder";
import { describeStructure, mergeWebsiteContent, websiteContentLlmSchema } from "@/lib/website/content";
import { toWebsiteCore, type WebsiteCore } from "@/lib/website/legacy";

export type { WebsiteCore } from "@/lib/website/legacy";

/**
 * Website Agent.
 *
 * The deterministic builder chooses pages and sections from the business
 * context, brand and pricing; one model call may then rewrite the copy inside
 * that structure, using only this step's research projection. Model output is
 * schema-validated and filtered, and the deterministic website is used
 * whenever the model is unavailable or its output is unusable. No searches run here.
 */
export async function runWebsiteAgent(ctx: GenerationContext, brand: Brand, pricing: PricingStrategy): Promise<AgentOutput<WebsiteCore>> {
  const base = buildWebsiteSpec({ input: ctx.input, brand, pricing });
  if (!ctx.useLlm) return { data: toWebsiteCore(base), source: "deterministic" };

  const facts = copyBrief(ctx);
  const res = await generateJson({
    system:
      "You are a senior website copywriter. You write copy for a website whose structure is already fixed. Use only the business information and research provided. Never invent reviews, testimonials, statistics, customer counts, years in business, awards, certifications, guarantees, prices, discounts, contact details, addresses, opening hours or links. Early-stage businesses must not sound established. Keep it specific to this business; no generic filler.",
    user: withResearch(
      ctx,
      "website",
      withBrief(
        ctx,
        `${languageInstruction(ctx)}
Return JSON: hero {heading (<=10 words), subheading (1-2 sentences)}, features[{title, description}] (one per listed benefit, same order), offer[{description}] (one short description per listed offer item, same order), about (2-3 sentences), faq[{question, answer}] (one per listed question, same order), cta {heading}, pages[{slug, seoTitle (<=60 chars), seoDescription (<=155 chars)}].
Brand: ${brand.name}${brand.slogan ? ` — "${brand.slogan}"` : ""}
Voice: ${brand.voice.join(", ")}
Business: ${ctx.input.idea}
Offering: ${facts.offering}
Audience: ${facts.audience || "not provided"}
Location: ${facts.location || "not provided"}
Stage: ${facts.stage ?? "not provided"}
Website structure:
${describeStructure(base)}`,
      ),
    ),
    task: "website",
    temperature: 0.6,
    maxTokens: 1600,
    schema: websiteContentLlmSchema,
  });

  // Defense in depth for mocks / edge payloads that skip client-side schema.
  const parsed = websiteContentLlmSchema.safeParse(res.data);
  if (!res.data || !parsed.success) {
    return withLlmTelemetry({ data: toWebsiteCore(base), source: "deterministic", note: fallbackNote(res.note) }, res);
  }
  return withLlmTelemetry({ data: toWebsiteCore(mergeWebsiteContent(base, parsed.data)), source: "llm" }, res);
}
