import { describe, expect, it } from "vitest";
import { coerceAssumptions, computeFinancials, financialAssumptionsSchema, normalizeAssumptions, type FinancialAssumptions } from "@/lib/finance/model";

const base: FinancialAssumptions = {
  startupCosts: [
    { item: "Initial inventory", amount: 3000, essential: true },
    { item: "Website and photography", amount: 1500, essential: true },
  ],
  monthlyFixedCosts: [
    { item: "Hosting and tools", amount: 100 },
    { item: "Marketing", amount: 400 },
  ],
  revenueStreams: [
    { name: "Serum", unit: "order", price: 25, variableCost: 10, monthlyUnits: { conservative: 20, base: 50, optimistic: 100 } },
  ],
  notes: [],
};

describe("computeFinancials", () => {
  it("computes scenarios, margins and payback deterministically", () => {
    const r = computeFinancials(base, 8000);
    expect(r.totalStartupCosts).toBe(4500);
    expect(r.totalMonthlyFixedCosts).toBe(500);
    const [conservative, mid, optimistic] = r.scenarios;
    expect(conservative).toMatchObject({ monthlyRevenue: 500, monthlyVariableCosts: 200, monthlyGrossProfit: 300, grossMarginPct: 60, monthlyOperatingProfit: -200, paybackMonths: null });
    expect(mid).toMatchObject({ monthlyRevenue: 1250, monthlyOperatingProfit: 250, paybackMonths: 18 });
    expect(optimistic).toMatchObject({ monthlyRevenue: 2500, monthlyOperatingProfit: 1000, paybackMonths: 4.5 });
  });

  it("computes break-even from contribution per unit", () => {
    const r = computeFinancials(base, 8000);
    // 500 fixed / (25 - 10) = 33.3 → 34 orders.
    expect(r.breakEven).toEqual({ unitsPerMonth: 34, monthlyRevenue: 850, contributionPerUnit: 15, unit: "order" });
  });

  it("weights break-even by the base-case mix across streams", () => {
    const r = computeFinancials(
      {
        ...base,
        revenueStreams: [
          { name: "A", unit: "order", price: 20, variableCost: 10, monthlyUnits: { conservative: 0, base: 30, optimistic: 60 } },
          { name: "B", unit: "visit", price: 50, variableCost: 20, monthlyUnits: { conservative: 0, base: 10, optimistic: 20 } },
        ],
      },
      null,
    );
    // Mix 75% A, 25% B → contribution 0.75·10 + 0.25·30 = 15 → 500/15 = 33.3 → 34 units.
    expect(r.breakEven.contributionPerUnit).toBe(15);
    expect(r.breakEven.unitsPerMonth).toBe(34);
    expect(r.breakEven.unit).toBe("units");
  });

  it("reports no break-even when each sale loses money", () => {
    const r = computeFinancials({ ...base, revenueStreams: [{ ...base.revenueStreams[0]!, variableCost: 30 }] }, 8000);
    expect(r.breakEven.unitsPerMonth).toBeNull();
  });

  it("checks the budget and runway against the conservative scenario", () => {
    const within = computeFinancials(base, 8000).budget;
    expect(within).toEqual({ status: "within", budget: 8000, startupCosts: 4500, remainingAfterStartup: 3500, runwayMonths: 17.5, shortfall: 0, essentialStartupCosts: 4500 });
    expect(computeFinancials(base, 3000).budget).toMatchObject({ status: "over", remainingAfterStartup: -1500, runwayMonths: null, shortfall: 1500 });
    expect(computeFinancials(base, null).budget).toMatchObject({ status: "unknown", shortfall: null });
  });

  it("treats an explicit zero budget as a real budget, not a missing one", () => {
    expect(computeFinancials(base, 0).budget).toMatchObject({ status: "over", budget: 0, shortfall: 4500, remainingAfterStartup: -4500 });
    const free = computeFinancials({ ...base, startupCosts: [] }, 0).budget;
    expect(free).toMatchObject({ status: "within", budget: 0, shortfall: 0, remainingAfterStartup: 0 });
  });

  it("separates essential from optional startup costs without changing the total", () => {
    const staged = computeFinancials({ ...base, startupCosts: [base.startupCosts[0]!, { ...base.startupCosts[1]!, essential: false }] }, 4000).budget;
    expect(staged).toMatchObject({ status: "over", startupCosts: 4500, essentialStartupCosts: 3000, shortfall: 500 });
  });

  it("has no margin when there is no revenue", () => {
    const r = computeFinancials({ ...base, revenueStreams: [] }, 8000);
    expect(r.scenarios[1]!.grossMarginPct).toBeNull();
    expect(r.breakEven.unitsPerMonth).toBeNull();
  });
});

