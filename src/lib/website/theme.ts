import { getSwatch, readableTextColor } from "@/lib/engine/color";
import type { Brand } from "@/lib/types";
import { clip, websiteThemeSchema, type WebsiteTheme } from "@/lib/website/model";

/** Website theme tokens taken from the brand identity; invalid values fall back to neutral defaults. */
export function themeFromBrand(brand: Brand): WebsiteTheme {
  const color = (role: Parameters<typeof getSwatch>[1], fallback: string) => {
    const hex = getSwatch(brand.palette, role);
    return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : fallback;
  };
  const primary = color("primary", "#1f2937");
  const logo = brand.logo.generated ? websiteThemeSchema.shape.logoUrl.safeParse(brand.logo.imageUrl || undefined) : null;
  const font = (value: string, fallback: string) => clip(value || fallback, 60);
  return {
    colors: {
      primary,
      secondary: color("secondary", primary),
      accent: color("accent", primary),
      ink: color("neutral-dark", "#111827"),
      surface: color("surface", "#ffffff"),
      onPrimary: readableTextColor(primary),
    },
    fonts: {
      heading: font(brand.typography.headingFont, "system-ui"),
      headingFallback: font(brand.typography.headingFallback, "sans-serif"),
      body: font(brand.typography.bodyFont, "system-ui"),
      bodyFallback: font(brand.typography.bodyFallback, "sans-serif"),
    },
    ...(logo?.success && logo.data ? { logoUrl: logo.data } : {}),
  };
}
