import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteRenderer } from "@/components/website/SiteRenderer";
import { buildWebsiteSpec } from "@/lib/website/builder";
import { websiteBriefSchema, type SiteArchetype, type WebsiteBrief } from "@/lib/website/brief";
import { parseWebsiteSpec, type WebsiteSectionSpec, type WebsiteSpec } from "@/lib/website/model";
import { buildPublishableWebsite } from "@/lib/website/publish";
import { checkWebsite } from "@/lib/website/quality";
import type { BusinessInput, PricingStrategy, PricingTier } from "@/lib/types";
import { makePackage } from "@/test/db";
import { sampleInput } from "@/test/research";

/**
 * Synthetic businesses of different kinds. Each must get a website whose
 * structure, main action and layout fit the business, built only from what
 * the owner provided.
 */

const brand = makePackage().brand;
const noPricing = { model: "", rationale: "", tiers: [], psychology: [], upsells: [] };
const tier = (name: string, price: string, cadence = ""): PricingTier => ({ name, price, cadence, tagline: "", features: [], highlighted: false, cta: "" });

interface Case {
  name: SiteArchetype;
  input: BusinessInput;
  pricing?: PricingStrategy;
}

const withBrief = (input: BusinessInput, brief: Partial<WebsiteBrief> & Pick<WebsiteBrief, "archetype" | "goal">): BusinessInput => ({
  ...input,
  website: websiteBriefSchema.parse(brief),
});

const en = { language: "en" as const };

const CASES: Case[] = [
  {
    name: "restaurant",
    input: withBrief(
      sampleInput({
        business: { name: "Trattoria Sole", idea: "Neighbourhood trattoria", category: "food", type: "physical", location: "Tirana" },
        offer: { main: "Wood-fired pizza", others: "Fresh pasta, Tiramisu" },
        brand: { ...en, style: "Friendly / Approachable" },
      }),
      {
        archetype: "restaurant",
        goal: "book",
        phone: "+355 69 123 4567",
        address: "Rruga e Kavajës 10, Tirana",
        hours: [
          { days: "Mon–Fri", time: "12:00–23:00" },
          { days: "Sat–Sun", time: "11:00–23:30" },
        ],
        items: [
          { name: "Wood-fired pizza", description: "Margherita, marinara or diavola.", price: "700 ALL" },
          { name: "Fresh pasta", description: "Made in-house every morning.", price: "850 ALL" },
          { name: "Tiramisu", description: "", price: "" },
        ],
      },
    ),
  },
  {
    name: "professional",
    input: sampleInput({
      business: { name: "Kodra Legal", idea: "Law firm for small businesses", category: "services", type: "both", location: "Durrës" },
      offer: { main: "Contract review", others: "Company registration, Employment law advice" },
      brand: { ...en, style: "Corporate / Professional" },
    }),
  },
  {
    name: "shop",
    input: withBrief(
      sampleInput({
        business: { name: "Argjila", idea: "Handmade ceramic mugs", category: "ecommerce", type: "online", location: "Shkodër" },
        offer: { main: "Ceramic mugs", others: "Plates, Vases" },
        brand: { ...en, style: "Organic / Natural" },
      }),
      {
        archetype: "shop",
        goal: "order",
        actionUrl: "https://shop.argjila.al",
        email: "hello@argjila.al",
        social: ["https://www.instagram.com/argjila"],
        items: [
          { name: "Ceramic mugs", description: "Wheel-thrown stoneware.", price: "1.800 ALL" },
          { name: "Plates", description: "", price: "2.400 ALL" },
          { name: "Vases", description: "", price: "" },
        ],
      },
    ),
  },
  {
    name: "software",
    input: sampleInput({
      business: { name: "Orari", idea: "Scheduling app for salons", category: "software", type: "online", location: "Tirana" },
      offer: { main: "Online booking", others: "Reminders, Reports" },
      brand: { ...en, style: "Tech / Futuristic" },
    }),
    pricing: { ...noPricing, tiers: [tier("Starter", "€9", "/month"), tier("Team", "€29", "/month")] },
  },
  {
    name: "hospitality",
    input: withBrief(
      sampleInput({
        business: { name: "Vila Mangalem", idea: "Boutique hotel in Berat", category: "general", type: "physical", location: "Berat" },
        offer: { main: "Double room", others: "Family suite" },
        brand: { ...en, style: "Premium / Luxury" },
      }),
      { archetype: "hospitality", goal: "book", address: "Lagjja Mangalem, Berat", actionUrl: "https://book.vilamangalem.al", whatsapp: "+355 68 765 4321" },
    ),
  },
  {
    name: "localService",
    input: withBrief(
      sampleInput({
        business: { name: "Hidro Fix", idea: "Emergency plumbing repairs", category: "services", type: "physical", location: "Tirana" },
        offer: { main: "Leak repair", others: "Boiler installation, Drain unblocking" },
        brand: { ...en, style: "Bold / Energetic" },
      }),
      { archetype: "localService", goal: "quote", phone: "+355 67 222 3333", serviceArea: "Tirana and Kamëz", hours: [{ days: "Every day", time: "07:00–21:00" }] },
    ),
  },
  {
    name: "creative",
    input: sampleInput({
      business: { name: "Drita Studio", idea: "Wedding photography", category: "services", type: "online", location: "Vlorë" },
      offer: { main: "Wedding photography", others: "Engagement shoots" },
      brand: { ...en, style: "Playful / Creative" },
    }),
  },
  {
    name: "general",
    input: sampleInput({
      business: { name: "Ura", idea: "Translation and interpreting", category: "general", type: "online", location: "Tirana" },
      offer: { main: "Document translation", others: "Interpreting" },
      brand: { ...en, style: "Modern / Minimal" },
    }),
  },
];

