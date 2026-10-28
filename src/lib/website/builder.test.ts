import { describe, expect, it } from "vitest";
import { buildWebsiteSpec, displayPrice, offerItems } from "@/lib/website/builder";
import { parseWebsiteSpec, type WebsiteSpec } from "@/lib/website/model";
import { CUSTOM_QUOTE, UNPRICED } from "@/lib/pricing/strategy";
import type { PricingTier } from "@/lib/types";
import { makePackage } from "@/test/db";
import { sampleInput } from "@/test/research";

const brand = makePackage().brand;
const tier = (name: string, price: string, cadence = ""): PricingTier => ({ name, price, cadence, tagline: "", features: [], highlighted: false, cta: "" });
const noPricing = { model: "", rationale: "", tiers: [], psychology: [], upsells: [] };

const coffee = sampleInput({
  business: { name: "Drita", idea: "Specialty coffee shop", category: "food", location: "Tirana" },
  customer: { ideal: "Remote workers in Tirana", problem: "No quiet place to work", need: "Reliable wifi and good coffee" },
  offer: { main: "Single-origin espresso", others: "Pour-over, Pastries", differentiator: "Beans roasted in-house every morning" },
  brand: { language: "en" },
});

const text = (spec: WebsiteSpec) => JSON.stringify(spec);
const sections = (spec: WebsiteSpec) => spec.pages.flatMap((p) => p.sections);

