import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createContext } from "@/lib/agents/context";
import { copyBrief, hasChannel, knownMarketLocation } from "@/lib/agents/copy-brief";
import { runEmailAgent } from "@/lib/agents/email";
import { runMarketingAgent } from "@/lib/agents/marketing";
import { runWhatsAppAgent } from "@/lib/agents/whatsapp";
import { runSeoAgent } from "@/lib/agents/seo";
import { discoverySchema, toEngineFields, type Discovery } from "@/lib/discovery";
import type { BusinessInput } from "@/lib/types";
import { makePackage } from "@/test/db";

function input(overrides: Partial<{ [K in keyof Discovery]: Partial<Discovery[K]> }> = {}): BusinessInput {
  const d = discoverySchema.parse({
    business: { idea: "A new business", stage: "idea", type: "online", category: "general", location: "Prishtina, Kosovo", ...overrides.business },
    customer: { ideal: "Local customers", type: "b2c", ...overrides.customer },
    offer: { status: "planned", ...overrides.offer },
    model: { revenue: ["oneTime"], ...overrides.model },
    market: { ...overrides.market },
    brand: { style: "Modern / Minimal", tone: "friendly", language: "en", ...overrides.brand },
    goals: { priority: "launch", ...overrides.goals },
  });
  return { ...toEngineFields(d), discovery: d };
}

function ctx(i: BusinessInput) {
  const c = createContext(i);
  c.useLlm = false;
  return c;
}

const brand = makePackage().brand;
const persona = makePackage().persona;
const allText = (value: unknown) => JSON.stringify(value);

const FABRICATED =
  /\b(?:limited time|act now|\d+\s*%\s*off|discount|testimonial|guaranteed|certified|most popular|best-selling|starter,? growth,? and premium|middle tier|happy customers|limited spots)\b/i;

describe("knownMarketLocation", () => {
  it("keeps owner-supplied markets and blanks unknown placeholders", () => {
    expect(knownMarketLocation("Prishtina, Kosovo")).toBe("Prishtina, Kosovo");
    expect(knownMarketLocation("Remote / EU")).toBe("Remote / EU");
    expect(knownMarketLocation("Unspecified")).toBe("");
    expect(knownMarketLocation("unknown")).toBe("");
    expect(knownMarketLocation("  ")).toBe("");
  });
});

describe("copy brief", () => {
  it("preserves owner offering and does not invent a budget", () => {
    const brief = copyBrief(
      ctx(
        input({
          business: { idea: "Mobile bike repair", offering: "On-site bike repairs", location: "Prishtina, Kosovo" },
          offer: { status: "planned", main: "Flat-rate tune-ups" },
          customer: { ideal: "Commuters", type: "b2c", problem: "cannot get to a shop mid-week" },
          model: { revenue: ["oneTime"], channels: ["direct", "messaging"] },
        }),
      ),
    );
    expect(brief.offering).toBe("Flat-rate tune-ups");
    expect(brief.problem).toMatch(/cannot get to a shop/i);
    expect(brief.hasPaidBudget).toBe(false);
    expect(brief.location).toContain("Prishtina");
    expect(hasChannel(brief, "direct")).toBe(true);
    expect(hasChannel(brief, "social")).toBe(false);
  });
});

