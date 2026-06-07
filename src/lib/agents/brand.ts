import type { BusinessStyle } from "@/lib/types";
import { pick, pickN, nonEmpty, ensureArray, titleCase } from "@/lib/utils";
import { generateJson } from "@/lib/ai/client";
import { brandLlmSchema } from "@/lib/schemas";
import type { AgentOutput, GenerationContext } from "@/lib/agents/context";
import type { IndustryProfile } from "@/lib/engine/industry";

export interface VerbalIdentity {
  name: string;
  slogan: string;
  description: string;
  story: string;
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
  const name = generateName(industry, rng);
  const audience = input.audience.replace(/\.$/, "");
  const valueProp = pick(rng, industry.valueProps);

  const sloganTemplates = [
    `${valueProp}. Every time.`,
    `Where ${audience.toLowerCase()} come first.`,
    `${input.location} finest, reimagined.`,
    `Built for ${audience.toLowerCase()}.`,
    `Better ${industry.label.toLowerCase()}, made simple.`,
  ];

  const description = `${name} is ${article(industry.label)} ${industry.label.toLowerCase()} brand based in ${input.location}, created for ${audience.toLowerCase()}. We exist to deliver ${valueProp.toLowerCase()} through a ${input.style.split(" / ")[0]!.toLowerCase()} experience that feels effortless from first touch to lasting loyalty.`;

  const story = `${name} began with a simple frustration: ${audience.toLowerCase()} in ${input.location} kept running into ${industry.painPoints[0]?.toLowerCase() ?? "the same tired options"} and ${industry.painPoints[1]?.toLowerCase() ?? "underwhelming service"}. We knew ${industry.label.toLowerCase()} could be done differently — with ${valueProp.toLowerCase()} at its core. So we built ${name}: a ${input.style.split(" / ")[0]!.toLowerCase()} ${industry.label.toLowerCase()} brand obsessed with ${pick(rng, industry.valueProps).toLowerCase()}. Today, every decision we make comes back to one question — is this genuinely better for the people we serve?`;

  return {
    name,
    slogan: pick(rng, sloganTemplates),
    description,
    story,
    mission: `To help ${audience.toLowerCase()} in ${input.location} experience ${industry.label.toLowerCase()} done right — combining ${pick(rng, industry.valueProps).toLowerCase()} with genuine care.`,
    vision: `To become the most trusted ${industry.label.toLowerCase()} name in ${input.location} and beyond.`,
    values: pickN(rng, [
      "Quality without compromise",
      "Honesty in everything we do",
      "Customers before everything",
      "Craft over shortcuts",
      "Community over competition",
      "Continuous improvement",
    ], 4),
    voice: VOICE_BY_STYLE[input.style],
    personality: PERSONALITY_BY_STYLE[input.style],
    logoConcept: "",
  };
}

export async function runBrandAgent(ctx: GenerationContext): Promise<AgentOutput<VerbalIdentity>> {
  const base = buildDeterministic(ctx);
  if (!ctx.useLlm) return { data: base, source: "deterministic" };

  const { input, industry } = ctx;
  const res = await generateJson<unknown>({
    system:
      "You are a world-class brand strategist and naming expert. Create a memorable, ownable brand identity specific to THIS business — never generic. Names must be short (1-2 words), brandable, easy to pronounce, and NOT generic.",
    user: `Create a brand identity as JSON with keys: name, slogan, description (2-3 sentences), story (3-4 sentence origin/brand story explaining why this business exists and who it serves — specific, human, no clichés), mission, vision, values (4 strings), voice (4 adjectives), personality (3 adjectives), logoConcept (1 sentence).
Business idea: ${input.idea}
Industry: ${industry.label}
Target audience: ${input.audience}
Location: ${input.location}
Budget: ${input.budget}
Brand style: ${input.style}`,
    temperature: 0.85,
    maxTokens: 1100,
  });

  const parsed = brandLlmSchema.safeParse(res.data);
  if (!res.data || !parsed.success) return { data: base, source: "deterministic", note: res.note };

  const d = parsed.data;
  return {
    data: {
      name: nonEmpty(d.name, base.name),
      slogan: nonEmpty(d.slogan, base.slogan),
      description: nonEmpty(d.description, base.description),
      story: nonEmpty(d.story, base.story),
      mission: nonEmpty(d.mission, base.mission),
      vision: nonEmpty(d.vision, base.vision),
      values: ensureArray(d.values, base.values).slice(0, 6),
      voice: ensureArray(d.voice, base.voice).slice(0, 6),
      personality: ensureArray(d.personality, base.personality).slice(0, 5),
      logoConcept: nonEmpty(d.logoConcept, base.logoConcept),
    },
    source: "llm",
  };
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}
