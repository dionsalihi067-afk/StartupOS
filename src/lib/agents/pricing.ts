import type { PricingStrategy, PricingTier, ProfitEstimation, SubscriptionOption } from "@/lib/types";
import { nonEmpty, ensureArray, pickN, formatCurrencyHint } from "@/lib/utils";
import { generateJson } from "@/lib/ai/client";
import { pricingLlmSchema } from "@/lib/schemas";
import type { AgentOutput, GenerationContext } from "@/lib/agents/context";

function deriveAnchor(budget: string): number {
  const num = Number(budget.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(num) || num <= 0) return 49;
  // Heuristic: scale a tier price from the stated budget order of magnitude.
  if (num >= 100000) return 499;
  if (num >= 20000) return 199;
  if (num >= 5000) return 99;
  if (num >= 1000) return 49;
  return 29;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function priceNumber(price: string): number {
  const n = Number(price.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Cost-of-delivery ratio by industry — used only for a labelled projection. */
function costRatioFor(key: string): number {
  switch (key) {
    case "food":
    case "ecommerce":
    case "hospitality":
      return 0.62; // physical goods / COGS heavy
    case "home":
    case "health":
    case "beauty":
      return 0.5; // labor + materials
    case "tech":
    case "education":
      return 0.3; // digital, high margin
    default:
      return 0.45;
  }
}

/**
 * Builds a transparent profit *projection* from the anchor price and budget.
 * Every figure is derived from the stated assumptions — never a market claim.
 */
function buildProfitEstimation(ctx: GenerationContext, anchor: number): ProfitEstimation {
  const { industry, input } = ctx;
  const budgetNum = Number(input.budget.replace(/[^0-9.]/g, ""));
  // Conservative monthly customer assumption scaled to budget magnitude.
  const monthlyCustomers =
    !Number.isFinite(budgetNum) || budgetNum <= 0
      ? 40
      : budgetNum >= 100000
        ? 200
        : budgetNum >= 20000
          ? 120
          : budgetNum >= 5000
            ? 70
            : 40;
  const avg = anchor;
  const revenue = monthlyCustomers * avg;
  const costRatio = costRatioFor(industry.key);
  const costs = revenue * costRatio;
  const profit = revenue - costs;
  const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;

  return {
    assumptions: [
      `Illustrative projection — not a guarantee or market statistic.`,
      `~${monthlyCustomers} paying customers/month (scaled to a ${formatCurrencyHint(input.budget)} budget).`,
      `Average revenue per customer ≈ ${money(avg)} (anchored to the Growth tier).`,
      `Cost of delivery ≈ ${Math.round(costRatio * 100)}% of revenue (typical for ${industry.label.toLowerCase()}).`,
    ],
    monthlyCustomers,
    avgRevenuePerCustomer: money(avg),
    estimatedMonthlyRevenue: money(revenue),
    estimatedMonthlyCosts: money(costs),
    estimatedMonthlyProfit: money(profit),
    margin: `${margin}%`,
  };
}

function buildSubscriptionOptions(anchor: number, recurring: boolean): SubscriptionOption[] {
  if (recurring) {
    const annual = anchor * 10; // 2 months free
    return [
      { name: "Monthly", price: money(anchor), cadence: "/mo", note: "Flexible — cancel anytime" },
      { name: "Annual", price: money(annual), cadence: "/yr", note: "Save ~17% (2 months free)" },
      { name: "Team / Family", price: money(anchor * 2.5), cadence: "/mo", note: "Up to 5 seats included" },
    ];
  }
  return [
    { name: "Membership", price: money(Math.round(anchor * 0.6)), cadence: "/mo", note: "Member pricing + perks on every visit" },
    { name: "Prepaid pack", price: money(anchor * 5), cadence: " / 6 visits", note: "Save vs. paying per visit" },
    { name: "Pay as you go", price: money(anchor), cadence: " / visit", note: "No commitment" },
  ];
}

function buildDeterministic(ctx: GenerationContext): PricingStrategy {
  const { input, industry, rng } = ctx;
  const anchor = deriveAnchor(input.budget);
  const cadence = industry.key === "tech" || industry.key === "education" ? "/mo" : "";
  const fmt = (n: number) => `$${n}`;

  const tiers: PricingTier[] = [
    {
      name: "Starter",
      price: fmt(Math.round(anchor * 0.5)),
      cadence,
      tagline: "Everything you need to begin.",
      features: ["Core offering", "Email support", "Up to standard usage", "Self-serve onboarding"],
      highlighted: false,
      cta: "Get started",
    },
    {
      name: "Growth",
      price: fmt(anchor),
      cadence,
      tagline: "Our most popular option.",
      features: ["Everything in Starter", "Priority support", "Advanced features", "Dedicated onboarding", "Performance insights"],
      highlighted: true,
      cta: "Start growing",
    },
    {
      name: "Premium",
      price: fmt(Math.round(anchor * 2.2)),
      cadence,
      tagline: "For those who want the very best.",
      features: ["Everything in Growth", "White-glove service", "Custom solutions", "Dedicated account manager", "Quarterly strategy reviews"],
      highlighted: false,
      cta: "Talk to us",
    },
  ];

  const recurring = industry.key === "tech" || industry.key === "education";

  return {
    model: recurring ? "Tiered subscription (good-better-best)" : "Tiered packages (good-better-best)",
    revenueModel: recurring
      ? `Recurring subscription revenue (MRR) across three tiers, expanded with seat/usage upgrades and add-ons.`
      : `Per-service / package revenue with recurring memberships and prepaid packs to smooth cash flow, plus à la carte upsells.`,
    rationale: `Anchored around a ${formatCurrencyHint(input.budget)} budget and ${input.audience.toLowerCase()} expectations, a three-tier structure maximizes perceived value, nudges buyers toward the highlighted Growth tier, and leaves room to upsell Premium.`,
    tiers,
    psychology: pickN(rng, [
      "Center tier visually highlighted to anchor the decision",
      "Charm pricing ($X9) to keep perceived cost low",
      "Clear value laddering so upgrades feel obvious",
      "A premium tier that makes the middle look reasonable",
      "Annual option framed as '2 months free'",
    ], 4),
    upsells: pickN(rng, [
      "Add-on services billed à la carte",
      "Loyalty / membership program",
      "Bundles that raise average order value",
      "Referral credits to drive word-of-mouth",
      "Seasonal premium offerings",
    ], 3),
    subscriptionOptions: buildSubscriptionOptions(anchor, recurring),
    profitEstimation: buildProfitEstimation(ctx, anchor),
  };
}

export async function runPricingAgent(ctx: GenerationContext): Promise<AgentOutput<PricingStrategy>> {
  const base = buildDeterministic(ctx);
  if (!ctx.useLlm) return { data: base, source: "deterministic" };

  const { input, industry } = ctx;
  const res = await generateJson<unknown>({
    system: "You are a pricing strategist. Design a clear, conversion-optimized pricing strategy specific to this business.",
    user: `Return JSON: model, revenueModel (1-2 sentences on how the business makes money), rationale (2 sentences), tiers (3: name, price [include currency symbol], cadence, tagline, features[4-5], highlighted [boolean, exactly one true], cta), psychology[4], upsells[3], subscriptionOptions[2-3 of {name, price [with currency], cadence, note}].
Business: ${input.idea}
Industry: ${industry.label}
Audience: ${input.audience}
Budget context: ${input.budget}
Style: ${input.style}`,
    temperature: 0.6,
    maxTokens: 1400,
  });

  const parsed = pricingLlmSchema.safeParse(res.data);
  if (!res.data || !parsed.success) return { data: base, source: "deterministic", note: res.note };
  const d = parsed.data;

  const tiers: PricingTier[] = ensureArray(d.tiers, []).map((t, i) => ({
    name: nonEmpty(t.name, base.tiers[i]?.name ?? `Tier ${i + 1}`),
    price: nonEmpty(t.price, base.tiers[i]?.price ?? "$—"),
    cadence: nonEmpty(t.cadence, base.tiers[i]?.cadence ?? ""),
    tagline: nonEmpty(t.tagline, base.tiers[i]?.tagline ?? ""),
    features: ensureArray(t.features, base.tiers[i]?.features ?? ["Core features"]),
    highlighted: typeof t.highlighted === "boolean" ? t.highlighted : i === 1,
    cta: nonEmpty(t.cta, base.tiers[i]?.cta ?? "Get started"),
  }));

  const finalTiers = tiers.length >= 2 ? tiers : base.tiers;
  if (!finalTiers.some((t) => t.highlighted) && finalTiers[1]) finalTiers[1].highlighted = true;

  const subscriptionOptions: SubscriptionOption[] = ensureArray(
    d.subscriptionOptions
      ?.map((s) => ({ name: nonEmpty(s.name, ""), price: nonEmpty(s.price, ""), cadence: nonEmpty(s.cadence, ""), note: nonEmpty(s.note, "") }))
      .filter((s) => s.name && s.price),
    base.subscriptionOptions,
  );

  // Profit estimation is recomputed from the (possibly LLM-set) highlighted tier price
  // so the projection always reflects the actual displayed pricing — never invented.
  const highlighted = finalTiers.find((t) => t.highlighted) ?? finalTiers[1] ?? finalTiers[0];
  const anchorPrice = highlighted ? priceNumber(highlighted.price) || deriveAnchor(input.budget) : deriveAnchor(input.budget);
  const profitEstimation = buildProfitEstimation(ctx, anchorPrice);

  return {
    data: {
      model: nonEmpty(d.model, base.model),
      revenueModel: nonEmpty(d.revenueModel, base.revenueModel),
      rationale: nonEmpty(d.rationale, base.rationale),
      tiers: finalTiers,
      psychology: ensureArray(d.psychology, base.psychology),
      upsells: ensureArray(d.upsells, base.upsells),
      subscriptionOptions,
      profitEstimation,
    },
    source: "llm",
  };
}
