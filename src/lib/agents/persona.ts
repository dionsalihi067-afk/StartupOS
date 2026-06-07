import type { CustomerPersona } from "@/lib/types";
import { pick, pickN, nonEmpty, ensureArray } from "@/lib/utils";
import { generateJson } from "@/lib/ai/client";
import { personaLlmSchema } from "@/lib/schemas";
import type { AgentOutput, GenerationContext } from "@/lib/agents/context";

const NAMES = ["Maya", "Daniel", "Sofia", "Liam", "Aisha", "Noah", "Elena", "Marcus", "Priya", "Jonas", "Chloe", "Omar"];
const ARCHETYPES = ["The Practical Optimizer", "The Aspirational Achiever", "The Busy Decision-Maker", "The Value Seeker", "The Quality Connoisseur", "The Early Adopter"];

function buildDeterministic(ctx: GenerationContext): CustomerPersona {
  const { input, industry, rng } = ctx;
  const name = pick(rng, NAMES);
  const archetype = pick(rng, ARCHETYPES);
  return {
    name,
    archetype,
    age: pick(rng, ["24–32", "28–38", "30–45", "35–50"]),
    occupation: pick(rng, ["Marketing manager", "Small business owner", "Healthcare professional", "Freelance creative", "Operations lead", "Educator"]),
    bio: `${name} lives in or near ${input.location} and represents a core slice of ${input.audience.toLowerCase()}. They value their time, do their research before buying, and reward brands that feel ${input.style.split(" / ")[0]!.toLowerCase()} and trustworthy.`,
    goals: pickN(rng, industry.goals, Math.min(3, industry.goals.length)),
    painPoints: pickN(rng, industry.painPoints, Math.min(3, industry.painPoints.length)),
    channels: pickN(rng, industry.channels, Math.min(4, industry.channels.length)),
    objections: [
      "Is this actually worth the price?",
      "How do I know I can trust them?",
      "Will this really work for someone like me?",
    ],
    quote: `"I don't want hype — I just want something that genuinely works and feels made for me."`,
  };
}

export async function runPersonaAgent(ctx: GenerationContext): Promise<AgentOutput<CustomerPersona>> {
  const base = buildDeterministic(ctx);
  if (!ctx.useLlm) return { data: base, source: "deterministic" };

  const { input, industry } = ctx;
  const res = await generateJson<unknown>({
    system: "You are a market research expert. Build a vivid, realistic primary customer persona.",
    user: `Return JSON: name, archetype, age (range), occupation, bio (2 sentences), goals (3), painPoints (3), channels (4), objections (3), quote (in first person, with quotes).
Business: ${input.idea}
Industry: ${industry.label}
Audience: ${input.audience}
Location: ${input.location}
Style: ${input.style}`,
    temperature: 0.7,
    maxTokens: 800,
  });

  const parsed = personaLlmSchema.safeParse(res.data);
  if (!res.data || !parsed.success) return { data: base, source: "deterministic", note: res.note };
  const d = parsed.data;
  return {
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
  };
}
