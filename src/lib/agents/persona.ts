import type { CustomerPersona } from "@/lib/types";
import { pickN, nonEmpty, ensureArray } from "@/lib/utils";
import { generateJson } from "@/lib/ai/client";
import { personaLlmSchema } from "@/lib/schemas";
import { fallbackNote, withBrief, withLlmTelemetry, withResearch, type AgentOutput, type GenerationContext } from "@/lib/agents/context";

/**
 * Without a language model the persona is a labelled hypothesis built only from
 * the owner's own description of their customers: no invented name, age,
 * occupation or quote.
 */
function buildDeterministic(ctx: GenerationContext): CustomerPersona {
  const { input, industry, rng } = ctx;
  const audience = input.audience.trim().replace(/\.$/, "");
  return {
    name: "Primary customer",
    archetype: "Hypothesis to validate",
    age: "Not specified",
    occupation: audience,
    bio: `Built from the owner's description of their customers (${audience}) in ${input.location}. It is a starting hypothesis, not research: confirm it in conversations with real customers.`,
    goals: pickN(rng, industry.goals, Math.min(3, industry.goals.length)),
    painPoints: pickN(rng, industry.painPoints, Math.min(3, industry.painPoints.length)),
    channels: pickN(rng, industry.channels, Math.min(4, industry.channels.length)),
    objections: ["Is it worth the price?", "Can I trust a new business?", "Is it right for my situation?"],
    quote: "",
  };
}

export async function runPersonaAgent(ctx: GenerationContext): Promise<AgentOutput<CustomerPersona>> {
  const base = buildDeterministic(ctx);
  if (!ctx.useLlm) return { data: base, source: "deterministic" };

  const { input, industry } = ctx;
  const res = await generateJson({
    system:
      "You are a market research expert. Build a realistic primary customer persona for this specific business as a modelled hypothesis. Do not claim it comes from interviews, surveys or data, and do not invent statistics.",
    user: withResearch(ctx, "persona", withBrief(ctx, `Return JSON: name, archetype, age (range), occupation, bio (2 sentences), goals (3), painPoints (3), channels (4), objections (3), quote (in first person, with quotes).
Business: ${input.idea}
Industry: ${industry.label}
Audience: ${input.audience}
Location: ${input.location}
Style: ${input.style}`)),
    task: "creative",
    temperature: 0.7,
    maxTokens: 800,
    schema: personaLlmSchema,
  });

  // Defense in depth for mocks / edge payloads that skip client-side schema.
  const parsed = personaLlmSchema.safeParse(res.data);
  if (!res.data || !parsed.success) {
    return withLlmTelemetry({ data: base, source: "deterministic", note: fallbackNote(res.note) }, res);
  }
  const d = parsed.data;
  return withLlmTelemetry(
    {
      data: {
        name: nonEmpty(d.name, base.name),
        archetype: nonEmpty(d.archetype, base.archetype),
        age: nonEmpty(d.age, base.age),
        occupation: nonEmpty(d.occupation, base.occupation),
        bio: nonEmpty(d.bio, base.bio),
        goals: ensureArray(d.goals, base.goals).slice(0, 5),
        painPoints: ensureArray(d.painPoints, base.painPoints).slice(0, 5),
        channels: ensureArray(d.channels, base.channels).slice(0, 6),
        objections: ensureArray(d.objections, base.objections).slice(0, 5),
        quote: nonEmpty(d.quote, base.quote),
      },
      source: "llm",
    },
    res,
  );
}
