import type { ColorSwatch } from "@/lib/types";
import { getSwatch, readableTextColor } from "@/lib/engine/color";
import { escapeXml } from "@/lib/utils";

/**
 * Generates real social/advertising creatives as self-contained SVG documents.
 * Square (1080×1080) for Instagram, landscape (1200×628) for Meta ads.
 */

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

interface CreativeOptions {
  palette: ColorSwatch[];
  brandName: string;
  headline: string;
  subtext?: string;
  cta?: string;
  badge?: string;
  headingFont: string;
  variant: number;
}

export function instagramCreative(opts: CreativeOptions): string {
  const primary = getSwatch(opts.palette, "primary");
  const secondary = getSwatch(opts.palette, "secondary");
  const accent = getSwatch(opts.palette, "accent");
  const surface = getSwatch(opts.palette, "surface");
  const ink = getSwatch(opts.palette, "neutral-dark");
  const variant = opts.variant % 3;

  const onPrimary = readableTextColor(primary);
  const headlineLines = wrapText(opts.headline, 18);
  const fontFamily = `${opts.headingFont}, system-ui, sans-serif`;

  // Three visual templates rotated by variant.
  if (variant === 0) {
    // Gradient hero
    const startY = 540 - (headlineLines.length - 1) * 45;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">
      <defs><linearGradient id="ig0" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${primary}"/><stop offset="100%" stop-color="${secondary}"/></linearGradient></defs>
      <rect width="1080" height="1080" fill="url(#ig0)"/>
      <circle cx="880" cy="220" r="320" fill="${accent}" opacity="0.18"/>
      <circle cx="180" cy="940" r="240" fill="${onPrimary}" opacity="0.06"/>
      ${opts.badge ? `<rect x="80" y="110" width="${opts.badge.length * 17 + 56}" height="56" rx="28" fill="${onPrimary}" opacity="0.16"/><text x="108" y="146" font-family="Inter, sans-serif" font-size="24" font-weight="700" fill="${onPrimary}">${escapeXml(opts.badge.toUpperCase())}</text>` : ""}
      ${headlineLines.map((l, i) => `<text x="80" y="${startY + i * 92}" font-family="${fontFamily}" font-size="78" font-weight="800" fill="${onPrimary}" letter-spacing="-2">${escapeXml(l)}</text>`).join("")}
      ${opts.subtext ? `<text x="80" y="${startY + headlineLines.length * 92 + 30}" font-family="Inter, sans-serif" font-size="30" font-weight="400" fill="${onPrimary}" opacity="0.85">${escapeXml(opts.subtext.slice(0, 60))}</text>` : ""}
      ${opts.cta ? `<rect x="80" y="900" width="${opts.cta.length * 18 + 80}" height="72" rx="36" fill="${onPrimary}"/><text x="120" y="946" font-family="Inter, sans-serif" font-size="28" font-weight="700" fill="${primary}">${escapeXml(opts.cta)}</text>` : ""}
      <text x="80" y="1030" font-family="Inter, sans-serif" font-size="26" font-weight="700" fill="${onPrimary}" opacity="0.9">${escapeXml(opts.brandName)}</text>
    </svg>`;
  }

  if (variant === 1) {
    // Editorial light
    const startY = 470 - (headlineLines.length - 1) * 40;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">
      <rect width="1080" height="1080" fill="${surface}"/>
      <rect x="0" y="0" width="1080" height="14" fill="${primary}"/>
      <rect x="80" y="120" width="120" height="8" rx="4" fill="${accent}"/>
      ${headlineLines.map((l, i) => `<text x="80" y="${startY + i * 84}" font-family="${fontFamily}" font-size="72" font-weight="700" fill="${ink}" letter-spacing="-1.5">${escapeXml(l)}</text>`).join("")}
      ${opts.subtext ? wrapText(opts.subtext, 46).slice(0, 3).map((l, i) => `<text x="80" y="${startY + headlineLines.length * 84 + 40 + i * 40}" font-family="Inter, sans-serif" font-size="28" fill="${ink}" opacity="0.7">${escapeXml(l)}</text>`).join("") : ""}
      ${opts.cta ? `<rect x="80" y="900" width="${opts.cta.length * 18 + 80}" height="72" rx="12" fill="${primary}"/><text x="120" y="946" font-family="Inter, sans-serif" font-size="28" font-weight="700" fill="${onPrimary}">${escapeXml(opts.cta)}</text>` : ""}
      <text x="1000" y="1030" text-anchor="end" font-family="Inter, sans-serif" font-size="26" font-weight="700" fill="${primary}">${escapeXml(opts.brandName)}</text>
    </svg>`;
  }

  // Bold dark
  const startY = 520 - (headlineLines.length - 1) * 46;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">
    <rect width="1080" height="1080" fill="${ink}"/>
    <circle cx="540" cy="540" r="380" fill="none" stroke="${primary}" stroke-width="2" opacity="0.3"/>
    <circle cx="540" cy="540" r="280" fill="none" stroke="${accent}" stroke-width="2" opacity="0.3"/>
    ${opts.badge ? `<text x="80" y="150" font-family="Inter, sans-serif" font-size="26" font-weight="800" fill="${accent}" letter-spacing="4">${escapeXml(opts.badge.toUpperCase())}</text>` : ""}
    ${headlineLines.map((l, i) => `<text x="80" y="${startY + i * 94}" font-family="${fontFamily}" font-size="80" font-weight="800" fill="#ffffff" letter-spacing="-2">${escapeXml(l)}</text>`).join("")}
    ${opts.subtext ? `<text x="80" y="${startY + headlineLines.length * 94 + 30}" font-family="Inter, sans-serif" font-size="30" fill="#ffffff" opacity="0.7">${escapeXml(opts.subtext.slice(0, 56))}</text>` : ""}
    ${opts.cta ? `<rect x="80" y="900" width="${opts.cta.length * 18 + 80}" height="72" rx="36" fill="${accent}"/><text x="120" y="946" font-family="Inter, sans-serif" font-size="28" font-weight="700" fill="${readableTextColor(accent)}">${escapeXml(opts.cta)}</text>` : ""}
    <text x="80" y="1030" font-family="Inter, sans-serif" font-size="26" font-weight="700" fill="#ffffff" opacity="0.85">${escapeXml(opts.brandName)}</text>
  </svg>`;
}

export function facebookAdCreative(opts: CreativeOptions): string {
  const primary = getSwatch(opts.palette, "primary");
  const secondary = getSwatch(opts.palette, "secondary");
  const accent = getSwatch(opts.palette, "accent");
  const onPrimary = readableTextColor(primary);
  const headlineLines = wrapText(opts.headline, 24);
  const fontFamily = `${opts.headingFont}, system-ui, sans-serif`;
  const startY = 300 - (headlineLines.length - 1) * 34;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 628" width="1200" height="628">
    <defs><linearGradient id="fb" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${primary}"/><stop offset="100%" stop-color="${secondary}"/></linearGradient></defs>
    <rect width="1200" height="628" fill="url(#fb)"/>
    <circle cx="1050" cy="120" r="260" fill="${accent}" opacity="0.2"/>
    <rect x="0" y="0" width="640" height="628" fill="${onPrimary}" opacity="0.04"/>
    ${opts.badge ? `<rect x="72" y="80" width="${opts.badge.length * 15 + 48}" height="48" rx="24" fill="${onPrimary}" opacity="0.18"/><text x="96" y="111" font-family="Inter, sans-serif" font-size="22" font-weight="700" fill="${onPrimary}">${escapeXml(opts.badge.toUpperCase())}</text>` : ""}
    ${headlineLines.map((l, i) => `<text x="72" y="${startY + i * 68}" font-family="${fontFamily}" font-size="58" font-weight="800" fill="${onPrimary}" letter-spacing="-1.5">${escapeXml(l)}</text>`).join("")}
    ${opts.subtext ? wrapText(opts.subtext, 50).slice(0, 2).map((l, i) => `<text x="72" y="${startY + headlineLines.length * 68 + 26 + i * 34}" font-family="Inter, sans-serif" font-size="26" fill="${onPrimary}" opacity="0.85">${escapeXml(l)}</text>`).join("") : ""}
    ${opts.cta ? `<rect x="72" y="500" width="${opts.cta.length * 16 + 72}" height="64" rx="32" fill="${onPrimary}"/><text x="108" y="540" font-family="Inter, sans-serif" font-size="26" font-weight="700" fill="${primary}">${escapeXml(opts.cta)}</text>` : ""}
    <text x="1128" y="580" text-anchor="end" font-family="Inter, sans-serif" font-size="24" font-weight="700" fill="${onPrimary}" opacity="0.9">${escapeXml(opts.brandName)}</text>
  </svg>`;
}
