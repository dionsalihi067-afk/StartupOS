import type { BusinessStyle } from "@/lib/types";
import { pick, nonEmpty, ensureArray, titleCase, midSentence } from "@/lib/utils";
import { generateJson } from "@/lib/ai/client";
import { brandLlmSchema } from "@/lib/schemas";
import { fallbackNote, withBrief, withLlmTelemetry, withResearch, type AgentOutput, type GenerationContext } from "@/lib/agents/context";
import { knownMarketLocation } from "@/lib/agents/copy-brief";
import { languageInstruction } from "@/lib/agents/language";
import type { IndustryProfile } from "@/lib/engine/industry";

export interface VerbalIdentity {
  name: string;
  slogan: string;
  description: string;
  mission: string;
  vision: string;
  values: string[];
  voice: string[];
  personality: string[];
  logoConcept: string;
}

const VOICE_BY_STYLE: Record<BusinessStyle, string[]> = {
  "Premium / Luxury": ["Refined", "Confident", "Understated", "Exclusive"],
  "Modern / Minimal": ["Clear", "Direct", "Considered", "Calm"],
  "Bold / Energetic": ["Punchy", "Motivating", "Fearless", "High-energy"],
  "Friendly / Approachable": ["Warm", "Conversational", "Encouraging", "Human"],
  "Corporate / Professional": ["Authoritative", "Precise", "Trustworthy", "Measured"],
  "Playful / Creative": ["Witty", "Imaginative", "Spirited", "Surprising"],
  "Tech / Futuristic": ["Sharp", "Visionary", "Precise", "Forward-looking"],
  "Organic / Natural": ["Earthy", "Honest", "Nurturing", "Grounded"],
};

const PERSONALITY_BY_STYLE: Record<BusinessStyle, string[]> = {
  "Premium / Luxury": ["Sophisticated", "Discerning", "Timeless"],
  "Modern / Minimal": ["Thoughtful", "Efficient", "Intentional"],
  "Bold / Energetic": ["Daring", "Ambitious", "Unstoppable"],
  "Friendly / Approachable": ["Welcoming", "Genuine", "Supportive"],
  "Corporate / Professional": ["Reliable", "Strategic", "Composed"],
  "Playful / Creative": ["Curious", "Joyful", "Original"],
  "Tech / Futuristic": ["Innovative", "Bold", "Precise"],
  "Organic / Natural": ["Authentic", "Caring", "Mindful"],
};

function generateName(industry: IndustryProfile, rng: () => number): string {
  const pattern = rng();
  const root = pick(rng, industry.roots);
  if (pattern < 0.34) {
    return `${root} ${pick(rng, industry.suffixes)}`.replace(/\s+&\s+/, " & ");
  }
  if (pattern < 0.67) {
    const prefix = pick(rng, industry.prefixes);
    return prefix === "The" ? `The ${root}` : `${prefix} ${root}`;
  }
  return titleCase(root);
}

