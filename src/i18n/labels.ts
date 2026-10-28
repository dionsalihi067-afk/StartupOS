import type { BusinessStyle } from "@/lib/types";
import type { Messages } from "@/i18n/messages";

/**
 * Stored values (style enums, agent names) stay in English because the
 * generator and saved packages depend on them. These maps give each value a
 * translation key for display only.
 */

export type StyleKey = keyof Messages["styles"];

export const STYLE_KEYS: Record<BusinessStyle, StyleKey> = {
  "Premium / Luxury": "premiumLuxury",
  "Modern / Minimal": "modernMinimal",
  "Bold / Energetic": "boldEnergetic",
  "Friendly / Approachable": "friendlyApproachable",
  "Corporate / Professional": "corporateProfessional",
  "Playful / Creative": "playfulCreative",
  "Tech / Futuristic": "techFuturistic",
  "Organic / Natural": "organicNatural",
};

export type StepKey = keyof Messages["steps"];

/** Agent names as recorded in `pkg.meta.agentLog` and the generation stream. */
export const AGENT_STEP_KEYS: Record<string, StepKey> = {
  "Brand Agent": "brand",
  "Design Agent": "design",
  "Logo Agent": "logo",
  "Persona Agent": "persona",
  "Competitor Agent": "competitor",
  "Market Research Agent": "market",
  "Pricing Agent": "pricing",
  "Strategy Agent": "strategy",
  "Website Agent": "website",
  "SEO Agent": "seo",
  "Marketing Agent": "marketing",
  "Email Agent": "email",
  "WhatsApp Agent": "whatsapp",
  "Growth Agent": "growth",
  "Launch Agent": "launch",
  "Publisher Agent": "publisher",
};