describe("deterministic website builder", () => {
  it("produces a valid specification grounded in the business context", () => {
    const spec = buildWebsiteSpec({ input: coffee, brand, pricing: noPricing });
    expect(parseWebsiteSpec(spec)).toEqual(spec);
    expect(spec.siteName).toBe("Kafeja");
    expect(spec.tagline).toBe("Slow roasted");
    expect(spec.language).toBe("en");
    expect(spec.theme.colors.primary).toBe("#000000");
    expect(spec.theme.fonts.heading).toBe("Inter");
    const all = text(spec);
    for (const fact of ["Single-origin espresso", "Pour-over", "Pastries", "Remote workers in Tirana", "Beans roasted in-house every morning", "Tirana"]) {
      expect(all).toContain(fact);
    }
  });

  it("shortens a long idea into an offer title at a word boundary when there are no discovery answers", () => {
    const idea =
      "Family-run sourdough bakery in Tirana selling naturally leavened bread, pastries and weekend brunch boxes, with pre-orders for pickup";
    const input = { idea, audience: "Families in central Tirana", location: "Tirana, Albania", budget: "6000 EUR", style: "Modern / Minimal" as const };
    const [title] = offerItems(input);
    expect(title!.length).toBeLessThanOrEqual(120);
    expect(title).toMatch(/…$/);
    const kept = title!.slice(0, -1);
    expect(idea.startsWith(kept)).toBe(true);
    expect(idea[kept.length]).toMatch(/[\s,;]/);

    const spec = buildWebsiteSpec({ input, brand, pricing: noPricing });
    expect(parseWebsiteSpec(spec)).toEqual(spec);
    expect(text(spec)).not.toContain("pre-orde…");
  });

  it("chooses pages for the business type", () => {
    const food = buildWebsiteSpec({ input: coffee, brand, pricing: noPricing });
    expect(food.pages.map((p) => p.slug)).toEqual(["/", "/menu", "/about", "/contact"]);
    expect(food.navigation.map((n) => n.href)).toEqual(food.pages.map((p) => p.slug));

    const software = buildWebsiteSpec({
      input: sampleInput({ business: { category: "software", type: "online" }, offer: { main: "Scheduling app", others: "Reminders, Reports" }, brand: { language: "en" } }),
      brand,
      pricing: { ...noPricing, tiers: [tier("Starter", "€9", "/month")] },
    });
    expect(software.pages.map((p) => p.slug)).toEqual(["/", "/features", "/pricing", "/contact"]);

    const single = buildWebsiteSpec({ input: sampleInput({ offer: { main: "Espresso" } }), brand, pricing: noPricing });
    expect(single.pages.map((p) => p.slug)).not.toContain("/menu");
    expect(single.pages[0]!.sections.some((s) => s.type === "offer")).toBe(true);
  });

  it("never fabricates claims, contact details, social links or external URLs", () => {
    const spec = buildWebsiteSpec({ input: coffee, brand, pricing: noPricing });
    const all = text(spec);
    expect(all).not.toMatch(/https?:|www\.|@|wa\.me|instagram|facebook|\+\d|★|5★|24\/7|100%|testimonial|review|award|certified|guarantee|since \d{4}|\d+\s*\+?\s*(customers|clients|years)/i);
    const contact = sections(spec).find((s) => s.type === "contact");
    expect(contact).toMatchObject({ channelsPending: true, details: [{ label: "Location", value: "Tirana" }] });
    for (const href of [spec.primaryCta.href, ...spec.navigation.map((n) => n.href)]) expect(href.startsWith("/")).toBe(true);
  });

  it("shows engine prices verbatim with currency and billing period", () => {
    const spec = buildWebsiteSpec({
      input: coffee,
      brand,
      pricing: { ...noPricing, tiers: [tier("Espresso", "150 ALL"), tier("Monthly pass", "€45", "/month"), tier("Events", CUSTOM_QUOTE)] },
    });
    const pricing = sections(spec).find((s) => s.type === "pricing");
    expect(pricing?.type === "pricing" && pricing.tiers.map((t) => [t.name, t.price, t.cadence])).toEqual([
      ["Espresso", "150 ALL", ""],
      ["Monthly pass", "€45", "/month"],
      ["Events", "Price on request", ""],
    ]);
    expect(text(spec)).not.toContain("$");
  });

  it("does not invent prices when the engine could not validate them", () => {
    const spec = buildWebsiteSpec({ input: coffee, brand, pricing: { ...noPricing, tiers: [tier("Espresso", UNPRICED), tier("Pass", UNPRICED, "/month")] } });
    expect(sections(spec).some((s) => s.type === "pricing")).toBe(false);
    expect(text(spec)).not.toContain(UNPRICED);
    expect(text(spec)).not.toMatch(/€|\$|ALL\b|\d+\s*\/\s*month/);
    expect(displayPrice(UNPRICED, "en")).toBeUndefined();
    expect(displayPrice("", "en")).toBeUndefined();
    expect(displayPrice(CUSTOM_QUOTE, "sq")).toBe("Çmimi sipas kërkesës");
  });

  it("keeps unpriced tiers priceless next to priced ones", () => {
    const spec = buildWebsiteSpec({ input: coffee, brand, pricing: { ...noPricing, tiers: [tier("Espresso", "150 ALL"), tier("Catering", UNPRICED, "/event")] } });
    const pricing = sections(spec).find((s) => s.type === "pricing");
    expect(pricing?.type === "pricing" && pricing.tiers[1]).toMatchObject({ name: "Catering", cadence: "" });
    expect(pricing?.type === "pricing" && pricing.tiers[1]?.price).toBeUndefined();
  });

  it("writes structural copy in the business language", () => {
    const sq = buildWebsiteSpec({ input: sampleInput({ offer: { main: "Kafe", others: "Ëmbëlsira" } }), brand, pricing: noPricing });
    expect(sq.language).toBe("sq");
    expect(sq.navigation.map((n) => n.label)).toEqual(["Kryefaqja", "Menuja", "Rreth nesh", "Kontakt"]);
    expect(text(sq)).not.toMatch(/\b(Home|Contact|Get in touch|Frequently asked)\b/);
  });

  it("uses Albanian chrome for language=both (bilingual body is an LLM instruction, not a third site language)", () => {
    const both = buildWebsiteSpec({
      input: sampleInput({ offer: { main: "Kafe" }, brand: { language: "both" } }),
      brand,
      pricing: noPricing,
    });
    expect(both.language).toBe("sq");
    expect(both.navigation[0]?.label).toBe("Kryefaqja");
  });

  it("omits optional facts that were not provided", () => {
    const spec = buildWebsiteSpec({ input: { ...makePackage().input, location: "", audience: "" }, brand, pricing: noPricing });
    expect(parseWebsiteSpec(spec)).not.toBeNull();
    const contact = sections(spec).find((s) => s.type === "contact");
    expect(contact?.type === "contact" && contact.details).toEqual([]);
    expect(text(spec)).not.toContain(" in .");
  });
});
