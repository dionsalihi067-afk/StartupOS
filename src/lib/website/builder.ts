import { copyBriefFromInput } from "@/lib/agents/copy-brief";
import { CUSTOM_QUOTE, UNPRICED } from "@/lib/pricing/strategy";
import type { Brand, BusinessInput, PricingStrategy } from "@/lib/types";
import {
  effectiveGoal,
  hasContactChannel,
  resolveLayout,
  websiteBriefOf,
  type SiteArchetype,
  type SiteGoal,
  type WebsiteBrief,
} from "@/lib/website/brief";
import {
  clip,
  contactActionSchema,
  websiteSpecSchema,
  type ContactAction,
  type WebsiteLanguage,
  type WebsiteLink,
  type WebsitePageSpec,
  type WebsiteSectionSpec,
  type WebsiteSpec,
} from "@/lib/website/model";
import { themeFromBrand } from "@/lib/website/theme";
import { midSentence } from "@/lib/utils";

/**
 * Deterministic website builder. Every page and section is derived from the
 * owner's answers (discovery and Website setup), the generated brand and the
 * pricing engine's output — no reviews, statistics, contact details or other
 * business facts are invented. Sections without supporting data are left out.
 *
 * The kind of site (restaurant, hotel, shop, software, professional or local
 * service, creative studio) decides the page structure, how the offer is
 * displayed and what the main call to action asks visitors to do.
 */

type OfferDisplay = "cards" | "menu" | "catalog" | "list";

interface ArchetypeShape {
  slug: string;
  display: OfferDisplay;
  /** How many items the homepage previews when the offer has its own page. */
  preview: number;
  /** Home sections in order; "offer" is the full list or a preview, "visit"/"area" are location blocks. */
  home: readonly ("why" | "offer" | "pricing" | "about" | "visit" | "area")[];
  /** Whether "About" is its own page (otherwise it sits on the homepage when listed in `home`). */
  aboutPage: boolean;
}

const SHAPES: Record<SiteArchetype, ArchetypeShape> = {
  restaurant: { slug: "/menu", display: "menu", preview: 4, home: ["why", "offer", "visit"], aboutPage: true },
  hospitality: { slug: "/rooms", display: "cards", preview: 3, home: ["offer", "why", "visit"], aboutPage: true },
  shop: { slug: "/products", display: "catalog", preview: 3, home: ["offer", "why", "visit"], aboutPage: true },
  software: { slug: "/features", display: "cards", preview: 3, home: ["why", "offer", "pricing", "about"], aboutPage: false },
  professional: { slug: "/services", display: "list", preview: 3, home: ["offer", "why", "about"], aboutPage: false },
  localService: { slug: "/services", display: "list", preview: 4, home: ["offer", "area", "why"], aboutPage: true },
  creative: { slug: "/services", display: "list", preview: 3, home: ["about", "offer", "why"], aboutPage: false },
  general: { slug: "/services", display: "cards", preview: 3, home: ["why", "offer", "pricing"], aboutPage: true },
};

type HomeBlock = ArchetypeShape["home"][number];

/**
 * Goal- and context-driven composition on top of the archetype base shape.
 * Adjusts lead section and density without collapsing distinct archetypes into
 * the same home order (full re-sort would erase restaurant vs shop differences).
 */
export function resolveShape(
  archetype: SiteArchetype,
  goal: SiteGoal,
  options: { earlyStage: boolean; itemCount: number; hasPricing: boolean },
): ArchetypeShape {
  const base = SHAPES[archetype];
  let home: HomeBlock[] = [...base.home];

  // Quote/call: lead with trust (why) before the offer list when both exist.
  if ((goal === "quote" || goal === "call") && home.includes("why") && home.includes("offer")) {
    home = moveBefore(home, "why", "offer");
  }
  // Buy/book/visit: lead with the commercial offer or visit block.
  if ((goal === "order" || goal === "book" || goal === "visit") && home.includes("offer")) {
    home = moveBefore(home, "offer", "why");
  }
  // Signup: problem framing then product, with pricing early when present.
  if (goal === "signup") {
    if (home.includes("why") && home.includes("offer")) home = moveBefore(home, "why", "offer");
    if (home.includes("pricing") && home.includes("about")) home = moveBefore(home, "pricing", "about");
  }

  // Early businesses without a dedicated about page: surface about on the home flow.
  if (options.earlyStage && !home.includes("about") && base.aboutPage === false) {
    home = insertAfter(home, "why", "about");
  }

  const preview =
    options.itemCount <= 2 ? Math.max(2, base.preview - 1) : options.itemCount >= 6 ? base.preview + 1 : base.preview;

  // Drop pricing from home when there are no priced tiers — avoids empty commercial blocks.
  if (!options.hasPricing) {
    home = home.filter((b) => b !== "pricing");
  }

  return { ...base, home, preview: Math.min(6, preview) };
}

