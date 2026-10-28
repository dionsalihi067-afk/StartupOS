import { z } from "zod";

/**
 * Deterministic financial model. Every number shown to the owner is computed
 * here from explicit assumptions; the language model may propose assumption
 * values but never does arithmetic. All outputs are planning estimates.
 */

export const SCENARIOS = ["conservative", "base", "optimistic"] as const;
export type Scenario = (typeof SCENARIOS)[number];

const money = z.number().finite().min(0).max(100_000_000);
const units = z.number().finite().min(0).max(10_000_000);
const label = z.string().trim().min(1).max(120);

export const financialAssumptionsSchema = z.object({
  /** `essential: false` marks spending that could be deferred to fit a smaller budget. */
  startupCosts: z.array(z.object({ item: label, amount: money, essential: z.boolean().default(true) })).max(14),
  monthlyFixedCosts: z.array(z.object({ item: label, amount: money })).max(14),
  revenueStreams: z
    .array(
      z.object({
        name: label,
        /** What one sale is: "order", "subscription per month", "cleaning visit"… */
        unit: label,
        price: money,
        variableCost: money,
        monthlyUnits: z.object({ conservative: units, base: units, optimistic: units }),
      }),
    )
    .max(5),
  /** Why the values were chosen; shown as assumptions. */
  notes: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
});
export type FinancialAssumptions = z.infer<typeof financialAssumptionsSchema>;

/** Reads "1,200", "€1.200,50" or "1200 EUR" as a number; leaves anything unreadable for the schema to reject. */
function toNumber(value: unknown): unknown {
  if (typeof value !== "string") return value;
  let s = value.replace(/[^\d.,-]/g, "");
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, "");
  else if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  return s === "" || s === "-" ? value : Number(s);
}

const clipText = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : value);
const list = (value: unknown, max: number) => (Array.isArray(value) ? value.slice(0, max) : value);

/**
 * Notes are the model's explanation, not figures. The prompt asks "why these values; which
 * are most uncertain", which models answer as a string, a list, an object with those two
 * parts, or a list of such objects. Their text is kept; anything else is left out, so an
 * oddly shaped explanation never discards an otherwise valid set of numbers.
 */
function noteTexts(value: unknown, depth = 0): string[] {
  if (typeof value === "string") return [value];
  if (depth > 1 || !value || typeof value !== "object") return [];
  const parts = Array.isArray(value) ? value : Object.values(value);
  return parts.flatMap((part) => noteTexts(part, depth + 1));
}

/**
 * Normalises formatting differences in model output (numbers as strings, long
 * labels, extra items, a single volume instead of three) before validation.
 * Values are never invented: anything missing or non-numeric still fails.
 */
/**
 * LLM boundary schema: coerces common formatting quirks, then validates.
 * Used by `generateJson({ schema })` so invalid financial JSON cannot look successful.
 */
export const financialAssumptionsLlmSchema = z.preprocess((raw) => coerceAssumptions(raw), financialAssumptionsSchema);

export function coerceAssumptions(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  let r = raw as Record<string, unknown>;
  // {"financialModel": {startupCosts, …}} is the requested object nested one level down.
  if (!("revenueStreams" in r)) {
    const nested = Object.values(r).filter(
      (v): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) && "revenueStreams" in v,
    );
    if (nested.length === 1) r = nested[0]!;
  }
  const costs = (value: unknown, withEssential: boolean) =>
    Array.isArray(value)
      ? (list(value, 14) as Record<string, unknown>[]).map((c) => {
          if (!c || typeof c !== "object") return c;
          const cost: Record<string, unknown> = { item: clipText(c.item ?? c.name, 120), amount: toNumber(c.amount ?? c.cost) };
          if (withEssential && typeof c.essential === "boolean") cost.essential = c.essential;
          return cost;
        })
      : value;
  const streams = Array.isArray(r.revenueStreams)
    ? (list(r.revenueStreams, 5) as Record<string, unknown>[]).map((s) => {
        if (!s || typeof s !== "object") return s;
        const units = s.monthlyUnits;
        const volumes =
          units && typeof units === "object"
            ? Object.fromEntries(SCENARIOS.map((k) => [k, toNumber((units as Record<string, unknown>)[k])]))
            : typeof toNumber(units) === "number"
              ? Object.fromEntries(SCENARIOS.map((k) => [k, toNumber(units)]))
              : units;
        return { name: clipText(s.name, 120), unit: clipText(s.unit, 120), price: toNumber(s.price), variableCost: toNumber(s.variableCost), monthlyUnits: volumes };
      })
    : r.revenueStreams;
  return {
    startupCosts: costs(r.startupCosts, true),
    monthlyFixedCosts: costs(r.monthlyFixedCosts, false),
    revenueStreams: streams,
    notes: noteTexts(r.notes)
      .map((n) => n.trim().slice(0, 300))
      .filter((n) => n !== "")
      .slice(0, 10),
  };
}

export interface ScenarioResult {
  scenario: Scenario;
  monthlyRevenue: number;
  monthlyVariableCosts: number;
  monthlyGrossProfit: number;
  /** Null when there is no revenue. */
  grossMarginPct: number | null;
  monthlyFixedCosts: number;
  monthlyOperatingProfit: number;
  /** Months of operating profit needed to recover startup costs; null when the scenario loses money. */
  paybackMonths: number | null;
}

