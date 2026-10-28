import { z } from "zod";
import { SITE_ARCHETYPES, SITE_LAYOUTS } from "@/lib/website/brief";

/**
 * Website specification: the structured, renderer-safe description of a
 * generated website. It is data only — no markup, styles or scripts — and every
 * link points to one of the site's own pages. The renderer owns all UI.
 */

export const WEBSITE_LANGUAGES = ["sq", "en"] as const;
export type WebsiteLanguage = (typeof WEBSITE_LANGUAGES)[number];

/** "/" or lowercase, hyphenated path segments ("/about", "/our-menu"). */
export const SLUG_PATTERN = /^\/$|^(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)+$/;
const slug = z.string().regex(SLUG_PATTERN, "invalid page slug");
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "invalid color");
/** Only same-site paths or embedded raster images; never javascript:, protocol-relative or SVG data. */
const imageUrl = z
  .string()
  .max(4_000_000)
  .regex(/^(?:https:\/\/[^\s"'<>]+|\/(?!\/)[^\s"'<>]*|data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/, "invalid image url");

/** Collapses whitespace and shortens text to fit a schema limit. */
export function clip(value: string, max: number): string {
  const v = value.replace(/\s+/g, " ").trim();
  if (v.length <= max) return v;
  const cut = v.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:–—-]+$/, "")}…`;
}

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const linkSchema = z.object({ label: text(40), href: slug });
export type WebsiteLink = z.infer<typeof linkSchema>;

/** `price` is only ever a price the owner entered in Website setup, shown exactly as written. */
const item = z.object({ title: text(120), description: optionalText(400), price: optionalText(40) });

/**
 * Real ways to reach the business, built from owner-provided details. Each kind
 * has its own strict href shape; nothing else (javascript:, http:, data:) can pass.
 */
export const CONTACT_ACTION_KINDS = ["email", "phone", "whatsapp", "link", "social", "map"] as const;
const ACTION_HREF: Record<(typeof CONTACT_ACTION_KINDS)[number], RegExp> = {
  email: /^mailto:[^\s@<>"'?&]+@[^\s@<>"'?&]+\.[^\s@<>"'?&]+$/,
  phone: /^tel:\+?[0-9]{6,20}$/,
  whatsapp: /^https:\/\/wa\.me\/[0-9]{6,20}$/,
  link: /^https:\/\/[^\s"'<>\\]+$/,
  social: /^https:\/\/[^\s"'<>\\]+$/,
  map: /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=[A-Za-z0-9%._~+-]+$/,
};
export const contactActionSchema = z
  .object({ kind: z.enum(CONTACT_ACTION_KINDS), label: text(40), href: z.string().max(400) })
  .refine((a) => ACTION_HREF[a.kind].test(a.href), "invalid contact action");
export type ContactAction = z.infer<typeof contactActionSchema>;

export const OFFER_DISPLAYS = ["cards", "menu", "catalog", "list"] as const;

const heroSection = z.object({
  type: z.literal("hero"),
  id: text(40),
  heading: text(140),
  subheading: optionalText(320),
  primaryCta: linkSchema.optional(),
  secondaryCta: linkSchema.optional(),
  /** The owner's own photo shown full-bleed behind the hero; never a stock or generated stand-in. */
  image: z.object({ src: imageUrl, alt: text(160) }).optional(),
});

/** Benefits / reasons to choose the business. */
const featuresSection = z.object({
  type: z.literal("features"),
  id: text(40),
  heading: text(100),
  intro: optionalText(320),
  items: z.array(item).min(1).max(6),
});

/** What the business sells (services, products or menu items). */
const offerSection = z.object({
  type: z.literal("offer"),
  id: text(40),
  heading: text(100),
  intro: optionalText(320),
  items: z.array(item).min(1).max(12),
  /** menu: name–price rows · catalog: product cards · list: numbered service rows · cards (default). */
  display: z.enum(OFFER_DISPLAYS).optional(),
  /** Link to the page with the full list when this is a preview of it. */
  more: linkSchema.optional(),
});

const pricingSection = z.object({
  type: z.literal("pricing"),
  id: text(40),
  heading: text(100),
  intro: optionalText(320),
  tiers: z
    .array(
      z.object({
        name: text(60),
        /** Exactly as produced by the pricing engine (currency and billing period preserved); null = on request. */
        price: optionalText(40),
        cadence: z.string().max(30),
        description: optionalText(200),
        features: z.array(text(120)).max(6),
        highlighted: z.boolean(),
      }),
    )
    .min(1)
    .max(4),
  note: optionalText(240),
});

const aboutSection = z.object({
  type: z.literal("about"),
  id: text(40),
  heading: text(100),
  body: text(1200),
});

const faqSection = z.object({
  type: z.literal("faq"),
  id: text(40),
  heading: text(100),
  items: z
    .array(z.object({ question: text(200), answer: text(600) }))
    .min(1)
    .max(8),
});

const contactSection = z.object({
  type: z.literal("contact"),
  id: text(40),
  heading: text(100),
  intro: optionalText(320),
  /** Only details the owner actually provided. */
  details: z.array(z.object({ label: text(40), value: text(200) })).max(6),
  /** Opening hours exactly as the owner entered them. */
  hours: z.array(z.object({ days: text(40), time: text(60) })).max(7).optional(),
  /** Buttons that open a real channel (email, phone, WhatsApp, the owner's booking page, a map). */
  actions: z.array(contactActionSchema).max(8).optional(),
  /** True while the owner has not provided contact channels (email, phone…); the preview flags it. */
  channelsPending: z.boolean(),
});

const ctaSection = z.object({
  type: z.literal("cta"),
  id: text(40),
  heading: text(140),
  subheading: optionalText(240),
  cta: linkSchema,
});

export const websiteSectionSchema = z.discriminatedUnion("type", [
  heroSection,
  featuresSection,
  offerSection,
  pricingSection,
  aboutSection,
  faqSection,
  contactSection,
  ctaSection,
]);
export type WebsiteSectionSpec = z.infer<typeof websiteSectionSchema>;
export type WebsiteSectionType = WebsiteSectionSpec["type"];
export const WEBSITE_SECTION_TYPES = websiteSectionSchema.options.map((o) => o.shape.type.value);

export const websitePageSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,30}$/),
  slug,
  /** Short label used in navigation. */
  label: text(40),
  seo: z.object({
    title: text(70),
    description: text(170),
    canonicalPath: slug,
  }),
  sections: z.array(websiteSectionSchema).min(1).max(10),
});
export type WebsitePageSpec = z.infer<typeof websitePageSchema>;

export const websiteThemeSchema = z.object({
  colors: z.object({ primary: hex, secondary: hex, accent: hex, ink: hex, surface: hex, onPrimary: hex }),
  fonts: z.object({
    heading: text(60),
    headingFallback: text(60),
    body: text(60),
    bodyFallback: text(60),
  }),
  logoUrl: imageUrl.optional(),
});
export type WebsiteTheme = z.infer<typeof websiteThemeSchema>;

export const websiteSiteFields = {
  version: z.literal(1),
  siteName: text(80),
  tagline: optionalText(160),
  language: z.enum(WEBSITE_LANGUAGES),
  theme: websiteThemeSchema,
  primaryCta: linkSchema,
  navigation: z.array(linkSchema).min(1).max(6),
  /** Visual layout and kind of site; absent on sites built before Website setup (rendered as classic). */
  layout: z.enum(SITE_LAYOUTS).optional(),
  archetype: z.enum(SITE_ARCHETYPES).optional(),
};

/** Site-wide integrity rules shared by the specification and its publishable form. */
export function checkSiteIntegrity(
  site: { primaryCta: WebsiteLink; navigation: WebsiteLink[]; pages: WebsitePageSpec[] },
  ctx: z.RefinementCtx,
): void {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const slugs = site.pages.map((p) => p.slug);
  if (new Set(slugs).size !== slugs.length) issue("duplicate page slug");
  if (new Set(site.pages.map((p) => p.id)).size !== site.pages.length) issue("duplicate page id");
  if (site.pages[0]?.slug !== "/") issue("the first page must be the homepage (/)");
  const known = new Set(slugs);
  const links = [
    site.primaryCta,
    ...site.navigation,
    ...site.pages.flatMap((p) =>
      p.sections.flatMap((s) =>
        s.type === "hero" ? [s.primaryCta, s.secondaryCta] : s.type === "cta" ? [s.cta] : s.type === "offer" ? [s.more] : [],
      ),
    ),
  ].filter((l): l is WebsiteLink => l !== undefined);
  for (const l of links) if (!known.has(l.href)) issue(`link to unknown page ${l.href}`);
  for (const p of site.pages) {
    if (p.seo.canonicalPath !== p.slug) issue(`page ${p.slug} has a different canonical path`);
    const ids = p.sections.map((s) => s.id);
    if (new Set(ids).size !== ids.length) issue(`page ${p.slug} has duplicate section ids`);
  }
}

export const websiteSpecSchema = z
  .object({ ...websiteSiteFields, pages: z.array(websitePageSchema).min(1).max(6) })
  .superRefine(checkSiteIntegrity);
export type WebsiteSpec = z.infer<typeof websiteSpecSchema>;

/** The only way a spec reaches the renderer: validated, or null. */
export function parseWebsiteSpec(value: unknown): WebsiteSpec | null {
  const parsed = websiteSpecSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