/** Move `block` immediately before `before` when both are present; no-op otherwise. */
function moveBefore(home: HomeBlock[], block: HomeBlock, before: HomeBlock): HomeBlock[] {
  if (!home.includes(block) || !home.includes(before)) return home;
  const without = home.filter((b) => b !== block);
  const i = without.indexOf(before);
  if (i < 0) return home;
  return [...without.slice(0, i), block, ...without.slice(i)];
}

function insertAfter(home: HomeBlock[], after: HomeBlock, block: HomeBlock): HomeBlock[] {
  if (home.includes(block)) return home;
  const i = home.indexOf(after);
  if (i < 0) return [...home, block];
  return [...home.slice(0, i + 1), block, ...home.slice(i + 1)];
}

interface Copy {
  home: string;
  offerLabel: Record<SiteArchetype, string>;
  offerHeading: Record<SiteArchetype, string>;
  about: string;
  pricing: string;
  contact: string;
  heroSub: (offer: string, customer: string, location: string) => string;
  why: (name: string) => string;
  different: string;
  need: string;
  problem: string;
  aboutHeading: (name: string) => string;
  faqHeading: string;
  whereQ: string;
  areaQ: string;
  whoQ: (name: string) => string;
  whatQ: (name: string) => string;
  priceQ: string;
  pricedA: string;
  itemPricedA: string;
  unpricedA: string;
  contactHeading: string;
  contactIntro: Record<SiteGoal, string>;
  location: string;
  serviceArea: string;
  email: string;
  phone: string;
  visitHeading: Record<SiteArchetype, string>;
  areaHeading: string;
  ctaHeading: (name: string, early: boolean) => string;
  goal: Record<SiteGoal, string>;
  action: { email: string; phone: string; whatsapp: string; map: string; social: string; link: Record<SiteGoal, string> };
  seeOffer: string;
  seeAll: Record<SiteArchetype, string>;
  priceOnRequest: string;
  pricingNote: string;
  pageDescription: (label: string, name: string, location: string) => string;
  /** Localized “in {place}” fragment for SEO titles. */
  inPlace: (place: string) => string;
  contactSeoTitle: (name: string, city: string) => string;
  contactSeoDescription: (name: string, offer: string, location: string) => string;
  offerSeoDescription: (offer: string, customer: string, location: string) => string;
}

