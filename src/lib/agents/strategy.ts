import { z } from "zod";
import type { BusinessStrategy, ExecutiveStrategy, FinancialPlan, PricingStrategy } from "@/lib/types";
import { generateJson } from "@/lib/ai/client";
import { withBrief, withLlmTelemetry, withResearch, type AgentOutput, type GenerationContext } from "@/lib/agents/context";
import {
  coerceAssumptions,
  computeFinancials,
  financialAssumptionsLlmSchema,
  financialAssumptionsSchema,
  normalizeAssumptions,
  type FinancialResults,
} from "@/lib/finance/model";
import type { BusinessModelKind, BusinessProfile } from "@/lib/engine/profile";
import { languageInstruction, outputLanguageName } from "@/lib/agents/language";
import { assessStrategyActionability } from "@/lib/strategy/actionability";
import { CUSTOM_QUOTE, UNPRICED } from "@/lib/pricing/strategy";

const isPriced = (price: string) => /\d/.test(price) && price !== UNPRICED && price !== CUSTOM_QUOTE;

/**
 * Strategy Agent — executive strategy, 30/60/90-day priorities and a financial
 * model for this specific business. The language model writes the strategy and
 * proposes assumption values; every financial figure is then computed by the
 * deterministic finance engine. Without a model, the strategy is assembled
 * only from the owner's answers and the financial model is marked insufficient
 * rather than filled with generic numbers.
 */

const text = (max: number) => z.string().trim().max(max).catch("");
const list = (max: number, item = 300) => z.array(z.string().trim().min(1).max(item)).max(max).catch([]);

export const executiveLlmSchema = z.object({
  summary: z.string().trim().min(20).max(1200),
  problem: text(600),
  solution: text(600),
  valueProposition: text(400),
  businessModel: text(600),
  revenueStreams: list(6),
  segments: z.array(z.object({ name: z.string().trim().min(1).max(120), need: text(300) })).max(5).catch([]),
  differentiation: list(6),
  entryStrategy: text(800),
  assumptions: list(10),
  risks: z.array(z.object({ risk: z.string().trim().min(1).max(300), mitigation: text(300) })).max(8).catch([]),
  missingInformation: list(8),
  priorities: z
    .array(
      z.object({
        window: z.enum(["0-30", "31-60", "61-90"]),
        action: z.string().trim().min(3).max(200),
        priority: z.enum(["high", "medium", "low"]).catch("medium"),
        outcome: text(300),
        dependsOn: text(200),
        resources: text(200),
        metric: text(200),
        assumption: text(300),
      }),
    )
    .min(3)
    .max(12),
});

const MODEL_DESCRIPTIONS: Record<BusinessModelKind, string> = {
  product: "Sells physical products; margins depend on product cost, packaging, delivery and returns.",
  saas: "Software sold as recurring subscriptions; economics depend on acquisition cost, churn and hosting.",
  localService: "Delivers services in person in a local area; revenue is limited by staff or owner capacity and travel.",
  professionalService: "Sells expertise through projects, retainers or hourly work; revenue is limited by billable time.",
  foodVenue: "Prepares and sells food and drink; economics depend on food cost, staff, rent and seat or order capacity.",
  marketplace: "Connects two sides of a market and earns fees or commission; needs supply and demand at the same time.",
  education: "Sells learning through courses, classes or coaching; economics depend on enrolment and delivery cost.",
  general: "Business model not yet clear from the description; it should be defined before investing heavily.",
};

const REVENUE_LABELS: Record<string, string> = {
  oneTime: "One-time sales",
  recurring: "Repeat purchases",
  subscription: "Subscriptions",
  commission: "Commission",
  custom: "Custom / project pricing",
};

function languageOf(ctx: GenerationContext): string {
  return outputLanguageName(ctx);
}

const PRICE_CURRENCIES: readonly [string, RegExp][] = [
  ["EUR", /€|\bEUR\b/i],
  ["USD", /\$|\bUSD\b/i],
  ["GBP", /£|\bGBP\b/i],
  ["ALL", /\bALL\b|\blek/i],
];

