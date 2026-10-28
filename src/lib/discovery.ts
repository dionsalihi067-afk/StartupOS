import { z } from "zod";
import { BUSINESS_STYLES } from "@/lib/styles";

/**
 * Business Discovery: the structured answers collected before generation.
 * Option values are stable identifiers; labels live in the message files
 * (`discovery.options.*`). Stored inside `BusinessInput.discovery`.
 */

export const STAGES = ["idea", "preparing", "operating", "growing"] as const;
export const BUSINESS_TYPES = ["online", "physical", "both"] as const;
/** Option values are message keys too, so none may be named "other" (reserved for plural forms). */
export const CATEGORIES = ["food", "software", "services", "ecommerce", "general"] as const;
export const CUSTOMER_TYPES = ["b2c", "b2b", "both"] as const;
export const OFFER_STATUSES = ["planned", "existing"] as const;
export const REVENUE_MODELS = ["oneTime", "recurring", "subscription", "commission", "custom"] as const;
export const SALES_CHANNELS = ["website", "social", "marketplace", "store", "direct", "messaging", "partners"] as const;
export const TONES = ["professional", "friendly", "bold", "calm", "playful", "expert"] as const;
export const CONTENT_LANGUAGES = ["sq", "en", "both"] as const;
export const PRIORITIES = ["launch", "customers", "sales", "brand", "website", "growth"] as const;
export const TIMEFRAMES = ["1m", "3m", "6m", "12m"] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * Category-specific follow-up questions. Kept as data so new categories or
 * questions are added here (plus their labels) without touching the wizard.
 */
export type AdaptiveQuestion =
  | { id: string; kind: "text"; max: number }
  | { id: string; kind: "multi"; options: readonly string[] };

export const ADAPTIVE_QUESTIONS: Record<Category, readonly AdaptiveQuestion[]> = {
  food: [
    { id: "service", kind: "multi", options: ["dineIn", "takeaway", "delivery", "catering"] },
    { id: "cuisine", kind: "text", max: 120 },
    { id: "serviceArea", kind: "text", max: 160 },
  ],
  software: [
    { id: "targetCompanies", kind: "text", max: 160 },
    { id: "productType", kind: "multi", options: ["webApp", "mobileApp", "api", "desktop"] },
    { id: "pricingModel", kind: "multi", options: ["freemium", "trial", "perSeat", "usage", "flat"] },
  ],
  services: [
    { id: "serviceType", kind: "text", max: 160 },
    { id: "serviceArea", kind: "text", max: 160 },
    { id: "capacity", kind: "text", max: 120 },
  ],
  ecommerce: [
    { id: "productCategory", kind: "text", max: 160 },
    { id: "fulfillment", kind: "multi", options: ["ownStock", "dropshipping", "printOnDemand", "madeToOrder"] },
    { id: "shipsTo", kind: "text", max: 160 },
  ],
  general: [],
};

const text = (max: number) => z.string().trim().max(max).default("");
const required = (min: number, max: number) => z.string().trim().min(min).max(max);

export const discoveryBusinessSchema = z.object({
  name: text(80),
  idea: required(3, 600),
  offering: text(300),
  stage: z.enum(STAGES),
  type: z.enum(BUSINESS_TYPES),
  category: z.enum(CATEGORIES),
  location: required(2, 160),
});

export const discoveryCustomerSchema = z.object({
  ideal: required(2, 300),
  type: z.enum(CUSTOMER_TYPES),
  problem: text(400),
  need: text(400),
  geography: text(160),
});

export const discoveryOfferSchema = z.object({
  main: text(200),
  others: text(400),
  priceRange: text(120),
  priceUnknown: z.boolean().default(false),
  differentiator: text(400),
  status: z.enum(OFFER_STATUSES),
  details: z.record(z.string().max(60), z.union([z.string().trim().max(160), z.array(z.string().max(40)).max(10)])).default({}),
});

export const discoveryModelSchema = z.object({
  revenue: z.array(z.enum(REVENUE_MODELS)).min(1).max(REVENUE_MODELS.length),
  budget: text(120),
  budgetUnknown: z.boolean().default(false),
  channels: z.array(z.enum(SALES_CHANNELS)).max(SALES_CHANNELS.length).default([]),
  currentRevenue: text(120),
  currentCustomers: text(120),
});

export const discoveryMarketSchema = z.object({
  competitors: text(400),
  alternatives: text(400),
  positioning: text(300),
  difference: text(400),
  challenges: text(400),
});