describe("coerceAssumptions", () => {
  it("accepts common model formatting without changing values", () => {
    const parsed = financialAssumptionsSchema.safeParse(
      coerceAssumptions({
        startupCosts: [{ item: "Stock", amount: "€1,200" }, { name: "Website", cost: "800 EUR" }],
        monthlyFixedCosts: [{ item: "Tools", amount: "1.250,50" }],
        revenueStreams: [{ name: "Serum", unit: "order", price: "25", variableCost: "9.5", monthlyUnits: 40 }],
        notes: ["x".repeat(400)],
      }),
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.startupCosts.map((c) => c.amount)).toEqual([1200, 800]);
    expect(parsed.data.monthlyFixedCosts[0]!.amount).toBe(1250.5);
    expect(parsed.data.revenueStreams[0]).toMatchObject({ price: 25, variableCost: 9.5, monthlyUnits: { conservative: 40, base: 40, optimistic: 40 } });
    expect(parsed.data.notes[0]).toHaveLength(300);
  });

  it("defaults startup costs to essential and keeps an explicit optional flag", () => {
    const parsed = financialAssumptionsSchema.parse(
      coerceAssumptions({
        startupCosts: [{ item: "Stock", amount: 100 }, { item: "Photo shoot", amount: 50, essential: false }, { item: "Sign", amount: 20, essential: "maybe" }],
        monthlyFixedCosts: [{ item: "Tools", amount: 10, essential: false }],
        revenueStreams: [{ name: "A", unit: "order", price: 10, variableCost: 2, monthlyUnits: 5 }],
      }),
    );
    expect(parsed.startupCosts.map((c) => c.essential)).toEqual([true, false, true]);
    expect(parsed.monthlyFixedCosts[0]).toEqual({ item: "Tools", amount: 10 });
  });

  it("reads notes given as an object or a list of objects and drops shapes that hold no text", () => {
    const asObject = financialAssumptionsSchema.safeParse(coerceAssumptions({ ...base, notes: { why: "Supplier quotes", uncertain: ["Volumes", 12] } }));
    expect(asObject.success && asObject.data.notes).toEqual(["Supplier quotes", "Volumes"]);
    const asObjects = financialAssumptionsSchema.safeParse(coerceAssumptions({ ...base, notes: [{ note: "Rent is a guess" }, "VAT excluded"] }));
    expect(asObjects.success && asObjects.data.notes).toEqual(["Rent is a guess", "VAT excluded"]);
    const noText = financialAssumptionsSchema.safeParse(coerceAssumptions({ ...base, notes: 42 }));
    expect(noText.success && noText.data.notes).toEqual([]);
    expect(noText.success && noText.data.revenueStreams).toEqual(base.revenueStreams);
  });

  it("accepts notes as a single string or null", () => {
    const base = { startupCosts: [], monthlyFixedCosts: [], revenueStreams: [{ name: "A", unit: "order", price: 10, variableCost: 2, monthlyUnits: 5 }] };
    const single = financialAssumptionsSchema.safeParse(coerceAssumptions({ ...base, notes: "Prices exclude VAT" }));
    expect(single.success && single.data.notes).toEqual(["Prices exclude VAT"]);
    expect(financialAssumptionsSchema.safeParse(coerceAssumptions({ ...base, notes: null })).success).toBe(true);
  });

  it("still rejects missing or non-numeric values instead of inventing them", () => {
    expect(financialAssumptionsSchema.safeParse(coerceAssumptions({ startupCosts: [{ item: "Stock", amount: "a lot" }], monthlyFixedCosts: [], revenueStreams: [] })).success).toBe(false);
    expect(
      financialAssumptionsSchema.safeParse(
        coerceAssumptions({ startupCosts: [], monthlyFixedCosts: [], revenueStreams: [{ name: "A", unit: "order", price: 10, monthlyUnits: { base: 5 } }] }),
      ).success,
    ).toBe(false);
    expect(coerceAssumptions(null)).toBeNull();
  });

  it("reads a complete answer nested one level down, without loosening the value checks", () => {
    const nested = financialAssumptionsSchema.safeParse(coerceAssumptions({ financialModel: base }));
    expect(nested.success && nested.data.revenueStreams).toEqual(base.revenueStreams);
    const incomplete = { financialModel: { ...base, revenueStreams: [{ name: "A", unit: "order", price: 10, monthlyUnits: { base: 5 } }] } };
    expect(financialAssumptionsSchema.safeParse(coerceAssumptions(incomplete)).success).toBe(false);
  });
});

describe("assumptions", () => {
  it("orders scenario volumes from conservative to optimistic", () => {
    const fixed = normalizeAssumptions({ ...base, revenueStreams: [{ ...base.revenueStreams[0]!, monthlyUnits: { conservative: 90, base: 10, optimistic: 40 } }] });
    expect(fixed.revenueStreams[0]!.monthlyUnits).toEqual({ conservative: 10, base: 40, optimistic: 90 });
  });

  it("rejects negative or non-numeric values", () => {
    expect(financialAssumptionsSchema.safeParse({ ...base, startupCosts: [{ item: "x", amount: -1 }] }).success).toBe(false);
    expect(financialAssumptionsSchema.safeParse({ ...base, monthlyFixedCosts: [{ item: "x", amount: "100" }] }).success).toBe(false);
  });
});