function buildDeterministic(ctx: GenerationContext): VerbalIdentity {
  const { input, industry, rng } = ctx;
  const generated = generateName(industry, rng);
  const name = ownerName(ctx) ?? generated;
  const audience = midSentence(input.audience.replace(/\.$/, "")) || "the people you serve";
  const place = knownMarketLocation(input.location);
  const d = input.discovery;
  const offering = d?.offer.main?.trim() || d?.business.offering?.trim() || input.idea;
  const problem = d?.customer.problem?.trim() || null;
  const need = d?.customer.need?.trim() || null;
  const differentiator = d?.offer.differentiator?.trim() || d?.market.difference?.trim() || null;
  const positioning = d?.market.positioning?.trim() || null;
  const early = !d?.business.stage || d.business.stage === "idea" || d.business.stage === "preparing";
  // Owner facts first; industry value props only when the owner gave no angle.
  const angle = positioning || differentiator || need || pick(rng, industry.valueProps);

  const sloganTemplates = [
    positioning ? positioning.replace(/\.$/, "") : null,
    differentiator ? `${differentiator.replace(/\.$/, "")}.` : null,
    `${offering.replace(/\.$/, "")} for ${audience}.`,
    place ? `${offering.replace(/\.$/, "")} in ${place.split(",")[0]!.trim()}.` : null,
    `Built for ${audience}.`,
  ].filter((s): s is string => Boolean(s && s.trim()));

  const description = [
    `${name} provides ${midSentence(offering)} for ${audience}.`,
    place ? `Based in ${place}.` : null,
    problem ? `Focused on people who ${midSentence(problem)}.` : need ? `Helps customers ${midSentence(need)}.` : null,
    differentiator ? differentiator.replace(/\.$/, "") + "." : null,
    early ? "Still shaping the offer with real customer feedback — not an established market leader." : null,
  ]
    .filter(Boolean)
    .join(" ");

  const mission = place
    ? `To help ${audience} in ${place} get ${midSentence(offering)} — ${midSentence(angle)}.`
    : `To help ${audience} get ${midSentence(offering)} — ${midSentence(angle)}.`;

  return {
    name,
    slogan: (sloganTemplates[0] ?? `Built for ${audience}.`).slice(0, 80),
    description,
    mission,
    vision: early
      ? `To grow ${name} carefully${place ? ` in ${place}` : ""} by listening to early customers — without claiming a market position we have not earned.`
      : `To grow ${name}${place ? ` in ${place}` : ""} with consistent delivery of ${midSentence(offering)}.`,
    values: [
      differentiator ? `Stand by: ${differentiator.replace(/\.$/, "")}` : "Honesty in everything we do",
      "Customers before everything",
      early ? "Learn in public, improve weekly" : "Craft over shortcuts",
      "Continuous improvement",
    ].slice(0, 4),
    voice: VOICE_BY_STYLE[input.style],
    personality: PERSONALITY_BY_STYLE[input.style],
    logoConcept: "",
  };
}

export async function runBrandAgent(ctx: GenerationContext): Promise<AgentOutput<VerbalIdentity>> {
  const base = buildDeterministic(ctx);
  if (!ctx.useLlm) return { data: base, source: "deterministic" };

  const { input, industry } = ctx;
  const offering = input.discovery?.offer.main?.trim() || input.discovery?.business.offering?.trim() || input.idea;
  const res = await generateJson({
    system:
      "You are a brand strategist. Produce a concise, usable brand direction — not an essay. Prefer short slogan, one-sentence positioning (description), 3 personality traits, 4 voice adjectives. Mission and vision must each be one short sentence tied to this offer and customer; never claim leadership, trust rankings, or unverified market position.",
    user: withResearch(
      ctx,
      "brand",
      withBrief(
        ctx,
        `${languageInstruction(ctx)}
Return JSON: name (1-2 words unless the owner already named the business), slogan (<=8 words), description (1-2 sentences: who it is for and what it sells), mission (1 sentence), vision (1 sentence), values (3-4 short strings), voice (4 adjectives), personality (3 adjectives), logoConcept (1 sentence).
Offering: ${offering}
Industry: ${industry.label}
Target audience: ${input.audience}
Location: ${input.location || "not provided"}
Brand style: ${input.style}`,
      ),
    ),
    task: "creative",
    temperature: 0.7,
    maxTokens: 700,
    schema: brandLlmSchema,
  });

  // Defense in depth for mocks / edge payloads that skip client-side schema.
  const parsed = brandLlmSchema.safeParse(res.data);
  if (!res.data || !parsed.success) {
    return withLlmTelemetry({ data: base, source: "deterministic", note: fallbackNote(res.note) }, res);
  }

  const d = parsed.data;
  return withLlmTelemetry(
    {
      data: {
        name: ownerName(ctx) ?? nonEmpty(d.name, base.name),
        slogan: nonEmpty(d.slogan, base.slogan),
        description: nonEmpty(d.description, base.description),
        mission: nonEmpty(d.mission, base.mission),
        vision: nonEmpty(d.vision, base.vision),
        values: ensureArray(d.values, base.values).slice(0, 6),
        voice: ensureArray(d.voice, base.voice).slice(0, 6),
        personality: ensureArray(d.personality, base.personality).slice(0, 5),
        logoConcept: nonEmpty(d.logoConcept, base.logoConcept),
      },
      source: "llm",
    },
    res,
  );
}

/** The name the owner already chose in discovery; it always wins over generated names. */
export function ownerName(ctx: GenerationContext): string | undefined {
  return ctx.input.discovery?.business.name.trim() || undefined;
}