/** Currencies the recommended tier prices are written in, other than the plan's own. */
export function foreignPriceCurrencies(pricing: PricingStrategy | undefined, currency: string): string[] {
  const found = new Set<string>();
  for (const tier of pricing?.tiers ?? []) {
    const code = PRICE_CURRENCIES.find(([, pattern]) => pattern.test(tier.price))?.[0];
    if (code && code !== currency) found.add(code);
  }
  return [...found];
}

/** Recommended tier prices the financial model must stay consistent with. */
function pricingSummary(pricing: PricingStrategy | undefined, currency: string): string {
  if (!pricing) return "No pricing recommendation yet.";
  const priced = pricing.tiers.filter((t) => isPriced(t.price));
  if (priced.length === 0) return "Recommended prices are not set yet; propose prices and mark them as estimates in notes.";
  const list = priced.map((t) => `${t.name} ${t.price}${t.cadence ? ` ${t.cadence}` : ""}`).join("; ");
  const foreign = foreignPriceCurrencies(pricing, currency);
  if (foreign.length) {
    return `Reference prices from competitors in another currency (${foreign.join(", ")}): ${list}. Do not copy these numbers into ${currency}; propose prices that fit ${currency} and the local market, and say so in notes.`;
  }
  return `Recommended prices (use these exactly where a stream matches): ${list}.`;
}

function currencyOf(profile: BusinessProfile, location: string): string {
  return profile.budget?.currency ?? (/albania|tiran/i.test(location) ? "ALL" : "EUR");
}

function templateExecutive(ctx: GenerationContext): ExecutiveStrategy {
  const { input, profile } = ctx;
  const d = input.discovery;
  const name = d?.business.name.trim() || "The business";
  const offer = d?.business.offering.trim() || d?.offer.main.trim() || input.idea;
  return {
    summary: `${name} plans to offer ${offer.replace(/\.$/, "")} to ${input.audience.trim().replace(/\.$/, "")} in ${input.location}.`,
    problem: d?.customer.problem.trim() ?? "",
    solution: d?.offer.main.trim() || input.idea,
    valueProposition: d?.offer.differentiator.trim() || d?.market.difference.trim() || "",
    businessModel: MODEL_DESCRIPTIONS[profile.modelKind],
    revenueStreams: (d?.model.revenue ?? []).map((r) => REVENUE_LABELS[r] ?? r),
    segments: [{ name: input.audience.trim(), need: d?.customer.need.trim() ?? "" }],
    differentiation: [d?.offer.differentiator.trim(), d?.market.positioning.trim()].filter((x): x is string => Boolean(x)),
    entryStrategy: "",
    assumptions: [],
    risks: [],
    missingInformation: profile.missing,
    priorities: [],
  };
}

