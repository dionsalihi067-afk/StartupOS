import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createContext } from "@/lib/agents/context";
import { runSeoAgent } from "@/lib/agents/seo";
import { discoverySchema, toEngineFields, type Discovery } from "@/lib/discovery";
import type { BusinessInput } from "@/lib/types";
import { makePackage } from "@/test/db";

function input(overrides: Partial<{ [K in keyof Discovery]: Partial<Discovery[K]> }> = {}): BusinessInput {
  const d = discoverySchema.parse({
    business: { idea: "A new business", stage: "idea", type: "online", category: "general", location: "Prishtina, Kosovo", ...overrides.business },
    customer: { ideal: "Local customers", type: "b2c", ...overrides.customer },
    offer: { status: "planned" },
    model: { revenue: ["oneTime"], ...overrides.model },
    market: {},
    brand: { style: "Modern / Minimal", tone: "friendly", language: "en" },
    goals: { priority: "launch" },
  });
  return { ...toEngineFields(d), discovery: d };
}

describe("SEO agent", () => {
  const brand = makePackage().brand;
  const pages = makePackage().website.pages;

  it("uses LocalBusiness schema for a physical venue", () => {
    const ctx = createContext(input({ business: { idea: "Neighborhood bakery", category: "food", type: "physical" } }));
    const out = runSeoAgent(ctx, brand, pages);
    expect(out.data.jsonLd["@type"]).toBe("LocalBusiness");
    expect(out.data.keywords.some((k) => /near me/i.test(k))).toBe(true);
  });

  it("does not invent a storefront for an online SaaS business", () => {
    const ctx = createContext(
      input({ business: { idea: "Scheduling CRM for freelancers", category: "software", type: "online", location: "Prishtina, Kosovo" } }),
    );
    const out = runSeoAgent(ctx, brand, pages);
    expect(out.data.jsonLd["@type"]).toBe("Organization");
    expect(out.data.jsonLd).not.toHaveProperty("address");
    expect(out.data.keywords.some((k) => /near me/i.test(k))).toBe(false);
    expect(out.data.keywords.some((k) => /online/i.test(k))).toBe(true);
    expect(String(out.data.jsonLd.areaServed)).toContain("Prishtina");
  });

  it("does not treat Unspecified as a verified city or LocalBusiness market", () => {
    const ctx = createContext(
      input({ business: { idea: "Handmade notebooks sold online", category: "general", type: "online", location: "Unspecified" } }),
    );
    const out = runSeoAgent(ctx, brand, pages);
    expect(out.data.jsonLd["@type"]).toBe("Organization");
    expect(out.data.jsonLd).not.toHaveProperty("areaServed");
    expect(out.data.jsonLd).not.toHaveProperty("address");
    expect(out.data.keywords.join(" ")).not.toMatch(/Unspecified/i);
    expect(out.data.ogTitle).not.toMatch(/Unspecified/i);
  });

  it("prefers clothing offer terms over generic e-commerce & retail labels", () => {
    const ctx = createContext(
      input({
        business: {
          idea: "FICTIONAL clothing retail boutique in Fushë Kosovë",
          category: "ecommerce",
          type: "physical",
          location: "Fushë Kosovë, Kosovo",
        },
        offer: { status: "planned", main: "Everyday clothing and seasonal collections" },
        customer: { ideal: "Local shoppers" },
      }),
    );
    const out = runSeoAgent(ctx, { ...brand, name: "Velnua Test Boutique" }, pages);
    const blob = out.data.keywords.join(" | ").toLowerCase();
    expect(blob).toMatch(/clothing|seasonal|boutique/);
    expect(blob).not.toMatch(/e-commerce\s*&\s*retail/);
    expect(out.data.ogTitle.toLowerCase()).toMatch(/clothing|seasonal|boutique/);
  });

  it("builds page-specific titles and offer-based knowsAbout instead of industry blog topics", () => {
    const ctx = createContext(
      input({
        business: {
          idea: "Mobile bike repair",
          category: "services",
          type: "physical",
          location: "Tirana, Albania",
          offering: "On-site bicycle repair",
        },
        offer: { status: "existing", main: "On-site bicycle repair" },
        customer: { ideal: "Urban cyclists" },
      }),
    );
    const multiPages = [
      { slug: "/", title: "Home — BikeFix", metaDescription: "Home", sections: [] },
      { slug: "/services", title: "Services — BikeFix", metaDescription: "Services", sections: [] },
      { slug: "/contact", title: "Contact — BikeFix", metaDescription: "Contact", sections: [] },
    ];
    const out = runSeoAgent(ctx, { ...brand, name: "BikeFix", description: "On-site bicycle repair in Tirana.", slogan: "We come to you" }, multiPages);
    expect(out.data.title.toLowerCase()).toMatch(/bikefix|bicycle|tirana/);
    expect(String(out.data.jsonLd.knowsAbout).toLowerCase()).toMatch(/bicycle|repair|bike/);
    expect(String(out.data.jsonLd.knowsAbout).toLowerCase()).not.toMatch(/before & after projects|maintenance tips|cost guides/);
    expect(out.note).toMatch(/seo-heuristics/);
  });
});
