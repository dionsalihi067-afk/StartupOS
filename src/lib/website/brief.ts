import { z } from "zod";
import type { BusinessInput } from "@/lib/types";

/**
 * Website brief: what the owner tells us about the website itself — the kind of
 * site, what visitors should do, how they can reach the business and what it
 * sells. Every value is owner-provided (or prefilled from their discovery
 * answers and then confirmed); none is invented. The brief drives the site's
 * page structure, calls to action, contact actions and visual direction.
 */

export const SITE_ARCHETYPES = ["restaurant", "hospitality", "shop", "software", "professional", "localService", "creative", "general"] as const;
export type SiteArchetype = (typeof SITE_ARCHETYPES)[number];

export const SITE_GOALS = ["contact", "call", "visit", "book", "quote", "order", "signup"] as const;
export type SiteGoal = (typeof SITE_GOALS)[number];

export const SITE_LAYOUTS = ["classic", "editorial", "split", "bold"] as const;
export type SiteLayout = (typeof SITE_LAYOUTS)[number];
export const SITE_LAYOUT_CHOICES = ["auto", ...SITE_LAYOUTS] as const;

/** Which optional details are worth asking for, per kind of website. */
export const ARCHETYPE_FIELDS: Record<SiteArchetype, { hours: boolean; address: boolean; serviceArea: boolean }> = {
  restaurant: { hours: true, address: true, serviceArea: false },
  hospitality: { hours: false, address: true, serviceArea: false },
  shop: { hours: true, address: true, serviceArea: false },
  software: { hours: false, address: false, serviceArea: false },
  professional: { hours: true, address: true, serviceArea: true },
  localService: { hours: true, address: false, serviceArea: true },
  creative: { hours: false, address: false, serviceArea: true },
  general: { hours: true, address: true, serviceArea: true },
};

/** The goals that fit each kind of website, most typical first. */
export const ARCHETYPE_GOALS: Record<SiteArchetype, readonly SiteGoal[]> = {
  restaurant: ["visit", "book", "order", "call", "contact"],
  hospitality: ["book", "contact", "call"],
  shop: ["order", "visit", "contact"],
  software: ["signup", "contact"],
  professional: ["contact", "book", "call"],
  localService: ["quote", "call", "book", "contact"],
  creative: ["contact", "quote", "book"],
  general: ["contact", "call", "visit", "order", "book", "quote", "signup"],
};

const text = (max: number) => z.string().trim().max(max).default("");
const PHONE = /^\+?[0-9][0-9 ().-]{5,22}[0-9]$/;
const optionalPhone = z
  .string()
  .trim()
  .max(24)
  .refine((v) => v === "" || PHONE.test(v), "invalidPhone")
  .default("");
const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => {
    if (!/^https:\/\//i.test(v)) return false;
    try {
      const url = new URL(v);
      return url.protocol === "https:" && !url.username && !url.password && url.hostname.includes(".");
    } catch {
      return false;
    }
  }, "invalidUrl");

export const websiteItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: text(300),
  /** Only a price the owner actually charges, exactly as they wrote it; empty hides the price. */
  price: text(40),
});
export type WebsiteItem = z.infer<typeof websiteItemSchema>;

export const websiteBriefSchema = z.object({
  archetype: z.enum(SITE_ARCHETYPES),
  goal: z.enum(SITE_GOALS),
  layout: z.enum(SITE_LAYOUT_CHOICES).default("auto"),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "invalidEmail")
    .default(""),
  phone: optionalPhone,
  whatsapp: optionalPhone,
  address: text(200),
  serviceArea: text(200),
  hours: z.array(z.object({ days: z.string().trim().min(1).max(40), time: z.string().trim().min(1).max(60) })).max(7).default([]),
  /** The owner's existing booking, ordering or sign-up page. */
  actionUrl: z.union([z.literal(""), httpsUrl]).default(""),
  social: z.array(httpsUrl).max(3).default([]),
  items: z.array(websiteItemSchema).max(12).default([]),
  pages: z.object({ about: z.boolean().default(true), faq: z.boolean().default(true) }).default({}),
  /** A photo the owner uploaded for the top of the homepage (`/api/assets/<id>`); empty shows none. */
  heroImage: z.union([z.literal(""), z.string().regex(/^\/api\/assets\/ast_[0-9a-f]{32}$/)]).default(""),
  /** What the hero photo shows, for people who cannot see it. Required with a photo. */
  heroImageAlt: text(160),
}).refine((b) => b.heroImage === "" || b.heroImageAlt !== "", { path: ["heroImageAlt"], message: "required" });
export type WebsiteBrief = z.infer<typeof websiteBriefSchema>;

