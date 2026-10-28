import { describe, expect, it } from "vitest";
import {
  deriveArchetype,
  deriveWebsiteBrief,
  effectiveGoal,
  hasContactChannel,
  resolveLayout,
  websiteBriefOf,
  websiteBriefSchema,
  type WebsiteBrief,
} from "@/lib/website/brief";
import { businessInputSchema } from "@/lib/schemas";
import { sampleInput } from "@/test/research";

const brief = (overrides: Partial<WebsiteBrief> = {}): WebsiteBrief =>
  websiteBriefSchema.parse({ archetype: "general", goal: "contact", ...overrides });

describe("website brief", () => {
  it("derives the kind of website from what the owner already said", () => {
    const cases: [Parameters<typeof sampleInput>[0], string][] = [
      [{ business: { category: "food", idea: "Neighbourhood pizzeria" } }, "restaurant"],
      [{ business: { category: "general", idea: "Boutique hotel in Berat" } }, "hospitality"],
      [{ business: { category: "food", idea: "Guest house with breakfast", offering: "Rooms" } }, "hospitality"],
      [{ business: { category: "ecommerce", type: "online", idea: "Handmade ceramic mugs" } }, "shop"],
      [{ business: { category: "software", type: "online", idea: "Scheduling app for salons" } }, "software"],
      [{ business: { category: "services", idea: "Law firm for small businesses" } }, "professional"],
      [{ business: { category: "services", idea: "Emergency plumbing repairs" } }, "localService"],
      [{ business: { category: "services", type: "online", idea: "Wedding photography" } }, "creative"],
      [{ business: { category: "services", type: "online", idea: "Something unusual" } }, "professional"],
      [{ business: { category: "general", idea: "Something unusual" } }, "general"],
    ];
    for (const [overrides, expected] of cases) {
      expect(deriveArchetype(sampleInput(overrides)), JSON.stringify(overrides)).toBe(expected);
    }
  });

  it("prefills only facts the owner gave, never contact channels", () => {
    const derived = deriveWebsiteBrief(sampleInput({ offer: { main: "Espresso", others: "Pour-over, Pastries" } }));
    expect(derived).toMatchObject({ archetype: "restaurant", goal: "visit", layout: "auto", address: "Tirana", email: "", phone: "", whatsapp: "", actionUrl: "" });
    expect(derived.items.map((i) => i.name)).toEqual(["Espresso", "Pour-over", "Pastries"]);
    expect(derived.items.every((i) => i.price === "" && i.description === "")).toBe(true);
    expect(hasContactChannel(derived)).toBe(false);
    const online = deriveWebsiteBrief(sampleInput({ business: { category: "ecommerce", type: "online", idea: "Mugs" } }));
    expect(online.address).toBe("");
    expect(online.goal).toBe("order");
  });

  it("uses the saved brief when present and derives one otherwise", () => {
    const input = sampleInput();
    const saved = brief({ archetype: "shop", goal: "order", email: "hello@drita.al" });
    expect(websiteBriefOf({ ...input, website: saved })).toEqual(saved);
    expect(websiteBriefOf(input).archetype).toBe("restaurant");
    expect(businessInputSchema.safeParse({ ...input, website: saved }).success).toBe(true);
  });

  it("rejects unsafe or malformed contact details", () => {
    const bad: Partial<Record<keyof WebsiteBrief, unknown>>[] = [
      { email: "not-an-email" },
      { phone: "call me" },
      { phone: "12" },
      { whatsapp: "+355 abc" },
      { actionUrl: "http://booking.drita.al" },
      { actionUrl: "javascript:alert(1)" },
      { actionUrl: "https://user:pass@booking.drita.al" },
      { actionUrl: "https://localhost" },
      { social: ["https://instagram.com/a", "https://facebook.com/a", "https://tiktok.com/@a", "https://x.com/a"] },
      { social: ["ftp://files.drita.al"] },
      { items: [{ name: "", description: "", price: "" }] },
      { hours: [{ days: "Mon", time: "" }] },
    ];
    for (const overrides of bad) {
      expect(websiteBriefSchema.safeParse({ archetype: "general", goal: "contact", ...overrides }).success, JSON.stringify(overrides)).toBe(false);
    }
    expect(
      websiteBriefSchema.safeParse({
        archetype: "restaurant",
        goal: "book",
        email: "hello@drita.al",
        phone: "+355 69 123 4567",
        whatsapp: "+355691234567",
        actionUrl: "https://book.drita.al/table",
        social: ["https://instagram.com/drita"],
        hours: [{ days: "Mon–Fri", time: "08:00–18:00" }],
        items: [{ name: "Espresso", description: "Double shot", price: "150 ALL" }],
      }).success,
    ).toBe(true);
  });

  it("only promises a goal the site can honor", () => {
    expect(effectiveGoal(brief({ goal: "call" }))).toBe("contact");
    expect(effectiveGoal(brief({ goal: "call", phone: "+355 69 123 4567" }))).toBe("call");
    expect(effectiveGoal(brief({ goal: "book" }))).toBe("contact");
    expect(effectiveGoal(brief({ goal: "book", email: "a@drita.al" }))).toBe("book");
    expect(effectiveGoal(brief({ goal: "signup", email: "a@drita.al" }))).toBe("contact");
    expect(effectiveGoal(brief({ goal: "signup", actionUrl: "https://app.drita.al/signup" }))).toBe("signup");
    expect(effectiveGoal(brief({ goal: "visit" }))).toBe("contact");
    expect(effectiveGoal(brief({ goal: "visit", address: "Rruga e Durrësit 12, Tirana" }))).toBe("visit");
    expect(effectiveGoal(brief({ goal: "quote" }))).toBe("quote");
  });

  it("picks a layout from the brand style unless the owner chose one", () => {
    expect(resolveLayout(brief(), "Premium / Luxury")).toBe("editorial");
    expect(resolveLayout(brief(), "Bold / Energetic")).toBe("bold");
    expect(resolveLayout(brief(), "Modern / Minimal")).toBe("split");
    expect(resolveLayout(brief(), "Friendly / Approachable")).toBe("classic");
    expect(resolveLayout(brief({ layout: "bold" }), "Premium / Luxury")).toBe("bold");
  });
});