const COPY: Record<WebsiteLanguage, Copy> = {
  en: {
    home: "Home",
    offerLabel: {
      restaurant: "Menu",
      hospitality: "Rooms",
      shop: "Products",
      software: "Features",
      professional: "Services",
      localService: "Services",
      creative: "Services",
      general: "Services",
    },
    offerHeading: {
      restaurant: "Our menu",
      hospitality: "Rooms and stays",
      shop: "Our products",
      software: "Features",
      professional: "Our services",
      localService: "What we do",
      creative: "Services",
      general: "What we offer",
    },
    about: "About",
    pricing: "Pricing",
    contact: "Contact",
    heroSub: (offer, customer, location) => `${offer}${customer ? ` for ${customer}` : ""}${location ? `, in ${location}` : ""}.`,
    why: (name) => `Why ${name}`,
    different: "What makes us different",
    need: "What you need",
    problem: "The problem we solve",
    aboutHeading: (name) => `About ${name}`,
    faqHeading: "Frequently asked questions",
    whereQ: "Where are you based?",
    areaQ: "Which areas do you cover?",
    whoQ: (name) => `Who is ${name} for?`,
    whatQ: (name) => `What does ${name} offer?`,
    priceQ: "How much does it cost?",
    pricedA: "Current prices are listed in the pricing section.",
    itemPricedA: "Prices are listed next to each item.",
    unpricedA: "Prices are being finalized. Get in touch and we will share the details.",
    contactHeading: "Get in touch",
    contactIntro: {
      contact: "Tell us what you need.",
      call: "Call us — we are happy to help.",
      visit: "Come and see us.",
      book: "Book directly or send us a message.",
      quote: "Tell us about the job and we will send you a quote.",
      order: "Order directly or send us a message.",
      signup: "Get started, or ask us anything.",
    },
    location: "Location",
    serviceArea: "Service area",
    email: "Email",
    phone: "Phone",
    visitHeading: {
      restaurant: "Visit us",
      hospitality: "Where to find us",
      shop: "Visit the shop",
      software: "Where to find us",
      professional: "Where to find us",
      localService: "Where to find us",
      creative: "Where to find us",
      general: "Where to find us",
    },
    areaHeading: "Where we work",
    ctaHeading: (name, early) => (early ? `Want to learn more about ${name}?` : `Ready to talk with ${name}?`),
    goal: {
      contact: "Get in touch",
      call: "Call us",
      visit: "Plan your visit",
      book: "Book now",
      quote: "Request a quote",
      order: "Order now",
      signup: "Get started",
    },
    action: {
      email: "Send an email",
      phone: "Call",
      whatsapp: "WhatsApp",
      map: "Open in Maps",
      social: "Follow us",
      link: { contact: "Visit our page", call: "Visit our page", visit: "Visit our page", book: "Book online", quote: "Request a quote online", order: "Order online", signup: "Sign up" },
    },
    seeOffer: "See what we offer",
    seeAll: {
      restaurant: "See the full menu",
      hospitality: "See all rooms",
      shop: "See all products",
      software: "See all features",
      professional: "See all services",
      localService: "See all services",
      creative: "See all services",
      general: "See everything we offer",
    },
    priceOnRequest: "Price on request",
    pricingNote: "Suggested packages from the pricing plan — validate before publishing.",
    pageDescription: (label, name, location) => `${label} — ${name}${location ? `, ${location}` : ""}.`,
    inPlace: (place) => `in ${place}`,
    contactSeoTitle: (n, city) => (city ? `Contact ${n} in ${city}` : `Contact ${n}`),
    contactSeoDescription: (n, offer, loc) => `Contact ${n}${loc ? ` in ${loc}` : ""} about ${offer}.`,
    offerSeoDescription: (offer, customer, loc) => `${offer}${customer ? ` for ${customer}` : ""}${loc ? ` — ${loc}` : ""}.`,
  },
  sq: {
    home: "Kryefaqja",
    offerLabel: {
      restaurant: "Menuja",
      hospitality: "Dhomat",
      shop: "Produktet",
      software: "Veçoritë",
      professional: "Shërbimet",
      localService: "Shërbimet",
      creative: "Shërbimet",
      general: "Shërbimet",
    },
    offerHeading: {
      restaurant: "Menuja jonë",
      hospitality: "Dhomat dhe qëndrimet",
      shop: "Produktet tona",
      software: "Veçoritë",
      professional: "Shërbimet tona",
      localService: "Çfarë bëjmë",
      creative: "Shërbimet",
      general: "Çfarë ofrojmë",
    },
    about: "Rreth nesh",
    pricing: "Çmimet",
    contact: "Kontakt",
    heroSub: (offer, customer, location) => `${offer}${customer ? ` për ${customer}` : ""}${location ? `, në ${location}` : ""}.`,
    why: (name) => `Pse ${name}`,
    different: "Çfarë na dallon",
    need: "Çfarë ju nevojitet",
    problem: "Problemi që zgjidhim",
    aboutHeading: (name) => `Rreth ${name}`,
    faqHeading: "Pyetje të shpeshta",
    whereQ: "Ku ndodheni?",
    areaQ: "Në cilat zona punoni?",
    whoQ: (name) => `Për kë është ${name}?`,
    whatQ: (name) => `Çfarë ofron ${name}?`,
    priceQ: "Sa kushton?",
    pricedA: "Çmimet aktuale gjenden te seksioni i çmimeve.",
    itemPricedA: "Çmimet janë shënuar pranë çdo artikulli.",
    unpricedA: "Çmimet janë duke u finalizuar. Na kontaktoni dhe do t'ju ndajmë detajet.",
    contactHeading: "Na kontaktoni",
    contactIntro: {
      contact: "Na tregoni çfarë ju nevojitet.",
      call: "Na telefononi — jemi të gatshëm t'ju ndihmojmë.",
      visit: "Ejani të na takoni.",
      book: "Rezervoni drejtpërdrejt ose na shkruani.",
      quote: "Na tregoni për punën dhe do t'ju dërgojmë një ofertë.",
      order: "Porositni drejtpërdrejt ose na shkruani.",
      signup: "Filloni tani ose na pyesni çfarëdo.",
    },
    location: "Vendndodhja",
    serviceArea: "Zona e shërbimit",
    email: "Email",
    phone: "Telefon",
    visitHeading: {
      restaurant: "Na vizitoni",
      hospitality: "Ku na gjeni",
      shop: "Vizitoni dyqanin",
      software: "Ku na gjeni",
      professional: "Ku na gjeni",
      localService: "Ku na gjeni",
      creative: "Ku na gjeni",
      general: "Ku na gjeni",
    },
    areaHeading: "Ku punojmë",
    ctaHeading: (name, early) => (early ? `Dëshironi të mësoni më shumë për ${name}?` : `Gati të flisni me ${name}?`),
    goal: {
      contact: "Na kontaktoni",
      call: "Na telefononi",
      visit: "Na vizitoni",
      book: "Rezervoni tani",
      quote: "Kërkoni ofertë",
      order: "Porositni tani",
      signup: "Filloni tani",
    },
    action: {
      email: "Dërgoni email",
      phone: "Telefononi",
      whatsapp: "WhatsApp",
      map: "Hapeni në hartë",
      social: "Na ndiqni",
      link: { contact: "Faqja jonë", call: "Faqja jonë", visit: "Faqja jonë", book: "Rezervoni online", quote: "Kërkoni ofertë online", order: "Porositni online", signup: "Regjistrohuni" },
    },
    seeOffer: "Shihni çfarë ofrojmë",
    seeAll: {
      restaurant: "Shihni menunë e plotë",
      hospitality: "Shihni të gjitha dhomat",
      shop: "Shihni të gjitha produktet",
      software: "Shihni të gjitha veçoritë",
      professional: "Shihni të gjitha shërbimet",
      localService: "Shihni të gjitha shërbimet",
      creative: "Shihni të gjitha shërbimet",
      general: "Shihni gjithçka që ofrojmë",
    },
    priceOnRequest: "Çmimi sipas kërkesës",
    pricingNote: "Paketa të sugjeruara nga plani i çmimeve — vlerësojini para publikimit.",
    pageDescription: (label, name, location) => `${label} — ${name}${location ? `, ${location}` : ""}.`,
    inPlace: (place) => `në ${place}`,
    contactSeoTitle: (n, city) => (city ? `Kontaktoni ${n} në ${city}` : `Kontaktoni ${n}`),
    contactSeoDescription: (n, offer, loc) => `Kontaktoni ${n}${loc ? ` në ${loc}` : ""} për ${offer}.`,
    offerSeoDescription: (offer, customer, loc) => `${offer}${customer ? ` për ${customer}` : ""}${loc ? ` — ${loc}` : ""}.`,
  },
};

