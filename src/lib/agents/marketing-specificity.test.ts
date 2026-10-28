/**
 * Two same-industry businesses must receive meaningfully different marketing
 * pillars when offers, audiences and problems differ (deterministic path).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createContext } from "@/lib/agents/context";
import { deriveContentPillars, runMarketingAgent } from "@/lib/agents/marketing";
import { marketingLooksGeneric } from "@/lib/generation-quality";
import { discoverySchema, toEngineFields, type Discovery } from "@/lib/discovery";
import type { BusinessInput, CustomerPersona } from "@/lib/types";
import { makePackage } from "@/test/db";

function input(overrides: Partial<{ [K in keyof Discovery]: Partial<Discovery[K]> }> = {}): BusinessInput {
  const d = discoverySchema.parse({
    business: {
      idea: "A new business",
      stage: "preparing",
      type: "physical",
      category: "services",
      location: "Prishtina, Kosovo",
      ...overrides.business,
    },
    customer: { ideal: "Local customers", type: "b2c", ...overrides.customer },
    offer: { status: "planned", ...overrides.offer },
    model: { revenue: ["oneTime"], channels: ["website", "social"], ...overrides.model },
    market: { ...overrides.market },
    brand: { style: "Modern / Minimal", tone: "friendly", language: "en" },
    goals: { priority: "launch" },
  });
  return { ...toEngineFields(d), discovery: d };
}

const persona = (name: string, pain: string, goal: string): CustomerPersona => ({
  ...makePackage().persona,
  name,
  painPoints: [pain],
  goals: [goal],
});

describe("marketing specificity", () => {
  it("derives different pillars for two service businesses in the same industry", async () => {
    const plumbing = input({
      business: {
        name: "Gjakova Plumb",
        idea: "Emergency plumbing and pipe repair for homes",
        offering: "Emergency plumbing",
        category: "services",
        type: "physical",
        location: "Gjakova, Kosovo",
      },
      customer: {
        ideal: "Homeowners with burst pipes",
        problem: "need a reliable plumber after hours",
        need: "fast leak repair",
      },
      offer: {
        status: "existing",
        main: "24/7 emergency plumbing",
        differentiator: "On-site in under 60 minutes in Gjakova",
      },
      market: { positioning: "Fastest local emergency response" },
    });

    const consulting = input({
      business: {
        name: "Klar Strategy",
        idea: "B2B operations consulting for small manufacturers",
        offering: "Operations consulting",
        category: "services",
        type: "online",
        location: "Prishtina, Kosovo",
      },
      customer: {
        ideal: "Factory owners scaling past 20 staff",
        problem: "chaos in weekly production planning",
        need: "a clearer weekly ops rhythm",
        type: "b2b",
      },
      offer: {
        status: "existing",
        main: "Weekly operations coaching retainers",
        differentiator: "Shop-floor workshops, not slide decks",
      },
      market: { positioning: "Hands-on ops coaching for manufacturers" },
    });

    const brandA = { ...makePackage().brand, name: "Gjakova Plumb", slogan: "Pipes fixed tonight" };
    const brandB = { ...makePackage().brand, name: "Klar Strategy", slogan: "Ops without the chaos" };

    const a = await runMarketingAgent(createContext(plumbing), brandA, persona("Arben", "burst pipes at night", "stop the leak"));
    const b = await runMarketingAgent(createContext(consulting), brandB, persona("Mira", "missed production targets", "stable weekly plan"));

    const pillarsA = a.data.strategy.contentPillars.map((p) => p.pillar.toLowerCase()).join(" | ");
    const pillarsB = b.data.strategy.contentPillars.map((p) => p.pillar.toLowerCase()).join(" | ");

    expect(pillarsA).toMatch(/plumb|pipe|leak|gjakova|emergency/i);
    expect(pillarsB).toMatch(/ops|operations|manufactur|coaching|weekly/i);
    expect(pillarsA).not.toEqual(pillarsB);

    // Shared industry stock topics must not dominate either calendar.
    for (const theme of [...a.data.strategy.calendar, ...b.data.strategy.calendar].map((w) => w.theme.toLowerCase())) {
      expect(theme).not.toMatch(/behind the scenes|customer favorites|seasonal specials|brand stories/);
    }

    expect(marketingLooksGeneric(a.data.strategy, "24/7 emergency plumbing", "Homeowners with burst pipes")).toBe(false);
    expect(marketingLooksGeneric(b.data.strategy, "Weekly operations coaching retainers", "Factory owners")).toBe(false);

    expect(a.data.strategy.positioning.toLowerCase()).toMatch(/plumb|gjakova|emergency|pipe/);
    expect(b.data.strategy.positioning.toLowerCase()).toMatch(/ops|manufactur|coach|chaos|klar/i);
  });

  it("keeps deterministic pillars grounded in the copy brief", () => {
    const briefInput = input({
      business: { name: "Qershia", idea: "Sourdough bakery", offering: "Sourdough loaves", category: "food", location: "Peja, Kosovo" },
      customer: { ideal: "Peja neighbours who want fresh bread", problem: "supermarket bread goes stale fast" },
      offer: { main: "Same-day sourdough loaves", differentiator: "Milled locally each morning" },
    });
    const ctx = createContext(briefInput);
    const brand = { ...makePackage().brand, name: "Qershia" };
    const pillars = deriveContentPillars(
      {
        idea: briefInput.idea,
        audience: briefInput.audience,
        location: "Peja, Kosovo",
        city: "Peja",
        offering: "Same-day sourdough loaves",
        problem: "supermarket bread goes stale fast",
        need: null,
        differentiator: "Milled locally each morning",
        positioning: null,
        stage: "preparing",
        earlyStage: true,
        hasPaidBudget: false,
        channels: new Set(["website", "social"]),
        modelKind: "foodVenue",
        sellsOnline: false,
        styleLead: "modern",
      },
      brand,
      persona("Lira", "stale supermarket bread", "fresh loaf tonight"),
    );
    const blob = pillars.map((p) => `${p.pillar} ${p.sampleTopics.join(" ")}`).join(" ").toLowerCase();
    expect(blob).toMatch(/sourdough|loaf|peja|milled|stale/);
    expect(blob).not.toMatch(/behind the kitchen|ingredient spotlights|customer favorites/);
    void ctx;
  });
});