export interface BreakEven {
  /** Units of the revenue mix per month needed to cover fixed costs; null when each sale loses money or nothing is priced. */
  unitsPerMonth: number | null;
  /** Revenue at break-even. */
  monthlyRevenue: number | null;
  /** Average contribution (price − variable cost) per unit across the base-case mix. */
  contributionPerUnit: number | null;
  /** Unit label when all units are the same kind, else "units". */
  unit: string;
}

export type BudgetStatus = "within" | "over" | "unknown";

export interface BudgetCheck {
  status: BudgetStatus;
  budget: number | null;
  startupCosts: number;
  /** Budget left after startup costs (negative when over budget). */
  remainingAfterStartup: number | null;
  /** Months the remaining budget covers the conservative scenario's monthly loss; null when it is profitable or unknown. */
  runwayMonths: number | null;
  /** How much more money the startup costs need than the budget; 0 when within, null when no budget. Absent on older packages. */
  shortfall?: number | null;
  /** Startup costs not marked optional. Absent on older packages. */
  essentialStartupCosts?: number;
}

export interface FinancialResults {
  totalStartupCosts: number;
  totalMonthlyFixedCosts: number;
  scenarios: ScenarioResult[];
  breakEven: BreakEven;
  budget: BudgetCheck;
}

const round = (n: number) => Math.round(n * 100) / 100;
const sum = (values: number[]) => round(values.reduce((a, b) => a + b, 0));

export function computeFinancials(a: FinancialAssumptions, budget: number | null): FinancialResults {
  const totalStartupCosts = sum(a.startupCosts.map((c) => c.amount));
  const totalMonthlyFixedCosts = sum(a.monthlyFixedCosts.map((c) => c.amount));

  const scenarios = SCENARIOS.map((scenario): ScenarioResult => {
    const revenue = sum(a.revenueStreams.map((s) => s.price * s.monthlyUnits[scenario]));
    const variable = sum(a.revenueStreams.map((s) => s.variableCost * s.monthlyUnits[scenario]));
    const gross = round(revenue - variable);
    const operating = round(gross - totalMonthlyFixedCosts);
    return {
      scenario,
      monthlyRevenue: revenue,
      monthlyVariableCosts: variable,
      monthlyGrossProfit: gross,
      grossMarginPct: revenue > 0 ? round((gross / revenue) * 100) : null,
      monthlyFixedCosts: totalMonthlyFixedCosts,
      monthlyOperatingProfit: operating,
      paybackMonths: operating > 0 ? round(totalStartupCosts / operating) : null,
    };
  });

  return {
    totalStartupCosts,
    totalMonthlyFixedCosts,
    scenarios,
    breakEven: breakEven(a, totalMonthlyFixedCosts),
    budget: budgetCheck(budget, totalStartupCosts, sum(a.startupCosts.filter((c) => c.essential).map((c) => c.amount)), scenarios[0]!),
  };
}

function breakEven(a: FinancialAssumptions, fixed: number): BreakEven {
  const priced = a.revenueStreams.filter((s) => s.price > 0);
  const unitNames = new Set(priced.map((s) => s.unit));
  const unit = unitNames.size === 1 ? [...unitNames][0]! : "units";
  if (priced.length === 0) return { unitsPerMonth: null, monthlyRevenue: null, contributionPerUnit: null, unit };

  // Weight streams by the base-case mix; with no base volumes, weight them equally.
  const totalBase = priced.reduce((n, s) => n + s.monthlyUnits.base, 0);
  const weight = (s: (typeof priced)[number]) => (totalBase > 0 ? s.monthlyUnits.base / totalBase : 1 / priced.length);
  const contribution = priced.reduce((n, s) => n + weight(s) * (s.price - s.variableCost), 0);
  const avgPrice = priced.reduce((n, s) => n + weight(s) * s.price, 0);
  if (contribution <= 0) return { unitsPerMonth: null, monthlyRevenue: null, contributionPerUnit: round(contribution), unit };

  const unitsPerMonth = Math.ceil(fixed / contribution);
  return { unitsPerMonth, monthlyRevenue: round(unitsPerMonth * avgPrice), contributionPerUnit: round(contribution), unit };
}

/** `budget` null means the owner gave none; 0 is an explicit "no money to invest". */
function budgetCheck(budget: number | null, startup: number, essential: number, conservative: ScenarioResult): BudgetCheck {
  if (budget === null) {
    return { status: "unknown", budget: null, startupCosts: startup, remainingAfterStartup: null, runwayMonths: null, shortfall: null, essentialStartupCosts: essential };
  }
  const remaining = round(budget - startup);
  const loss = conservative.monthlyOperatingProfit < 0 ? -conservative.monthlyOperatingProfit : 0;
  return {
    status: startup > budget ? "over" : "within",
    budget,
    startupCosts: startup,
    remainingAfterStartup: remaining,
    runwayMonths: loss > 0 && remaining > 0 ? round(remaining / loss) : null,
    shortfall: remaining < 0 ? -remaining : 0,
    essentialStartupCosts: essential,
  };
}

/** Scenario volumes must not decrease from conservative to optimistic; swaps them into order if they do. */
export function normalizeAssumptions(a: FinancialAssumptions): FinancialAssumptions {
  return {
    ...a,
    revenueStreams: a.revenueStreams.map((s) => {
      const [conservative, base, optimistic] = [s.monthlyUnits.conservative, s.monthlyUnits.base, s.monthlyUnits.optimistic].sort((x, y) => x - y) as [number, number, number];
      return { ...s, monthlyUnits: { conservative, base, optimistic } };
    }),
  };
}