export interface WebsiteSources {
  input: BusinessInput;
  brand: Brand;
  pricing: PricingStrategy;
}

/**
 * Site chrome language for the deterministic builder (nav labels, contact copy).
 * Discovery `both` is not a WebsiteLanguage — Albanian chrome is the primary
 * shell; bilingual body copy is requested separately via languageInstruction.
 */
export function websiteLanguage(input: BusinessInput): WebsiteLanguage {
  const lang = input.discovery?.brand.language;
  if (!input.discovery || lang === "en") return "en";
  // sq and both → Albanian structural chrome
  return "sq";
}

const sentence = (value: string) => value.replace(/[.\s]+$/, "");
const digits = (phone: string) => phone.replace(/[^0-9]/g, "");

/** The offer as the owner described it: main offer first, then the other products/services they listed. */
export function offerItems(input: BusinessInput): string[] {
  const d = input.discovery;
  const listed = d ? [d.offer.main || d.business.offering, ...d.offer.others.split(/[,;\n]/)] : [input.idea];
  const items = listed.map((s) => clip(s, 120)).filter((s) => s.length > 0);
  return [...new Set(items)].slice(0, 12);
}

/** Pricing tiers exactly as the pricing engine produced them; unpriced tiers have no displayable price. */
export function displayPrice(price: string, language: WebsiteLanguage): string | undefined {
  if (!price.trim() || price === UNPRICED) return undefined;
  if (price === CUSTOM_QUOTE) return COPY[language].priceOnRequest;
  return price;
}

