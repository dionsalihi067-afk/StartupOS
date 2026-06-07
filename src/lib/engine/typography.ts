import type { BusinessStyle, TypographySystem } from "@/lib/types";
import { pick } from "@/lib/utils";

interface FontPair {
  heading: string;
  headingFallback: string;
  body: string;
  bodyFallback: string;
  /** Google Fonts family query segments. */
  gf: string[];
}

const STYLE_FONTS: Record<BusinessStyle, FontPair[]> = {
  "Premium / Luxury": [
    { heading: "Playfair Display", headingFallback: "Georgia, serif", body: "Inter", bodyFallback: "system-ui, sans-serif", gf: ["Playfair+Display:wght@500;600;700", "Inter:wght@400;500;600"] },
    { heading: "Cormorant Garamond", headingFallback: "Georgia, serif", body: "Mulish", bodyFallback: "system-ui, sans-serif", gf: ["Cormorant+Garamond:wght@500;600;700", "Mulish:wght@400;500;600"] },
  ],
  "Modern / Minimal": [
    { heading: "Inter", headingFallback: "system-ui, sans-serif", body: "Inter", bodyFallback: "system-ui, sans-serif", gf: ["Inter:wght@400;500;600;700;800"] },
    { heading: "Space Grotesk", headingFallback: "system-ui, sans-serif", body: "Inter", bodyFallback: "system-ui, sans-serif", gf: ["Space+Grotesk:wght@500;600;700", "Inter:wght@400;500;600"] },
  ],
  "Bold / Energetic": [
    { heading: "Montserrat", headingFallback: "Arial, sans-serif", body: "Open Sans", bodyFallback: "system-ui, sans-serif", gf: ["Montserrat:wght@600;700;800;900", "Open+Sans:wght@400;500;600"] },
    { heading: "Archivo", headingFallback: "Arial, sans-serif", body: "Inter", bodyFallback: "system-ui, sans-serif", gf: ["Archivo:wght@600;700;800", "Inter:wght@400;500;600"] },
  ],
  "Friendly / Approachable": [
    { heading: "Poppins", headingFallback: "Arial, sans-serif", body: "Nunito Sans", bodyFallback: "system-ui, sans-serif", gf: ["Poppins:wght@500;600;700", "Nunito+Sans:wght@400;600;700"] },
    { heading: "Quicksand", headingFallback: "Arial, sans-serif", body: "Nunito", bodyFallback: "system-ui, sans-serif", gf: ["Quicksand:wght@500;600;700", "Nunito:wght@400;600;700"] },
  ],
  "Corporate / Professional": [
    { heading: "Libre Franklin", headingFallback: "Arial, sans-serif", body: "Source Sans 3", bodyFallback: "system-ui, sans-serif", gf: ["Libre+Franklin:wght@500;600;700", "Source+Sans+3:wght@400;500;600"] },
    { heading: "IBM Plex Sans", headingFallback: "Arial, sans-serif", body: "IBM Plex Sans", bodyFallback: "system-ui, sans-serif", gf: ["IBM+Plex+Sans:wght@400;500;600;700"] },
  ],
  "Playful / Creative": [
    { heading: "Fraunces", headingFallback: "Georgia, serif", body: "DM Sans", bodyFallback: "system-ui, sans-serif", gf: ["Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700", "DM+Sans:wght@400;500;600"] },
    { heading: "Clash Display", headingFallback: "system-ui, sans-serif", body: "DM Sans", bodyFallback: "system-ui, sans-serif", gf: ["Sora:wght@600;700;800", "DM+Sans:wght@400;500;600"] },
  ],
  "Tech / Futuristic": [
    { heading: "Space Grotesk", headingFallback: "system-ui, sans-serif", body: "IBM Plex Mono", bodyFallback: "ui-monospace, monospace", gf: ["Space+Grotesk:wght@500;600;700", "IBM+Plex+Mono:wght@400;500;600"] },
    { heading: "Sora", headingFallback: "system-ui, sans-serif", body: "Inter", bodyFallback: "system-ui, sans-serif", gf: ["Sora:wght@600;700;800", "Inter:wght@400;500;600"] },
  ],
  "Organic / Natural": [
    { heading: "Fraunces", headingFallback: "Georgia, serif", body: "Mulish", bodyFallback: "system-ui, sans-serif", gf: ["Fraunces:opsz,wght@9..144,500;9..144,600", "Mulish:wght@400;500;600"] },
    { heading: "Lora", headingFallback: "Georgia, serif", body: "Work Sans", bodyFallback: "system-ui, sans-serif", gf: ["Lora:wght@500;600;700", "Work+Sans:wght@400;500;600"] },
  ],
};

export function generateTypography(style: BusinessStyle, rng: () => number): TypographySystem {
  const pair = pick(rng, STYLE_FONTS[style]);
  const href = `https://fonts.googleapis.com/css2?${pair.gf
    .map((f) => `family=${f}`)
    .join("&")}&display=swap`;

  return {
    headingFont: pair.heading,
    headingFallback: pair.headingFallback,
    bodyFont: pair.body,
    bodyFallback: pair.bodyFallback,
    googleFontsHref: href,
    scale: [
      { label: "Display", sizePx: 64, weight: 700, lineHeight: 1.05, letterSpacing: "-0.03em" },
      { label: "H1", sizePx: 48, weight: 700, lineHeight: 1.1, letterSpacing: "-0.02em" },
      { label: "H2", sizePx: 36, weight: 600, lineHeight: 1.15, letterSpacing: "-0.01em" },
      { label: "H3", sizePx: 24, weight: 600, lineHeight: 1.25, letterSpacing: "-0.01em" },
      { label: "Body Large", sizePx: 18, weight: 400, lineHeight: 1.6, letterSpacing: "0" },
      { label: "Body", sizePx: 16, weight: 400, lineHeight: 1.65, letterSpacing: "0" },
      { label: "Caption", sizePx: 13, weight: 500, lineHeight: 1.4, letterSpacing: "0.02em" },
    ],
  };
}