async function writeExecutive(
  ctx: GenerationContext,
): Promise<{
  data: ExecutiveStrategy | null;
  note?: string;
  selection?: { modelId?: string };
  costEstimate?: { usd: number; estimated: true } | null;
}> {
  const { input, profile } = ctx;
  const budget = profile.budget ? `${profile.budget.amount} ${profile.budget.currency}` : "not provided";
  const res = await generateJson({
    system: [
      "You are a senior startup strategist writing a practical plan for one specific business.",
      "Prioritize decisions and next actions over long descriptions. Reject generic filler like 'increase brand awareness' without a mechanism.",
      "Ground every statement in the owner's answers, the canonical profile and any research provided.",
      "Never invent statistics, market sizes, customer numbers, competitor names, prices, reviews or specific laws. If something must be checked, say so as an assumption or risk.",
      "Fit the plan to the stated budget, stage and model: a small local service and a venture-backed platform need different plans.",
      languageInstruction(ctx),
    ].join(" "),
    user: withResearch(
      ctx,
      "strategy",
      withBrief(
        ctx,
        `Return JSON with keys: summary (2 short sentences: objective + main commercial bet), problem, solution, valueProposition (1 sentence), businessModel (how it makes money and what limits revenue), revenueStreams (strings), segments [{name, need}], differentiation (strings), entryStrategy (concrete first-customer actions, not slogans), assumptions (what must be validated), risks [{risk, mitigation}], missingInformation (what the owner has not told us that matters), priorities (6-9 items across windows "0-30", "31-60", "61-90", each {window, action (specific verb + object for THIS business), priority: high|medium|low, outcome, dependsOn, resources (time or money, estimated — never invent a budget number the owner did not give), metric (how success is measured), assumption}).
Business idea: ${input.idea}
Market: ${input.location}
Customers: ${input.audience}
Budget: ${budget}
Business model type: ${profile.modelKind} — ${MODEL_DESCRIPTIONS[profile.modelKind]}
Areas that may be regulated here (mention as things to verify, not as specific legal requirements): ${profile.considerations.join(", ") || "none detected"}
${pricingSummary(ctx.pricing, currencyOf(profile, input.location))}
Language: ${languageOf(ctx)}.`,
      ),
    ),
    task: "reasoning",
    temperature: 0.5,
    // Visible JSON budget; client adds reasoning headroom for Astra high effort.
    maxTokens: 4500,
    // Astra high-effort strategy JSON often needs >2 minutes on busy accounts.
    timeoutMs: 180_000,
    schema: executiveLlmSchema,
  });
  // Defense in depth for mocks / edge payloads that skip client-side schema.
  const parsed = executiveLlmSchema.safeParse(res.data);
  const telemetry = { selection: res.selection, costEstimate: res.costEstimate ?? null };
  if (!res.data || !parsed.success) return { data: null, note: res.note ?? "llm-invalid-output", ...telemetry };
  return { data: parsed.data, ...telemetry };
}

/** Notes a model may write about its own plan that would contradict a computed over-budget result. */
const CLAIMS_FITS_BUDGET = /\b(?:within|fits?|under|inside|below)\b[^.]{0,40}\bbudget\b|(?:brenda|nën|përshtat\p{L}*)[^.]{0,40}buxhet/iu;

const startupOverrun = (r: FinancialResults) => Math.max(0, r.totalStartupCosts - (r.budget.budget ?? Infinity));