/**
 * Buttons for the real channels in the brief. Only a brief the owner saved
 * produces a map link, so a derived city name never becomes a map pin.
 */
export function contactActions(brief: WebsiteBrief, language: WebsiteLanguage, confirmed: boolean): ContactAction[] {
  const a = COPY[language].action;
  const goal = effectiveGoal(brief);
  const actions: ContactAction[] = [];
  if (brief.actionUrl) actions.push({ kind: "link", label: a.link[goal], href: brief.actionUrl });
  if (brief.phone) actions.push({ kind: "phone", label: a.phone, href: `tel:${brief.phone.trim().startsWith("+") ? "+" : ""}${digits(brief.phone)}` });
  if (brief.whatsapp) actions.push({ kind: "whatsapp", label: a.whatsapp, href: `https://wa.me/${digits(brief.whatsapp)}` });
  if (brief.email) actions.push({ kind: "email", label: a.email, href: `mailto:${brief.email}` });
  if (confirmed && brief.address) actions.push({ kind: "map", label: a.map, href: `https://www.google.com/maps/search/?api=1&query=${queryParam(brief.address)}` });
  for (const url of brief.social) actions.push({ kind: "social", label: socialLabel(url, a.social), href: url });
  return actions.filter((action) => contactActionSchema.safeParse(action).success).slice(0, 8);
}

const queryParam = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);

function socialLabel(url: string, fallback: string): string {
  const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  const known: Record<string, string> = {
    "instagram.com": "Instagram",
    "facebook.com": "Facebook",
    "tiktok.com": "TikTok",
    "linkedin.com": "LinkedIn",
    "x.com": "X",
    "twitter.com": "X",
    "youtube.com": "YouTube",
    "behance.net": "Behance",
    "dribbble.com": "Dribbble",
  };
  return known[host] ?? fallback;
}

/** The section with the offer: owner items (with their own descriptions and prices) in the archetype's display. */
function offerItemsFromBrief(brief: WebsiteBrief, fallback: string[]): { title: string; description?: string; price?: string }[] {
  if (brief.items.length > 0) {
    return brief.items.map((i) => ({
      title: clip(i.name, 120),
      ...(i.description ? { description: clip(i.description, 400) } : {}),
      ...(i.price ? { price: clip(i.price, 40) } : {}),
    }));
  }
  return fallback.map((title) => ({ title }));
}

