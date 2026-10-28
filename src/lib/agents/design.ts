import type { Brand, BrandGuideline, LogoAsset } from "@/lib/types";
import type { AgentOutput, GenerationContext } from "@/lib/agents/context";
import type { VerbalIdentity } from "@/lib/agents/brand";
import { generatePalette } from "@/lib/engine/color";
import { generateTypography } from "@/lib/engine/typography";

/**
 * Design Agent — converts the verbal identity into the visual system: color
 * palette, typography and brand guidelines. The actual logo is produced
 * downstream by the Logo Agent via real image generation, so the brand carries
 * an un-generated logo placeholder here (never a fabricated static SVG).
 */
export function runDesignAgent(ctx: GenerationContext, verbal: VerbalIdentity): AgentOutput<Brand> {
  const { input, rng } = ctx;
  const palette = generatePalette(input.style, rng);
  const typography = generateTypography(input.style, rng);

  const logo: LogoAsset = {
    generated: false,
    imageUrl: "",
    iconUrl: "",
    prompt: "",
    model: null,
    status: "unavailable",
    concept: verbal.logoConcept || "",
  };

  const guidelines: BrandGuideline[] = [
    { title: "Logo clear space", rule: `Always preserve clear space around the logo equal to the height of the "${verbal.name.charAt(0)}" mark.` },
    { title: "Minimum size", rule: "Never display the icon below 24px or the full lockup below 120px wide." },
    { title: "Color usage", rule: `Lead with ${palette[0]!.name} (${palette[0]!.hex}). Use ${palette[2]!.name} sparingly for emphasis only.` },
    { title: "Typography", rule: `Set headlines in ${typography.headingFont} and body copy in ${typography.bodyFont}. Maintain generous line height for readability.` },
    { title: "Do not", rule: "Never stretch, recolor outside the palette, add drop shadows, or place the logo on low-contrast backgrounds." },
    { title: "Tone of voice", rule: `Keep the voice ${verbal.voice.join(", ").toLowerCase()}. Be human, never robotic.` },
  ];

  const brand: Brand = {
    name: verbal.name,
    slogan: verbal.slogan,
    description: verbal.description,
    mission: verbal.mission,
    vision: verbal.vision,
    values: verbal.values,
    voice: verbal.voice,
    personality: verbal.personality,
    logo,
    palette,
    typography,
    guidelines,
  };

  return { data: brand, source: "deterministic" };
}
