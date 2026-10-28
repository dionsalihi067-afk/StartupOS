import { describe, expect, it } from "vitest";
import { resolveShape } from "@/lib/website/builder";
import { buildWebsiteSpec } from "@/lib/website/builder";
import { makePackage } from "@/test/db";
import { sampleInput } from "@/test/research";

describe("website composition variants", () => {
  it("changes home section order by conversion goal within the same archetype", () => {
    const quote = resolveShape("localService", "quote", { earlyStage: false, itemCount: 4, hasPricing: false });
    const order = resolveShape("shop", "order", { earlyStage: false, itemCount: 4, hasPricing: false });
    const signup = resolveShape("software", "signup", { earlyStage: false, itemCount: 4, hasPricing: true });

    expect(quote.home.indexOf("why")).toBeLessThan(quote.home.indexOf("offer"));
    expect(order.home[0]).toBe("offer");
    expect(signup.home.indexOf("why")).toBeLessThan(signup.home.indexOf("offer"));
    expect(signup.home).toContain("pricing");
    expect(quote.home).not.toContain("pricing");
  });

  it("builds different structures for a restaurant vs a B2B software business", () => {
    const restaurant = sampleInput({
      business: {
        name: "Furrë e Vogël",
        idea: "Neighborhood bakery cafe",
        type: "physical",
        category: "food",
        location: "Prishtina, Kosovo",
        offering: "Pastries and coffee",
      },
      offer: { main: "Fresh pastries", others: "Coffee, sandwiches" },
      customer: { ideal: "Office workers nearby" },
    });
    restaurant.website = {
      archetype: "restaurant",
      goal: "visit",
      layout: "classic",
      email: "hello@furre.example",
      phone: "+355 69 111 2222",
      whatsapp: "",
      address: "Rruga B, Prishtina",
      serviceArea: "",
      hours: [{ days: "Mon–Sat", time: "07:00–19:00" }],
      actionUrl: "",
      social: [],
      items: [
        { name: "Sourdough", description: "Daily bake", price: "2€" },
        { name: "Espresso", description: "", price: "1.20€" },
      ],
      pages: { about: true, faq: true },
      heroImage: "",
      heroImageAlt: "",
    };

    const software = sampleInput({
      business: {
        name: "Shiftboard",
        idea: "SaaS scheduling for clinics",
        type: "online",
        category: "software",
        location: "Remote / EU",
        offering: "Staff scheduling software",
      },
      offer: { main: "Clinic staff scheduling", others: "Shift swaps, reminders" },
      customer: { ideal: "Clinic managers", type: "b2b" },
      model: { revenue: ["subscription"] },
    });
    software.website = {
      archetype: "software",
      goal: "signup",
      layout: "split",
      email: "hello@shiftboard.example",
      phone: "",
      whatsapp: "",
      address: "",
      serviceArea: "EU",
      hours: [],
      actionUrl: "https://app.shiftboard.example/signup",
      social: [],
      items: [
        { name: "Shift planner", description: "Weekly roster", price: "" },
        { name: "Reminders", description: "SMS nudges", price: "" },
        { name: "Swap board", description: "Staff cover", price: "" },
      ],
      pages: { about: true, faq: true },
      heroImage: "",
      heroImageAlt: "",
    };

    const brand = makePackage().brand;
    const pricing = makePackage().pricing;
    const restSpec = buildWebsiteSpec({ input: restaurant, brand: { ...brand, name: "Furrë e Vogël" }, pricing });
    const softSpec = buildWebsiteSpec({
      input: software,
      brand: { ...brand, name: "Shiftboard", slogan: "Staff schedules that stick" },
      pricing,
    });

    expect(restSpec.archetype).toBe("restaurant");
    expect(softSpec.archetype).toBe("software");
    expect(restSpec.pages.some((p) => p.slug === "/menu")).toBe(true);
    expect(softSpec.pages.some((p) => p.slug === "/features" || p.slug === "/pricing")).toBe(true);

    const restHome = restSpec.pages.find((p) => p.slug === "/")!.sections.map((s) => s.type);
    const softHome = softSpec.pages.find((p) => p.slug === "/")!.sections.map((s) => s.type);
    expect(restHome[0]).toBe("hero");
    expect(softHome[0]).toBe("hero");
    // Restaurant visit goal leads with offer after hero; software signup leads with why/features.
    expect(restHome.includes("offer")).toBe(true);
    expect(softHome.includes("features") || softHome.includes("offer")).toBe(true);
    expect(restHome.join(">")).not.toEqual(softHome.join(">"));

    expect(restSpec.pages[0]!.seo.title.toLowerCase()).toMatch(/furrë|pastr|pristin/i);
    expect(softSpec.pages[0]!.seo.title.toLowerCase()).toMatch(/shiftboard|schedul/i);
  });
});