const build = (c: Case) => buildWebsiteSpec({ input: c.input, brand, pricing: c.pricing ?? noPricing });
const sections = (spec: WebsiteSpec) => spec.pages.flatMap((p) => p.sections);
const ofType = <T extends WebsiteSectionSpec["type"]>(spec: WebsiteSpec, type: T) =>
  sections(spec).filter((s): s is Extract<WebsiteSectionSpec, { type: T }> => s.type === type);
const signature = (spec: WebsiteSpec) => spec.pages.map((p) => `${p.slug}:${p.sections.map((s) => s.type).join("+")}`).join(" | ");

describe("business-specific websites", () => {
  const built = CASES.map((c) => ({ c, spec: build(c) }));

  it("builds a valid site of the right kind for every business", () => {
    for (const { c, spec } of built) {
      expect(parseWebsiteSpec(spec), c.name).toEqual(spec);
      expect(spec.archetype, c.name).toBe(c.name);
      expect(buildPublishableWebsite(spec).ok, c.name).toBe(true);
    }
  });

  it("gives different kinds of business genuinely different structures", () => {
    const signatures = new Set(built.map(({ spec }) => signature(spec)));
    expect(signatures.size).toBe(CASES.length);
    const slugs = Object.fromEntries(built.map(({ c, spec }) => [c.name, spec.pages.map((p) => p.slug)]));
    expect(slugs.restaurant).toEqual(["/", "/menu", "/about", "/contact"]);
    expect(slugs.hospitality).toContain("/rooms");
    expect(slugs.shop).toContain("/products");
    expect(slugs.software).toEqual(["/", "/features", "/pricing", "/contact"]);
    expect(slugs.professional).toEqual(["/", "/services", "/contact"]);
    expect(slugs.creative).not.toContain("/about");
  });

  it("matches the offer display and layout to the business", () => {
    const display = (name: string) => ofType(built.find((b) => b.c.name === name)!.spec, "offer")[0]?.display;
    expect(display("restaurant")).toBe("menu");
    expect(display("shop")).toBe("catalog");
    expect(display("professional")).toBe("list");
    expect(display("localService")).toBe("list");
    const layout = Object.fromEntries(built.map(({ c, spec }) => [c.name, spec.layout]));
    expect(layout).toMatchObject({ restaurant: "classic", hospitality: "editorial", shop: "editorial", software: "bold", localService: "bold", professional: "split" });
  });

  it("previews the offer on the homepage and links to the full page", () => {
    const restaurant = built.find((b) => b.c.name === "restaurant")!.spec;
    const homeOffer = restaurant.pages[0]!.sections.find((s) => s.type === "offer");
    expect(homeOffer?.type === "offer" && homeOffer.more).toEqual({ label: "See the full menu", href: "/menu" });
    expect(restaurant.pages[0]!.sections.find((s) => s.id === "visit")).toMatchObject({
      type: "contact",
      details: [{ label: "Location", value: "Rruga e Kavajës 10, Tirana" }],
      hours: [{ days: "Mon–Fri", time: "12:00–23:00" }, { days: "Sat–Sun", time: "11:00–23:30" }],
    });
  });

  it("asks visitors to do what the owner wants, when the site can deliver it", () => {
    const cta = Object.fromEntries(built.map(({ c, spec }) => [c.name, spec.primaryCta.label]));
    expect(cta).toMatchObject({
      restaurant: "Book now",
      shop: "Order now",
      hospitality: "Book now",
      localService: "Request a quote",
      software: "Get in touch",
      professional: "Get in touch",
    });
    for (const { spec } of built) expect(spec.primaryCta.href).toBe("/contact");
  });

  it("turns owner contact details into real, safe actions — and nothing else", () => {
    const contact = (name: string) => ofType(built.find((b) => b.c.name === name)!.spec, "contact").find((s) => s.id === "contact")!;
    expect(contact("restaurant").actions?.map((a) => [a.kind, a.href])).toEqual([
      ["phone", "tel:+355691234567"],
      ["map", "https://www.google.com/maps/search/?api=1&query=Rruga%20e%20Kavaj%C3%ABs%2010%2C%20Tirana"],
    ]);
    expect(contact("shop").actions?.map((a) => [a.kind, a.label, a.href])).toEqual([
      ["link", "Order online", "https://shop.argjila.al"],
      ["email", "Send an email", "mailto:hello@argjila.al"],
      ["social", "Instagram", "https://www.instagram.com/argjila"],
    ]);
    expect(contact("hospitality").actions?.map((a) => a.kind)).toEqual(["link", "whatsapp", "map"]);
    expect(contact("hospitality").actions?.find((a) => a.kind === "whatsapp")?.href).toBe("https://wa.me/355687654321");
    expect(contact("restaurant").channelsPending).toBe(false);

    expect(contact("professional").details).toEqual([{ label: "Location", value: "Durrës" }]);
    expect(contact("localService").details.map((d) => d.label)).toEqual(["Service area", "Phone"]);

    for (const name of ["professional", "creative", "general", "software"]) {
      const c = contact(name);
      expect(c.actions, name).toBeUndefined();
      expect(c.channelsPending, name).toBe(true);
    }
  });

  it("shows only prices the owner entered or the pricing engine produced", () => {
    for (const { c, spec } of built) {
      const itemPrices = ofType(spec, "offer").flatMap((s) => s.items.map((i) => i.price).filter(Boolean));
      const owner = (c.input.website?.items ?? []).map((i) => i.price).filter(Boolean);
      for (const price of itemPrices) expect(owner, c.name).toContain(price);
      const ownerWords = [...(c.input.discovery?.offer.others.split(",") ?? []), c.input.discovery?.offer.main ?? ""].map((s) => s.trim()).filter(Boolean);
      const text = ownerWords.reduce((t, w) => t.split(w).join(""), JSON.stringify(spec));
      expect(text, c.name).not.toMatch(/testimonial|review|award|certified|guarantee|★|since \d{4}|\d+\s*\+?\s*(customers|clients|years)/i);
    }
    const restaurantText = JSON.stringify(build(CASES[0]!));
    expect(restaurantText).toContain("700 ALL");
    expect(restaurantText).toContain("Prices are listed next to each item.");
  });

  it("drops a malformed action instead of breaking the site", () => {
    const input = withBrief(sampleInput({ brand: en }), { archetype: "restaurant", goal: "visit", address: "O'Hara's Corner (rear)", phone: "+355 69 123 4567" });
    const spec = buildWebsiteSpec({ input, brand, pricing: noPricing });
    const map = ofType(spec, "contact")[0]?.actions?.find((a) => a.kind === "map");
    expect(map?.href).toBe("https://www.google.com/maps/search/?api=1&query=O%27Hara%27s%20Corner%20%28rear%29");
  });

  it("renders the business-specific displays, actions and hours", () => {
    const spec = build(CASES[0]!);
    const site = buildPublishableWebsite(spec);
    if (!site.ok) throw new Error("invalid");
    const labels = { navigation: "Nav", contactPending: "Pending" };
    const page = (slug: string) => site.site.pages.find((p) => p.slug === slug)!;
    const menu = renderToStaticMarkup(createElement(SiteRenderer, { site: site.site, page: page("/menu"), labels }));
    expect(menu).toContain('class="sos-site sos-l-classic"');
    expect(menu).toContain("sos-menu-list");
    expect(menu).toContain("700 ALL");
    const contact = renderToStaticMarkup(createElement(SiteRenderer, { site: site.site, page: page("/contact"), labels }));
    expect(contact).toContain('href="tel:+355691234567"');
    expect(contact).toMatch(/href="https:\/\/www\.google\.com\/maps[^"]*"[^>]*target="_blank" rel="noopener noreferrer"/);
    expect(contact).toContain("Opening hours");
    expect(contact).toContain("12:00–23:00");
    expect(contact).toContain("Skip to content");

    const sq = buildPublishableWebsite(buildWebsiteSpec({ input: sampleInput(), brand, pricing: noPricing }));
    if (!sq.ok) throw new Error("invalid");
    const sqHtml = renderToStaticMarkup(createElement(SiteRenderer, { site: sq.site, page: sq.site.pages[0]!, labels }));
    expect(sqHtml).toContain("Kalo te përmbajtja");
    expect(sqHtml).not.toContain("Skip to content");
  });

  it("flags missing essentials with checks, and blocks placeholder text", () => {
    const checks = (c: Case, spec = build(c)) => checkWebsite(spec, c.input).map((x) => `${x.severity}:${x.id}`);
    expect(checks(CASES[0]!)).not.toContain("warning:noContactChannel");
    expect(checks(CASES[1]!)).toContain("warning:noContactChannel");
    expect(checks(CASES[1]!).some((x) => x.startsWith("error:"))).toBe(false);

    const noHours = withBrief(sampleInput({ brand: en }), { archetype: "restaurant", goal: "visit", address: "Rruga e Durrësit 1, Tirana", phone: "+355 69 123 4567" });
    expect(checks({ name: "restaurant", input: noHours })).toContain("warning:missingHours");
    const callWithoutPhone = withBrief(sampleInput({ brand: en }), { archetype: "localService", goal: "call" });
    expect(checks({ name: "localService", input: callWithoutPhone })).toContain("warning:goalUnavailable");

    const placeholder = withBrief(sampleInput({ brand: en }), {
      archetype: "restaurant",
      goal: "contact",
      email: "a@drita.al",
      items: [{ name: "TODO add dish", description: "", price: "" }],
    });
    const result = checks({ name: "restaurant", input: placeholder });
    expect(result).toContain("error:placeholderText");
  });
});