export const discoveryBrandSchema = z.object({
  style: z.enum(BUSINESS_STYLES),
  references: text(300),
  colors: text(120),
  avoidColors: text(120),
  tone: z.enum(TONES),
  language: z.enum(CONTENT_LANGUAGES),
  notes: text(300),
});

export const discoveryGoalsSchema = z.object({
  goal: text(300),
  priority: z.enum(PRIORITIES),
  outcome: text(300),
  timeframe: z.enum(TIMEFRAMES).optional(),
});

export const discoverySchema = z.object({
  business: discoveryBusinessSchema,
  customer: discoveryCustomerSchema,
  offer: discoveryOfferSchema,
  model: discoveryModelSchema,
  market: discoveryMarketSchema,
  brand: discoveryBrandSchema,
  goals: discoveryGoalsSchema,
});

export type Discovery = z.infer<typeof discoverySchema>;
export type DiscoverySectionKey = keyof Discovery;

export const DISCOVERY_SECTIONS = ["business", "customer", "offer", "model", "market", "brand", "goals"] as const satisfies readonly DiscoverySectionKey[];

export const DISCOVERY_SECTION_SCHEMAS = {
  business: discoveryBusinessSchema,
  customer: discoveryCustomerSchema,
  offer: discoveryOfferSchema,
  model: discoveryModelSchema,
  market: discoveryMarketSchema,
  brand: discoveryBrandSchema,
  goals: discoveryGoalsSchema,
} as const;

/** Value the engine receives when the owner has not set a budget yet. */
export const FLEXIBLE_BUDGET = "flexible";

/** Maps discovery answers onto the core fields the generation engine reads. */
export function toEngineFields(d: Discovery) {
  return {
    idea: d.business.idea,
    audience: d.customer.ideal,
    location: d.business.location,
    budget: d.model.budgetUnknown || !d.model.budget ? FLEXIBLE_BUDGET : d.model.budget,
    style: d.brand.style,
  };
}

/**
 * Builds a complete BusinessInput from discovery answers. Prefer this over
 * assembling the object at call sites so create and edit stay aligned.
 */
export function toBusinessInput(d: Discovery) {
  return { ...toEngineFields(d), discovery: d };
}

const LANGUAGE_NAMES: Record<(typeof CONTENT_LANGUAGES)[number], string> = {
  sq: "Albanian",
  en: "English",
  both: "Albanian and English",
};

/**
 * Compact owner brief appended to generation prompts. Only answered fields are
 * included; everything is labelled as the owner's own input, not verified fact.
 */
export function discoveryBrief(d: Discovery): string {
  const lines: string[] = [];
  const add = (label: string, value: string | string[] | undefined) => {
    const v = Array.isArray(value) ? value.join(", ") : value?.trim();
    if (v) lines.push(`- ${label}: ${v}`);
  };

  add("Business name (use exactly)", d.business.name);
  add("What it sells", d.business.offering);
  add("Stage", d.business.stage);
  add("Business type", d.business.type);
  add("Category", d.business.category);
  add("Customer type", d.customer.type);
  add("Customer problem", d.customer.problem);
  add("Customer need", d.customer.need);
  add("Geographic target", d.customer.geography);
  add("Main offer", d.offer.main);
  add("Other products/services", d.offer.others);
  add("Expected price range", d.offer.priceUnknown ? "not decided yet" : d.offer.priceRange);
  add("Differentiator", d.offer.differentiator);
  add("Offer status", d.offer.status);
  for (const q of ADAPTIVE_QUESTIONS[d.business.category]) add(q.id, d.offer.details[q.id]);
  add("Revenue model", d.model.revenue);
  add("Sales channels", d.model.channels);
  add("Current revenue", d.model.currentRevenue);
  add("Current customers", d.model.currentCustomers);
  add("Competitors named by the owner (unverified)", d.market.competitors);
  add("Alternatives customers use (unverified)", d.market.alternatives);
  add("Desired positioning", d.market.positioning);
  add("What they want to do differently", d.market.difference);
  add("Known market difficulties", d.market.challenges);
  add("Brand references", d.brand.references);
  add("Preferred colors", d.brand.colors);
  add("Colors to avoid", d.brand.avoidColors);
  add("Tone", d.brand.tone);
  add("Other brand notes", d.brand.notes);
  add("Main goal", d.goals.goal);
  add("Top priority", d.goals.priority);
  add("Desired outcome", d.goals.outcome);
  add("Timeframe", d.goals.timeframe);

  return [
    "Owner brief (the owner's own answers; treat competitor and market statements as unverified):",
    ...lines,
    `Write customer-facing copy in ${LANGUAGE_NAMES[d.brand.language]}.`,
  ].join("\n");
}