async function estimateFinancials(ctx: GenerationContext): Promise<FinancialPlan> {
  const { input, profile } = ctx;
  const currency = currencyOf(profile, input.location);
  const insufficient = (limitations: string[]): FinancialPlan => ({
    status: "insufficient",
    basis: "none",
    currency,
    assumptions: null,
    results: null,
    limitations,
  });
  if (!ctx.useLlm) return insufficient(["noLlm"]);

  const budgetRule = !profile.budget
    ? "The owner has not given a budget: keep startup costs to the minimum needed to test the idea."
    : profile.budget.amount === 0
      ? "The owner has no money to invest (budget 0). Propose only zero-cost startup steps where possible (owner's own time, free tools, pre-orders). If something truly cannot be done for free, list it with its real cost and essential: true rather than pretending it is free."
      : `One-off startup costs must total no more than ${profile.budget.amount} ${currency} and should leave at least 10% as a cash reserve. If the idea cannot launch on this budget, scale the first version down (smaller stock, fewer services, owner doing the work) and explain it in notes. Never lower a cost below what it realistically costs just to fit the budget.`;
  const request = `Return JSON: startupCosts [{item, amount, essential (false if the launch could go ahead without it)}] (one-off), monthlyFixedCosts [{item, amount}] (rent, software, insurance, salaries, marketing retainer…), revenueStreams [{name, unit (what one sale is), price, variableCost (direct cost per unit: product cost, materials, payment and delivery fees, contractor time), monthlyUnits {conservative, base, optimistic} for a typical month in the first year}], notes (why these values; which are most uncertain).
All amounts are plain numbers in ${currency}.
Business idea: ${input.idea}
Business model type: ${profile.modelKind} — ${MODEL_DESCRIPTIONS[profile.modelKind]}
Market: ${input.location}
Stage: ${input.discovery?.business.stage ?? "not provided"}
${budgetRule}
${pricingSummary(ctx.pricing, currency)}`;
  let lastFailure: "providerUnavailable" | "invalidOutput" = "invalidOutput";
  const ask = async (correction?: string) => {
    const res = await generateJson({
      system:
        "You are a financial planner for small businesses and startups. Propose realistic planning assumptions for one specific business. Do not calculate totals, margins or break-even: only provide the input values. All values are estimates the owner must validate.",
      user: withBrief(ctx, correction ? `${request}\n\n${correction}` : request),
      // Assumptions are constrained JSON inputs for deterministic computeFinancials —
      // use the structured route (Luna), not Astra. Totals are never trusted from the LLM.
      task: "structured",
      temperature: 0.3,
      maxTokens: 2400,
      timeoutMs: 90_000,
      schema: financialAssumptionsLlmSchema,
    });
    // Defense in depth: client may already have validated; mocks still need coerce + parse.
    const parsed = financialAssumptionsSchema.safeParse(coerceAssumptions(res.data));
    if (res.data && parsed.success && parsed.data.revenueStreams.length > 0) {
      const assumptions = normalizeAssumptions(parsed.data);
      return { assumptions, results: computeFinancials(assumptions, profile.budget?.amount ?? null) };
    }
    const issues = parsed.success ? ["no-revenue-streams"] : parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}:${i.code}`);
    console.warn(`[strategy] financial assumptions rejected: ${res.data ? issues.join(" ") : (res.note ?? "no-output")}`);
    lastFailure = res.note?.startsWith("llm-unavailable") ? "providerUnavailable" : "invalidOutput";
    return null;
  };

  let plan = await ask();
  if (!plan) return insufficient([lastFailure]);
  // One correction at most: a second over-budget answer is reported with its shortfall instead of retried.
  if (plan.results.budget.status === "over" && profile.budget) {
    const corrected = await ask(
      `Your previous startup costs added up to ${plan.results.totalStartupCosts} ${currency}, which is more than the ${profile.budget.amount} ${currency} budget. Return the full JSON again for a smaller first version whose startup costs fit the budget: drop or defer optional items and reduce scope. Keep each remaining cost realistic; if the launch truly cannot fit, keep the real costs and say so in notes.`,
    );
    if (corrected && startupOverrun(corrected.results) < startupOverrun(plan.results)) plan = corrected;
  }

  const { results } = plan;
  const assumptions = results.budget.status === "over" ? { ...plan.assumptions, notes: plan.assumptions.notes.filter((n) => !CLAIMS_FITS_BUDGET.test(n)) } : plan.assumptions;
  const limitations = ["aiEstimate"];
  if (ctx.pricing?.grounding?.evidence !== "observed") limitations.push("pricesUnverified");
  if (foreignPriceCurrencies(ctx.pricing, currency).length) limitations.push("foreignPriceEvidence");
  if (!profile.budget) limitations.push("noBudget");
  if (results.budget.status === "over") limitations.push("overBudget");
  return { status: "estimated", basis: "ai-estimate", currency, assumptions, results, limitations };
}

export async function runStrategyAgent(ctx: GenerationContext): Promise<AgentOutput<BusinessStrategy>> {
  const template = templateExecutive(ctx);
  if (!ctx.useLlm) {
    const financials = await estimateFinancials(ctx);
    return { data: { source: "template", profile: ctx.profile, executive: template, financials }, source: "deterministic" };
  }

  const [executive, financials] = await Promise.all([writeExecutive(ctx), estimateFinancials(ctx)]);
  const chosen = executive.data ?? template;
  const weak = executive.data ? assessStrategyActionability(executive.data) : [];
  // Keep LLM text when present, but surface non-actionable output honestly.
  const data: BusinessStrategy = {
    source: executive.data ? "llm" : "template",
    profile: ctx.profile,
    executive: chosen,
    financials,
  };
  const notes = [
    executive.data ? null : executive.note,
    weak.length ? `strategy-weak:${weak.join("+")}` : null,
    financials.status === "insufficient" ? "financials-unavailable" : null,
  ].filter(Boolean);
  return withLlmTelemetry(
    {
      data,
      source: executive.data ? "llm" : "deterministic",
      note: notes.length ? notes.join(", ") : undefined,
    },
    executive,
  );
}