describe("marketing deliverables", () => {
  it("produces meaningfully different copy for different businesses", async () => {
    const bike = await runMarketingAgent(
      ctx(
        input({
          business: { idea: "Mobile bike repair", offering: "On-site bike repairs", category: "services", type: "physical", stage: "idea", location: "Prishtina, Kosovo" },
          offer: { status: "planned", main: "Flat-rate tune-ups", differentiator: "We come to your office" },
          customer: { ideal: "Office commuters", type: "b2c", problem: "cannot visit a shop mid-week" },
          model: { revenue: ["oneTime"], channels: ["direct", "messaging", "social"] },
        }),
      ),
      brand,
      persona,
    );
    const saas = await runMarketingAgent(
      ctx(
        input({
          business: { idea: "Scheduling CRM for freelancers", offering: "Booking and invoicing software", category: "software", type: "online", stage: "preparing", location: "Remote / EU" },
          offer: { status: "planned", main: "Monthly scheduling subscriptions", differentiator: "Built for solo freelancers" },
          customer: { ideal: "Freelance designers", type: "b2b", problem: "juggling clients in spreadsheets" },
          model: { revenue: ["subscription"], channels: ["website", "direct"], budget: "€4,000" },
        }),
      ),
      brand,
      persona,
    );

    expect(allText(bike.data)).toMatch(/tune-ups|bike|commuters/i);
    expect(allText(saas.data)).toMatch(/scheduling|freelancers|spreadsheets/i);
    expect(bike.data.strategy.positioning).not.toBe(saas.data.strategy.positioning);
    expect(allText(bike.data.instagram.map((p) => p.caption))).not.toBe(allText(saas.data.instagram.map((p) => p.caption)));
  });

  it("skips paid ads and social drafts when channels/budget do not support them", async () => {
    const out = await runMarketingAgent(
      ctx(
        input({
          business: { idea: "B2B consulting", category: "services", type: "online" },
          model: { revenue: ["oneTime"], channels: ["website", "direct"] },
        }),
      ),
      brand,
      persona,
    );
    expect(out.data.facebookAds).toEqual([]);
    expect(out.data.instagram).toEqual([]);
    expect(allText(out.data.strategy.calendar)).not.toMatch(/paid ad/i);
    expect(allText(out.data.strategy.calendar)).not.toMatch(/ad refresh/i);
  });

  it("includes paid ad drafts when budget and social are both present", async () => {
    const out = await runMarketingAgent(
      ctx(
        input({
          business: { idea: "Natural soap shop", category: "ecommerce", type: "online" },
          offer: { status: "planned", main: "Cold-process soaps" },
          model: { revenue: ["oneTime"], channels: ["website", "social"], budget: "€2,500" },
        }),
      ),
      brand,
      persona,
    );
    expect(out.data.facebookAds.length).toBeGreaterThan(0);
    expect(out.data.instagram.length).toBeGreaterThan(0);
    expect(allText(out.data.strategy.calendar)).toMatch(/paid ad draft/i);
    expect(allText(out.data)).not.toMatch(FABRICATED);
  });

  it("still drafts ad copy when social is selected but no spendable budget", async () => {
    const out = await runMarketingAgent(
      ctx(
        input({
          business: { idea: "Local clothing boutique", category: "ecommerce", type: "physical" },
          offer: { status: "planned", main: "Everyday clothing and seasonal collections" },
          model: { revenue: ["oneTime"], channels: ["store", "social"], budget: "" },
        }),
      ),
      brand,
      persona,
    );
    expect(out.data.facebookAds.length).toBeGreaterThan(0);
    expect(out.data.facebookAds.every((a) => a.estimatedCpc === "")).toBe(true);
    expect(allText(out.data.strategy.calendar)).toMatch(/ad creative draft/i);
    expect(allText(out.data)).not.toMatch(FABRICATED);
  });

  it("does not invent Kosovo or EUR when location and budget are unknown", async () => {
    const legacy = createContext({
      idea: "Handmade notebooks",
      audience: "Journal keepers",
      location: "",
      budget: "flexible",
      style: "Modern / Minimal",
    });
    legacy.useLlm = false;
    const out = await runMarketingAgent(legacy, brand, persona);
    expect(allText(out.data)).not.toMatch(/Kosovo|Prishtin|€|EUR/i);
    // Legacy inputs without discovery still default to social → ad copy allowed, no spend invented.
    expect(out.data.facebookAds.length).toBeGreaterThan(0);
    expect(out.data.facebookAds.every((a) => a.estimatedCpc === "")).toBe(true);
  });
});

describe("email and whatsapp", () => {
  it("grounds email and WhatsApp in the offering without fabricated claims", async () => {
    const c = ctx(
      input({
        business: { name: "Rrota", idea: "Mobile bike repair", offering: "On-site bike repairs", stage: "idea", location: "Prishtina, Kosovo" },
        offer: { status: "planned", main: "Flat-rate tune-ups" },
        customer: { ideal: "Office commuters", type: "b2c", problem: "cannot visit a shop mid-week" },
        model: { revenue: ["oneTime"], channels: ["messaging", "direct"] },
      }),
    );
    const email = await runEmailAgent(c, { ...brand, name: "Rrota" });
    const wa = runWhatsAppAgent(c, { ...brand, name: "Rrota" });

    expect(allText(email.data)).toMatch(/tune-ups|bike|commuters/i);
    expect(allText(email.data)).not.toMatch(FABRICATED);
    expect(allText(wa.data)).toMatch(/tune-ups|bike|Rrota/i);
    expect(allText(wa.data)).not.toMatch(/starter,? growth,? and premium|middle tier|most customers choose|most popular option/i);
    expect(wa.data.nodes.every((n) => n.id)).toBe(true);
    const ids = new Set(wa.data.nodes.map((n) => n.id));
    for (const n of wa.data.nodes) {
      for (const opt of n.options ?? []) expect(ids.has(opt.next)).toBe(true);
      if (n.next) expect(ids.has(n.next)).toBe(true);
    }
  });
});

describe("cross-module consistency", () => {
  it("keeps location and offering aligned across marketing, email, WhatsApp and SEO", async () => {
    const c = ctx(
      input({
        business: {
          name: "Drita",
          idea: "Specialty coffee for remote workers",
          offering: "Pour-over and workspace-friendly seating",
          category: "food",
          type: "physical",
          stage: "preparing",
          location: "Tirana, Albania",
        },
        offer: { status: "planned", main: "Specialty pour-over coffee" },
        customer: { ideal: "Remote workers", type: "b2c" },
        model: { revenue: ["oneTime"], channels: ["store", "social"], budget: "€5,000" },
      }),
    );
    const marketing = await runMarketingAgent(c, { ...brand, name: "Drita" }, persona);
    const email = await runEmailAgent(c, { ...brand, name: "Drita" });
    const wa = runWhatsAppAgent(c, { ...brand, name: "Drita" });
    const seo = runSeoAgent(c, { ...brand, name: "Drita" }, makePackage().website.pages);

    for (const blob of [marketing.data, email.data, wa.data]) {
      expect(allText(blob)).toMatch(/pour-over|coffee|Drita/i);
      expect(allText(blob)).toMatch(/Tirana/i);
      expect(allText(blob)).not.toMatch(/Kosovo/i);
    }
    expect(seo.data.jsonLd["@type"]).toBe("LocalBusiness");
    expect(String(seo.data.jsonLd.areaServed)).toContain("Tirana");
  });
});