export function buildWebsiteSpec({ input, brand, pricing }: WebsiteSources): WebsiteSpec {
  const d = input.discovery;
  const facts = copyBriefFromInput(input);
  const language = websiteLanguage(input);
  const c = COPY[language];
  const brief = websiteBriefOf(input);
  const confirmed = input.website !== undefined;
  const archetype = brief.archetype;
  const goal = effectiveGoal(brief);
  const name = clip(brand.name || d?.business.name || input.idea, 80);
  const location = clip(facts.location, 120);
  const customer = clip(facts.audience, 160);
  const offerSummary = offerItems(input)[0] ?? clip(facts.offering, 120);
  const items = offerItemsFromBrief(brief, offerItems(input));
  if (items.length === 0) items.push({ title: offerSummary });

  const offerPage = items.length >= 2;
  const tiers = pricing.tiers
    .map((t) => ({
      name: clip(t.name, 60),
      price: displayPrice(t.price, language),
      cadence: clip(t.cadence, 30),
      description: t.tagline ? clip(t.tagline, 200) : undefined,
      features: t.features.map((f) => clip(f, 120)).filter(Boolean).slice(0, 6),
      highlighted: t.highlighted,
    }))
    .filter((t) => t.name)
    .slice(0, 4);
  const priced = tiers.some((t) => t.price !== undefined);
  const itemPriced = items.some((i) => i.price);
  const pricingPage = priced && archetype === "software";
  const shape = resolveShape(archetype, goal, {
    earlyStage: facts.earlyStage,
    itemCount: items.length,
    hasPricing: priced,
  });

  const goalLink: WebsiteLink = { label: c.goal[goal], href: "/contact" };
  const actions = contactActions(brief, language, confirmed);

  const features: { title: string; description: string }[] = [
    facts.differentiator ? { title: c.different, description: facts.differentiator } : null,
    facts.need ? { title: c.need, description: facts.need } : null,
    facts.problem ? { title: c.problem, description: facts.problem } : null,
  ]
    .filter((f): f is { title: string; description: string } => f !== null)
    .map((f) => ({ title: f.title, description: clip(f.description, 400) }));

  const offerSection = (id: string, preview: boolean): WebsiteSectionSpec => ({
    type: "offer",
    id,
    heading: c.offerHeading[archetype],
    items: preview ? items.slice(0, shape.preview) : items,
    display: shape.display,
    ...(preview ? { more: { label: c.seeAll[archetype], href: shape.slug } } : {}),
  });
  const pricingSection: WebsiteSectionSpec | null = priced
    ? {
        type: "pricing",
        id: "pricing",
        heading: c.pricing,
        tiers: tiers.map((t) => ({ ...t, cadence: t.price ? t.cadence : "" })),
        note: c.pricingNote,
      }
    : null;
  const about = [brand.description, brand.mission].map((s) => s.trim()).filter(Boolean).join(" ");
  const aboutSection: WebsiteSectionSpec | null =
    about && brief.pages.about ? { type: "about", id: "about", heading: c.aboutHeading(name), body: clip(about, 1200) } : null;
  const ctaSection = (id: string): WebsiteSectionSpec => ({
    type: "cta",
    id,
    heading: c.ctaHeading(name, facts.earlyStage),
    ...(brand.slogan ? { subheading: clip(brand.slogan, 240) } : {}),
    cta: goalLink,
  });

  const hours = brief.hours.map((h) => ({ days: clip(h.days, 40), time: clip(h.time, 60) }));
  const address = clip(brief.address, 200);
  const area = clip(brief.serviceArea, 200);
  const serviceArea = area.toLowerCase() === address.toLowerCase() ? "" : area;
  const visitSection: WebsiteSectionSpec | null =
    address && (hours.length > 0 || confirmed)
      ? {
          type: "contact",
          id: "visit",
          heading: c.visitHeading[archetype],
          details: [{ label: c.location, value: address }],
          ...(hours.length > 0 ? { hours } : {}),
          ...(actions.some((a) => a.kind === "map" || a.kind === "phone")
            ? { actions: actions.filter((a) => a.kind === "map" || a.kind === "phone") }
            : {}),
          channelsPending: false,
        }
      : null;
  const areaSection: WebsiteSectionSpec | null = serviceArea
    ? {
        type: "contact",
        id: "area",
        heading: c.areaHeading,
        details: [{ label: c.serviceArea, value: serviceArea }],
        ...(hours.length > 0 ? { hours } : {}),
        channelsPending: false,
      }
    : null;

  const faq: WebsiteSectionSpec | null = brief.pages.faq
    ? {
        type: "faq",
        id: "faq",
        heading: c.faqHeading,
        items: [
          { question: c.whatQ(name), answer: clip(`${items.map((i) => i.title).join(", ")}.`, 600) },
          ...(customer ? [{ question: c.whoQ(name), answer: clip(`${sentence(customer)}.`, 600) }] : []),
          ...(serviceArea && archetype === "localService"
            ? [{ question: c.areaQ, answer: clip(`${sentence(serviceArea)}.`, 600) }]
            : location
              ? [{ question: c.whereQ, answer: clip(`${sentence(address || location)}.`, 600) }]
              : []),
          { question: c.priceQ, answer: priced ? c.pricedA : itemPriced ? c.itemPricedA : c.unpricedA },
        ],
      }
    : null;

  const heroSub = clip(c.heroSub(sentence(offerSummary), midSentence(sentence(customer)), sentence(location)), 320);
  const home: WebsiteSectionSpec[] = [
    {
      type: "hero",
      id: "hero",
      heading: clip(brand.slogan || offerSummary, 140),
      subheading: heroSub,
      primaryCta: goalLink,
      ...(offerPage ? { secondaryCta: { label: c.seeOffer, href: shape.slug } } : {}),
      ...(brief.heroImage && brief.heroImageAlt ? { image: { src: brief.heroImage, alt: brief.heroImageAlt } } : {}),
    },
  ];
  for (const block of shape.home) {
    if (block === "why" && features.length > 0) home.push({ type: "features", id: "why", heading: c.why(name), items: features });
    if (block === "offer") home.push(offerSection("offer", offerPage));
    if (block === "pricing" && pricingSection && !pricingPage && !offerPage) home.push(pricingSection);
    if (block === "about" && aboutSection && !shape.aboutPage) home.push(aboutSection);
    if (block === "visit" && visitSection) home.push(visitSection);
    if (block === "area" && areaSection) home.push(areaSection);
  }
  home.push(ctaSection("cta"));

  const offerTerm = clip(offerSummary, 48);
  const page = (id: string, slug: string, label: string, sections: WebsiteSectionSpec[]): WebsitePageSpec => {
    const city = location.split(",")[0]?.trim() ?? "";
    const title =
      id === "offer"
        ? clip(`${offerTerm} | ${name}`, 70)
        : id === "contact"
          ? clip(c.contactSeoTitle(name, city), 70)
          : id === "about"
            ? clip(`${c.about} — ${name}`, 70)
            : id === "pricing"
              ? clip(`${c.pricing} — ${name}`, 70)
              : clip(`${label} — ${name}`, 70);
    const description =
      id === "offer"
        ? clip(c.offerSeoDescription(offerTerm, customer, location), 170)
        : id === "contact"
          ? clip(c.contactSeoDescription(name, offerTerm, location), 170)
          : clip(c.pageDescription(label, name, location), 170);
    return {
      id,
      slug,
      label,
      seo: { title, description, canonicalPath: slug },
      sections,
    };
  };

  const cityLabel = location.split(",")[0]?.trim() ?? "";
  const homeTitle = clip(
    cityLabel
      ? `${name} — ${offerTerm} ${c.inPlace(cityLabel)}`
      : brand.slogan
        ? `${name} — ${brand.slogan}`
        : `${name} — ${offerTerm}`,
    70,
  );
  const pages: WebsitePageSpec[] = [
    {
      id: "home",
      slug: "/",
      label: c.home,
      seo: { title: homeTitle, description: clip(heroSub, 170), canonicalPath: "/" },
      sections: home,
    },
  ];
  if (offerPage) {
    const sections = [offerSection("offer", false)];
    if (pricingSection && !pricingPage) sections.push(pricingSection);
    sections.push(ctaSection("offer-cta"));
    pages.push(page("offer", shape.slug, c.offerLabel[archetype], sections));
  }
  if (pricingPage && pricingSection) pages.push(page("pricing", "/pricing", c.pricing, [pricingSection, ctaSection("pricing-cta")]));
  if (aboutSection && shape.aboutPage) pages.push(page("about", "/about", c.about, [aboutSection, ctaSection("about-cta")]));

  const details = [
    ...(address ? [{ label: c.location, value: address }] : !serviceArea && location ? [{ label: c.location, value: location }] : []),
    ...(serviceArea ? [{ label: c.serviceArea, value: serviceArea }] : []),
    ...(brief.phone ? [{ label: c.phone, value: brief.phone }] : []),
    ...(brief.email ? [{ label: c.email, value: brief.email }] : []),
  ];
  pages.push(
    page("contact", "/contact", c.contact, [
      {
        type: "contact",
        id: "contact",
        heading: c.contactHeading,
        intro: c.contactIntro[goal],
        details,
        ...(hours.length > 0 ? { hours } : {}),
        ...(actions.length > 0 ? { actions } : {}),
        channelsPending: !hasContactChannel(brief),
      },
      ...(faq ? [faq] : []),
    ]),
  );

  return websiteSpecSchema.parse({
    version: 1,
    siteName: name,
    ...(brand.slogan ? { tagline: clip(brand.slogan, 160) } : {}),
    language,
    theme: themeFromBrand(brand),
    primaryCta: goalLink,
    navigation: pages.map((p) => ({ label: p.label, href: p.slug })),
    pages,
    layout: resolveLayout(brief, input.style),
    archetype,
  });
}