const HOSPITALITY = /\b(hotels?|hostels?|guest ?houses?|b&b|bed and breakfast|villas?|apartments? for rent|holiday (?:home|rental)s?|resorts?|lodges?|bujtin\w*|hotel\w*|akomodim\w*)\b/i;
const CREATIVE = /\b(photograph\w*|videograph\w*|illustrat\w*|artist|tattoo|portfolio|graphic design\w*|design studio|fotograf\w*)\b/i;
const RESTAURANT = /\b(restaurants?|caf[eé]s?|coffee|bakery|bakeries|bistro|pizzeria|food truck|catering|bar|pub|kitchen|restorant\w*|kafene\w*|furr[eë]\w*|pastiçeri\w*)\b/i;
const SOFTWARE = /\b(saas|software|app|platform|api|dashboard|tool)\b/i;
const LOCAL = /\b(cleaning|plumb\w*|electric\w*|repair\w*|detailing|car wash|landscap\w*|garden\w*|moving|handyman|salon|barber|nails?|renovation|construction|painting|pest control|laundry|childcare|dog walking|grooming|personal trainer|gym|courier|pastrim\w*|riparim\w*)\b/i;
const PROFESSIONAL = /\b(consult\w*|agency|accounting|bookkeeping|legal|law firm|lawyer|advoka\w*|recruit\w*|advisory|architect\w*|real estate|tax|insurance|clinic|dentist|therap\w*)\b/i;

/** Best-fitting kind of website for the business, from what the owner already said. */
export function deriveArchetype(input: BusinessInput): SiteArchetype {
  const d = input.discovery;
  const text = [input.idea, d?.business.offering, d?.offer.main, d?.offer.others].filter(Boolean).join(" ");
  if (HOSPITALITY.test(text)) return "hospitality";
  switch (d?.business.category) {
    case "food":
      return "restaurant";
    case "software":
      return "software";
    case "ecommerce":
      return "shop";
    case "services":
      if (CREATIVE.test(text)) return "creative";
      if (LOCAL.test(text)) return "localService";
      if (PROFESSIONAL.test(text)) return "professional";
      return d?.business.type === "physical" ? "localService" : "professional";
    default:
      break;
  }
  if (RESTAURANT.test(text)) return "restaurant";
  if (SOFTWARE.test(text)) return "software";
  if (CREATIVE.test(text)) return "creative";
  if (LOCAL.test(text)) return "localService";
  if (PROFESSIONAL.test(text)) return "professional";
  return "general";
}

function deriveGoal(archetype: SiteArchetype, input: BusinessInput): SiteGoal {
  const d = input.discovery;
  if (archetype === "restaurant") return d?.business.type === "online" ? "order" : "visit";
  if (archetype === "shop") return d?.business.type === "physical" ? "visit" : "order";
  return ARCHETYPE_GOALS[archetype][0]!;
}

/** Products, services or menu items the owner listed, as editable items (names only). */
function deriveItems(input: BusinessInput): WebsiteItem[] {
  const d = input.discovery;
  const listed = d ? [d.offer.main || d.business.offering, ...d.offer.others.split(/[,;\n]/)] : [input.idea];
  const names = [...new Set(listed.map((s) => s.replace(/\s+/g, " ").trim().slice(0, 120)).filter(Boolean))].slice(0, 12);
  return names.map((name) => ({ name, description: "", price: "" }));
}

/** A first brief from the discovery answers; the owner reviews and completes it in Website setup. */
export function deriveWebsiteBrief(input: BusinessInput): WebsiteBrief {
  const archetype = deriveArchetype(input);
  const d = input.discovery;
  const fields = ARCHETYPE_FIELDS[archetype];
  const physical = d?.business.type !== "online";
  const address = fields.address && physical ? input.location.slice(0, 200) : "";
  const area = fields.serviceArea ? (d?.customer.geography || (physical ? input.location : "")).slice(0, 200) : "";
  return websiteBriefSchema.parse({
    archetype,
    goal: deriveGoal(archetype, input),
    layout: "auto",
    address,
    serviceArea: area === address ? "" : area,
    items: deriveItems(input),
  });
}

/** The saved brief, or the derived one while the owner has not set the website up. */
export function websiteBriefOf(input: BusinessInput): WebsiteBrief {
  const saved = input.website ? websiteBriefSchema.safeParse(input.website) : null;
  return saved?.success ? saved.data : deriveWebsiteBrief(input);
}

const STYLE_LAYOUT: Record<string, SiteLayout> = {
  "Premium / Luxury": "editorial",
  "Modern / Minimal": "split",
  "Bold / Energetic": "bold",
  "Friendly / Approachable": "classic",
  "Corporate / Professional": "split",
  "Playful / Creative": "bold",
  "Tech / Futuristic": "bold",
  "Organic / Natural": "editorial",
};

/** The visual layout: the owner's choice, or the one that fits the brand style. */
export function resolveLayout(brief: WebsiteBrief, style: string): SiteLayout {
  return brief.layout === "auto" ? (STYLE_LAYOUT[style] ?? "classic") : brief.layout;
}

/** Whether visitors have at least one real way to reach or buy from the business. */
export function hasContactChannel(brief: WebsiteBrief): boolean {
  return Boolean(brief.email || brief.phone || brief.whatsapp || brief.actionUrl || brief.social.length > 0);
}

/** The goal the site can honestly promise: a booking or order button needs a way to book or order. */
export function effectiveGoal(brief: WebsiteBrief): SiteGoal {
  const direct = Boolean(brief.actionUrl || brief.phone || brief.whatsapp);
  switch (brief.goal) {
    case "call":
      return brief.phone ? "call" : "contact";
    case "book":
    case "order":
    case "signup":
      return direct || (brief.goal !== "signup" && Boolean(brief.email)) ? brief.goal : "contact";
    case "visit":
      return brief.address ? "visit" : "contact";
    default:
      return brief.goal;
  }
}
