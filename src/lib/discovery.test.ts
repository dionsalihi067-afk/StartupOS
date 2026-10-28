import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { FLEXIBLE_BUDGET, discoveryBrief, discoverySchema, toEngineFields, type Discovery } from "@/lib/discovery";
import { businessInputSchema } from "@/lib/schemas";
import { contextSeed, createContext, withBrief } from "@/lib/agents/context";
import { runBrandAgent } from "@/lib/agents/brand";

function answers(overrides: Partial<{ [K in keyof Discovery]: Partial<Discovery[K]> }> = {}): Discovery {
  return discoverySchema.parse({
    business: { idea: "Specialty coffee shop", stage: "idea", type: "physical", category: "food", location: "Tirana", ...overrides.business },
    customer: { ideal: "Remote workers", type: "b2c", ...overrides.customer },
    offer: { status: "planned", ...overrides.offer },
    model: { revenue: ["oneTime"], ...overrides.model },
    market: { ...overrides.market },
    brand: { style: "Modern / Minimal", tone: "calm", language: "sq", ...overrides.brand },
    goals: { priority: "launch", ...overrides.goals },
  });
}

describe("business discovery", () => {
  it("maps answers onto the engine's core fields", () => {
    const d = answers({ model: { revenue: ["oneTime"], budget: "€5,000" } });
    expect(toEngineFields(d)).toEqual({
      idea: "Specialty coffee shop",
      audience: "Remote workers",
      location: "Tirana",
      budget: "€5,000",
      style: "Modern / Minimal",
    });
  });

  it("uses a flexible budget when the owner does not know it yet", () => {
    expect(toEngineFields(answers()).budget).toBe(FLEXIBLE_BUDGET);
    expect(toEngineFields(answers({ model: { revenue: ["oneTime"], budget: "€1", budgetUnknown: true } })).budget).toBe(FLEXIBLE_BUDGET);
  });

  it("does not require revenue figures from an idea-stage business", () => {
    expect(() => answers({ business: { stage: "idea" } })).not.toThrow();
  });

  it("requires at least one revenue model and the core choices", () => {
    expect(() => answers({ model: { revenue: [] } })).toThrow();
    expect(() => answers({ business: { idea: "x" } })).toThrow();
  });

  it("labels owner-provided market knowledge as unverified in the brief", () => {
    const brief = discoveryBrief(answers({ business: { name: "Drita" }, market: { competitors: "Café Rio" } }));
    expect(brief).toContain("Business name (use exactly): Drita");
    expect(brief).toContain("Competitors named by the owner (unverified): Café Rio");
    expect(brief).toContain("Albanian");
    expect(brief).not.toContain("Current revenue");
  });

  it("is appended to agent prompts only when present", () => {
    const d = answers({ market: { competitors: "Café Rio" } });
    const withDiscovery = createContext({ ...toEngineFields(d), discovery: d });
    const legacy = createContext(toEngineFields(d));
    expect(withBrief(withDiscovery, "PROMPT")).toContain("Café Rio");
    expect(withBrief(legacy, "PROMPT")).not.toContain("Café Rio");
    expect(withBrief(legacy, "PROMPT")).not.toContain("Discovery");
    expect(withBrief(legacy, "PROMPT")).toMatch(/^PROMPT\n\nCanonical business profile:/);
  });

  it("keeps owner facts in the shared brief and does not invent a budget", () => {
    const d = answers({
      business: { name: "Drita", offering: "Flat whites and pour-overs", location: "Prishtina, Kosovo" },
      model: { revenue: ["oneTime"], channels: ["store", "messaging"] },
    });
    const brief = withBrief(createContext({ ...toEngineFields(d), discovery: d }), "PROMPT");
    expect(brief).toContain("Business name (use exactly): Drita");
    expect(brief).toContain("Prishtina, Kosovo");
    expect(brief).toMatch(/market: Prishtina, Kosovo \(owner-provided\)/);
    expect(brief).toContain("Not provided by the owner");
    expect(brief).toMatch(/budget/i);
    expect(brief).not.toMatch(/budget: \d/);
  });

  it("changes the generation seed when discovery answers change", () => {
    const core = toEngineFields(answers());
    const a = answers({ business: { stage: "idea", type: "online" }, model: { revenue: ["subscription"], channels: ["website"] } });
    const b = answers({ business: { stage: "operating", type: "physical" }, model: { revenue: ["oneTime"], channels: ["store"] } });
    expect(contextSeed({ ...core, discovery: a })).not.toBe(contextSeed({ ...core, discovery: b }));
    expect(contextSeed(core)).not.toBe(contextSeed({ ...core, discovery: a }));
  });

  it("keeps the owner's business name in the brand identity", async () => {
    const d = answers({ business: { name: "Drita" } });
    const ctx = { ...createContext({ ...toEngineFields(d), discovery: d }), useLlm: false };
    const { data } = await runBrandAgent(ctx);
    expect(data.name).toBe("Drita");
    expect(data.description).toContain("Drita");
  });

  it("is stored alongside the core input", () => {
    const d = answers();
    const parsed = businessInputSchema.parse({ ...toEngineFields(d), discovery: d });
    expect(parsed.discovery?.goals.priority).toBe("launch");
  });

  it("accepts the TIAR KINGU Albanian bakery profile with informal Unicode and undecided budget/pricing", () => {
    // Real failing onboarding payload (colloquial Albanian). Must not be rejected as invalidInput.
    const discovery = discoverySchema.parse({
      business: {
        name: "TIAR KINGU",
        idea: "une kom anderr me qel ni bakery shop me mamin time",
        offering: "muffins, pite, flija, pizza, cake, croissants, and baked goods",
        stage: "idea",
        type: "both",
        category: "food",
        location: "Prishtinë, Kosovo",
      },
      customer: {
        ideal: "kliente te uritur",
        type: "b2c",
        problem: "unt",
        need: "buk",
        geography: "te qafa",
      },
      offer: {
        main: "Flija",
        priceUnknown: true,
        differentiator: "kualitet moiell i importuar",
        status: "planned",
        details: { service: ["dineIn"], cuisine: "ushqime te embla", serviceArea: "te qafa" },
      },
      model: {
        revenue: ["oneTime"],
        budgetUnknown: true,
        channels: ["store"],
      },
      market: {},
      brand: {
        style: "Corporate / Professional",
        tone: "friendly",
        colors: "Brown and cream",
        avoidColors: "Neon colors",
        references: "Pepsi",
        language: "sq",
        notes: "vend mikprites",
      },
      goals: {
        priority: "customers",
        goal: "Build a base of regular customers",
        outcome: "2,000 customers per month",
        timeframe: "1m",
      },
    });

    const input = businessInputSchema.parse({ ...toEngineFields(discovery), discovery });
    expect(input.discovery?.business.name).toBe("TIAR KINGU");
    expect(input.discovery?.business.location).toContain("Prishtinë");
    expect(input.discovery?.customer.ideal).toBe("kliente te uritur");
    expect(input.budget).toBe(FLEXIBLE_BUDGET);
    expect(input.discovery?.offer.priceUnknown).toBe(true);
    expect(input.discovery?.model.budgetUnknown).toBe(true);
    expect(input.discovery?.market.competitors).toBe("");
    expect(input.style).toBe("Corporate / Professional");
  });
});
