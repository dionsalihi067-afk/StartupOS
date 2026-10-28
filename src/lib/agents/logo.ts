import type { Brand, LogoAsset } from "@/lib/types";
import type { AgentOutput, GenerationContext } from "@/lib/agents/context";
import { getSwatch } from "@/lib/engine/color";
import { generateImage, imageModel, isImageGenConfigured } from "@/lib/ai/image";

/**
 * Logo Agent — generates a REAL, unique logo for every startup via OpenAI image
 * generation. The prompt is built from the full brand context (name, industry,
 * audience, tone, colors, style and value proposition) so two different ideas
 * always produce visually distinct marks. Images are stored through the
 * context's asset store (the database), never on the server's local disk.
 *
 * There are NO placeholder logos, NO static SVG fallbacks and NO hardcoded
 * icons. If image generation or storage is unavailable or fails, the agent
 * returns an explicit, non-fabricated error state with the reason in its note.
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

/**
 * Generates and stores one image. Returns its served URL, or why there is none.
 * A logo counts as generated only once the image is stored durably.
 */
async function renderAndStore(
  ctx: GenerationContext,
  kind: "logo" | "icon",
  prompt: string,
  size: "1024x1024" | "1536x1024",
): Promise<{ url: string; model: string } | { failure: string }> {
  const image = await generateImage({ prompt, size, task: "image-premium" });
  if (!image.ok) return { failure: `image-${image.reason}${image.status ? `-${image.status}` : ""}` };
  try {
    const url = await ctx.storeAsset!({ kind, contentType: image.contentType, bytes: image.bytes });
    return { url, model: image.model };
  } catch {
    return { failure: "image-storage-failed" };
  }
}

export async function runLogoAgent(ctx: GenerationContext, brand: Brand): Promise<AgentOutput<LogoAsset>> {
  if (!isImageGenConfigured()) {
    return { data: emptyLogo("unavailable"), source: "deterministic", note: "image-gen-not-configured" };
  }
  if (!ctx.storeAsset) {
    return { data: emptyLogo("error"), source: "deterministic", note: "image-storage-unavailable" };
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

  // Generate the full lockup and the icon concurrently.
  const [lockup, icon] = await Promise.all([
    renderAndStore(ctx, "logo", lockupPrompt, "1536x1024"),
    renderAndStore(ctx, "icon", iconPrompt, "1024x1024"),
  ]);

  // Either image can stand in for the other, but nothing is ever fabricated.
  const primary = "url" in lockup ? lockup : "url" in icon ? icon : null;
  if (!primary) {
    const reasons = [...new Set([(lockup as { failure: string }).failure, (icon as { failure: string }).failure])];
    return { data: emptyLogo("error"), source: "deterministic", note: reasons.join(",") };
  }

  const data: LogoAsset = {
    generated: true,
    imageUrl: primary.url,
    iconUrl: "url" in icon ? icon.url : primary.url,
    prompt: lockupPrompt,
    model: primary.model || imageModel(),
    status: "generated",
    concept: brand.logo?.concept?.trim()
      ? brand.logo.concept
      : `A bespoke ${input.style.split(" / ")[0]!.toLowerCase()} mark for ${brand.name}, generated to express ${valueProp.slice(0, 120)}.`,
  };

  const partial = "failure" in lockup ? lockup.failure : "failure" in icon ? icon.failure : undefined;
  return { data, source: "llm", ...(partial ? { note: `partial:${partial}` } : {}) };
}
