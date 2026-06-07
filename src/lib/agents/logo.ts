import type { Brand, LogoAsset } from "@/lib/types";
import type { AgentOutput, GenerationContext } from "@/lib/agents/context";
import { getSwatch } from "@/lib/engine/color";
import { generateImageAsset, imageModel, isImageGenConfigured } from "@/lib/ai/image";
import { slugify } from "@/lib/utils";

/**
 * Logo Agent — generates a REAL, unique logo for every startup via OpenAI image
 * generation. The prompt is built from the full brand context (name, industry,
 * audience, tone, colors, style and value proposition) so two different ideas
 * always produce visually distinct marks.
 *
 * There are NO placeholder logos, NO static SVG fallbacks and NO hardcoded
 * icons. If image generation is unavailable or fails, the agent returns an
 * explicit, non-fabricated error state.
 */

interface LogoPromptInput {
  name: string;
  industry: string;
  audience: string;
  tone: string;
  style: string;
  valueProp: string;
  colors: { primary: string; secondary: string; accent: string };
}

function buildLockupPrompt(p: LogoPromptInput): string {
  return [
    `Design a professional, original brand logo for "${p.name}", a ${p.industry} company.`,
    `Target audience: ${p.audience}.`,
    `Unique value proposition: ${p.valueProp}.`,
    `Brand personality / tone: ${p.tone}.`,
    `Visual style: ${p.style}, clean, modern, memorable and instantly recognizable.`,
    `Use this exact color palette — primary ${p.colors.primary}, secondary ${p.colors.secondary}, accent ${p.colors.accent}.`,
    `Include a distinctive icon/symbol paired with the wordmark "${p.name}" in a refined, legible sans-serif (or style-appropriate) typeface.`,
    `Flat vector logo, centered, balanced composition, crisp edges, high contrast, fully transparent background.`,
    `No photographic elements, no 3D, no mockups, no drop shadows, no gradients-heavy clutter, no extra tagline text, no spelling errors.`,
  ].join(" ");
}

function buildIconPrompt(p: LogoPromptInput): string {
  return [
    `Design a single, original app-icon style brand mark (symbol only, NO text) for "${p.name}", a ${p.industry} company.`,
    `It should visually express: ${p.valueProp}.`,
    `Brand tone: ${p.tone}. Visual style: ${p.style}.`,
    `Use this exact color palette — primary ${p.colors.primary}, secondary ${p.colors.secondary}, accent ${p.colors.accent}.`,
    `Flat vector icon, simple geometric forms, centered, balanced, scalable, high contrast, fully transparent background.`,
    `No letters, no words, no photographic elements, no 3D, no mockups.`,
  ].join(" ");
}

export function emptyLogo(status: "unavailable" | "error"): LogoAsset {
  return {
    generated: false,
    imageUrl: "",
    iconUrl: "",
    prompt: "",
    model: null,
    status,
    concept: "",
  };
}

export async function runLogoAgent(ctx: GenerationContext, brand: Brand): Promise<AgentOutput<LogoAsset>> {
  if (!isImageGenConfigured()) {
    return { data: emptyLogo("unavailable"), source: "deterministic", note: "image-gen-not-configured" };
  }

  const { input, industry } = ctx;
  const tone = [...brand.voice, ...brand.personality].slice(0, 5).join(", ") || input.style;
  const valueProp = brand.slogan?.trim()
    ? `${brand.slogan} — ${brand.description}`.slice(0, 320)
    : brand.description.slice(0, 320);

  const promptInput: LogoPromptInput = {
    name: brand.name,
    industry: industry.label,
    audience: input.audience,
    tone,
    style: input.style,
    valueProp,
    colors: {
      primary: getSwatch(brand.palette, "primary"),
      secondary: getSwatch(brand.palette, "secondary"),
      accent: getSwatch(brand.palette, "accent"),
    },
  };

  const lockupPrompt = buildLockupPrompt(promptInput);
  const iconPrompt = buildIconPrompt(promptInput);
  const slug = slugify(brand.name);

  // Generate the full lockup and the icon concurrently.
  const [lockup, icon] = await Promise.all([
    generateImageAsset({ prompt: lockupPrompt, fileBase: `${slug}-logo`, size: "1536x1024" }),
    generateImageAsset({ prompt: iconPrompt, fileBase: `${slug}-icon`, size: "1024x1024" }),
  ]);

  // The primary lockup is required; the icon falls back to the lockup image if
  // only one render succeeded — but we never fabricate a vector placeholder.
  if (!lockup && !icon) {
    return { data: emptyLogo("error"), source: "deterministic", note: "image-gen-failed" };
  }

  const primary = lockup ?? icon!;
  const data: LogoAsset = {
    generated: true,
    imageUrl: primary.url,
    iconUrl: (icon ?? lockup!).url,
    prompt: lockupPrompt,
    model: primary.model || imageModel(),
    status: "generated",
    concept: brand.logo?.concept?.trim()
      ? brand.logo.concept
      : `A bespoke ${input.style.split(" / ")[0]!.toLowerCase()} mark for ${brand.name}, generated to express ${valueProp.slice(0, 120)}.`,
  };

  return { data, source: "llm" };
}
