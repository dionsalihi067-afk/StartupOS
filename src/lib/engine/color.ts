import type { BusinessStyle, ColorSwatch } from "@/lib/types";
import { clamp } from "@/lib/utils";

/** HSL → HEX. h in [0,360), s/l in [0,100]. */
export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Relative luminance per WCAG. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const a = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0]! + 0.7152 * a[1]! + 0.0722 * a[2]!;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Returns black or white — whichever is most readable on the given color. */
export function readableTextColor(bg: string): string {
  return contrastRatio(bg, "#ffffff") >= contrastRatio(bg, "#0b0b10") ? "#ffffff" : "#0b0b10";
}

interface StyleColorProfile {
  hueBase: number;
  hueSpread: number;
  primarySat: number;
  primaryLight: number;
  accentShift: number;
  surfaceLight: number;
}

const STYLE_PROFILES: Record<BusinessStyle, StyleColorProfile> = {
  "Premium / Luxury": { hueBase: 280, hueSpread: 40, primarySat: 32, primaryLight: 28, accentShift: 45, surfaceLight: 97 },
  "Modern / Minimal": { hueBase: 222, hueSpread: 30, primarySat: 70, primaryLight: 52, accentShift: 165, surfaceLight: 98 },
  "Bold / Energetic": { hueBase: 12, hueSpread: 60, primarySat: 86, primaryLight: 54, accentShift: 190, surfaceLight: 98 },
  "Friendly / Approachable": { hueBase: 195, hueSpread: 50, primarySat: 74, primaryLight: 52, accentShift: 140, surfaceLight: 98 },
  "Corporate / Professional": { hueBase: 215, hueSpread: 24, primarySat: 48, primaryLight: 38, accentShift: 30, surfaceLight: 98 },
  "Playful / Creative": { hueBase: 330, hueSpread: 80, primarySat: 82, primaryLight: 58, accentShift: 130, surfaceLight: 99 },
  "Tech / Futuristic": { hueBase: 250, hueSpread: 70, primarySat: 80, primaryLight: 56, accentShift: 110, surfaceLight: 99 },
  "Organic / Natural": { hueBase: 120, hueSpread: 40, primarySat: 44, primaryLight: 40, accentShift: 40, surfaceLight: 97 },
};

/**
 * Generates a 6-color brand palette tailored to the chosen style, with a
 * deterministic hue offset derived from the seed so two "Modern" brands
 * don't look identical.
 */
export function generatePalette(style: BusinessStyle, rng: () => number): ColorSwatch[] {
  const p = STYLE_PROFILES[style];
  const hueOffset = Math.floor((rng() - 0.5) * p.hueSpread);
  const primaryHue = p.hueBase + hueOffset;
  const secondaryHue = primaryHue + 18;
  const accentHue = primaryHue + p.accentShift;

  const primary = hslToHex(primaryHue, p.primarySat, p.primaryLight);
  const secondary = hslToHex(secondaryHue, clamp(p.primarySat - 14, 20, 90), clamp(p.primaryLight + 14, 20, 70));
  const accent = hslToHex(accentHue, clamp(p.primarySat + 6, 30, 95), clamp(p.primaryLight + 6, 35, 66));
  const neutralDark = hslToHex(primaryHue, 18, 11);
  const neutralLight = hslToHex(primaryHue, 14, 92);
  const surface = hslToHex(primaryHue, 22, p.surfaceLight);

  return [
    { name: "Primary", hex: primary, role: "primary", usage: "Primary actions, links, key brand surfaces." },
    { name: "Secondary", hex: secondary, role: "secondary", usage: "Supporting elements, gradients, highlights." },
    { name: "Accent", hex: accent, role: "accent", usage: "Emphasis, badges, hover states, callouts." },
    { name: "Ink", hex: neutralDark, role: "neutral-dark", usage: "Headings and primary text on light surfaces." },
    { name: "Mist", hex: neutralLight, role: "neutral-light", usage: "Borders, dividers, muted backgrounds." },
    { name: "Surface", hex: surface, role: "surface", usage: "Page and card backgrounds." },
  ];
}

export function getSwatch(palette: ColorSwatch[], role: ColorSwatch["role"]): string {
  return palette.find((s) => s.role === role)?.hex ?? "#4f46e5";
}
