import type { REVENUE_MODELS } from "@/lib/discovery";
import type { IndustryProfile } from "@/lib/engine/industry";
import { parseBudget } from "@/lib/engine/profile";
import { PRICING_LIMITS } from "@/lib/pricing/limits";
import type { CurrencyCode, PricingEvidence } from "@/lib/pricing/model";
import { formatPrice, parseOwnerPriceRange, type OwnerPriceRange } from "@/lib/pricing/normalize";
import { derivePricingSignals, type PriceGroup, type PricingSignals } from "@/lib/pricing/signals";
import type { ConfidenceLevel } from "@/lib/research/model";
import type { BusinessInput } from "@/lib/types";

/**
 * Pricing strategy: business-specific decisions layered on top of the
 * evidence and signals. Everything here is a recommendation. Prices are
 * anchored only on the owner's own expected price or on comparable observed
 * competitor prices — never on the budget — and are left unpriced when
 * neither exists.
 */

export type RevenueModel = (typeof REVENUE_MODELS)[number];

/**
 * When several revenue models are stated, the tier structure follows the first of these; the rest become add-ons.
 * "recurring" means repeat purchases, which are priced from the one-off price, so one-time sales come first.
 */
const REVENUE_PRIORITY: readonly RevenueModel[] = ["subscription", "oneTime", "recurring", "commission", "custom"];

/** Legacy inputs (no discovery) keep the previous behavior: subscriptions for these industries, packages otherwise. */
const LEGACY_SUBSCRIPTION_INDUSTRIES: ReadonlySet<string> = new Set(["tech", "education"]);

export function primaryRevenue(stated: readonly RevenueModel[] | undefined, industry: IndustryProfile): PricingEngineResult["revenue"] {
  const primary = REVENUE_PRIORITY.find((m) => stated?.includes(m));
  if (!primary) return { primary: LEGACY_SUBSCRIPTION_INDUSTRIES.has(industry.key) ? "subscription" : "oneTime", secondary: [], stated: false };
  return { primary, secondary: REVENUE_PRIORITY.filter((m) => m !== primary && stated!.includes(m)), stated: true };
}

export const POSITIONING_TIERS = ["budget", "accessible", "midMarket", "premium"] as const;
export type PositioningTier = (typeof POSITIONING_TIERS)[number];

export interface Positioning {
  tier: PositioningTier | null;
  /** Which owner answer the positioning was read from. */
  basis: "ownerPositioning" | "ownerDifferentiator" | null;
  /** The owner's answer named conflicting positions (e.g. premium and cheap). */
  conflicting: boolean;
}

export type TierRole = "free" | "entry" | "core" | "premium";

export interface RecommendedTier {
  role: TierRole;
  name: string;
  /** null when the tier is left unpriced. */
  value: number | null;
  price: string;
  cadence: string;
  highlighted: boolean;
}

export type PriceAnchor =
  | { basis: "ownerRange"; range: OwnerPriceRange }
  | { basis: "competitorEvidence"; group: PriceGroup; reference: number; method: "low" | "high" | "median" | "midpoint" | "single" }
  | { basis: "none"; reason: "noEvidence" | "incompatible" | "otherCurrency" | "commission" };

export interface PricingCurrency {
  currency: CurrencyCode | null;
  currencySymbol: string | null;
  basis: "ownerRange" | "competitorEvidence" | null;
}

export interface PricingEngineResult {
  evidence: PricingEvidence;
  signals: PricingSignals;
  revenue: { primary: RevenueModel; secondary: RevenueModel[]; stated: boolean };
  /** Software pricing-model answers (freemium, trial, perSeat, usage, flat). */
  pricingModelDetails: string[];
  offer: string;
  model: string;
  positioning: Positioning;
  currency: PricingCurrency;
  anchor: PriceAnchor;
  tiers: RecommendedTier[];
  confidence: ConfidenceLevel;
  rationale: string;
  /** What the prices rest on; always part of the stored rationale. */
  basisNote: string;
  limitations: string[];
}

export const UNPRICED = "To be validated";
export const CUSTOM_QUOTE = "Custom quote";

/** Good-better-best spacing around the core tier. A strategy heuristic, not market evidence. */
const TIER_LADDER = { entry: 0.6, core: 1, premium: 1.8 } as const;

/** How the core price sits relative to the competitor reference price for each positioning. A strategy heuristic. */
const POSITION_ADJUSTMENT: Record<PositioningTier, number> = { budget: 0.85, accessible: 0.95, midMarket: 1, premium: 1.25 };

interface StructureSpec {
  model: string;
  /** Billing basis of comparable competitor prices: monthly plans, one-off prices, or none (commission). */
  comparable: "monthly" | "oneOff" | "none";
  names: (services: boolean) => Record<TierRole, string>;
}

const STRUCTURES: Record<RevenueModel, StructureSpec> = {
  subscription: {
    model: "Tiered subscription (good-better-best)",
    comparable: "monthly",
    names: () => ({ free: "Free", entry: "Starter", core: "Growth", premium: "Pro" }),
  },
  recurring: {
    model: "Recurring plans (good-better-best)",
    comparable: "monthly",
    names: () => ({ free: "Free", entry: "Essential", core: "Standard", premium: "Premium" }),
  },
  oneTime: {
    model: "Tiered packages (good-better-best)",
    comparable: "oneOff",
    names: (services) => ({ free: "Free", entry: services ? "Basic" : "Entry", core: "Standard", premium: "Premium" }),
  },
  commission: {
    model: "Commission-based pricing",
    comparable: "none",
    names: () => ({ free: "Free", entry: "Basic", core: "Standard", premium: "Featured" }),
  },
  custom: {
    model: "Custom quotes with reference packages",
    comparable: "oneOff",
    names: () => ({ free: "Free", entry: "Basic", core: "Standard", premium: "Premium" }),
  },
};

const POSITIONING_TERMS: readonly [PositioningTier, RegExp][] = [
  ["premium", /\b(?:premium|luxury|luxurious|high[- ]end|exclusive|upscale|luksoz\w*|ekskluziv\w*)\b/i],
  ["budget", /\b(?:cheap(?:est)?|lowest prices?|low[- ]cost|discount\w*|budget)\b|\bi lir[ëe]\b|m[ëe] i liri/i],
  ["accessible", /\b(?:affordable|accessible|value for money|fair prices?)\b|p[ëe]rballuesh\w*|çmime t[ëe] arsyeshme/i],
  ["midMarket", /\b(?:mid[- ]?range|mid[- ]?market|mesatar\w*)\b/i],
];

export function buildPricingStrategy(input: BusinessInput, industry: IndustryProfile, evidence: PricingEvidence): PricingEngineResult {
  const d = input.discovery;
  const signals = derivePricingSignals(evidence);
  const revenue = primaryRevenue(d?.model.revenue, industry);
  const details = d?.offer.details.pricingModel;
  const pricingModelDetails = Array.isArray(details) ? details : [];
  const services = d ? d.business.category === "services" : industry.key === "services";
  const ownerRange = d && !d.offer.priceUnknown ? parseOwnerPriceRange(d.offer.priceRange) : null;
  const positioning = readPositioning(d?.market.positioning, d?.offer.differentiator);
  const spec = STRUCTURES[revenue.primary];
  const budget = parseBudget(d?.model.budget);
  const ownerCurrency = budget?.currencyBasis === "provided" ? budget.currency : null;

  const anchor = chooseAnchor(revenue.primary, spec, ownerRange, signals, positioning, ownerCurrency);
  const currency = resolveCurrency(anchor);
  const roles = tierRoles(revenue.primary, pricingModelDetails);
  const tiers = priceTiers(roles, spec.names(services), anchor, currency, positioning, cadenceFor(revenue.primary, anchor, pricingModelDetails), revenue.primary);
  const basisNote = `${anchorSentence(anchor)} Recommended prices are strategy to validate with customers, not observed market prices.`;

  return {
    evidence,
    signals,
    revenue,
    pricingModelDetails,
    offer: d?.offer.main || d?.business.offering || input.idea,
    model: spec.model,
    positioning,
    currency,
    anchor,
    tiers,
    confidence: anchor.basis === "competitorEvidence" && anchor.group.competitorIds.length >= PRICING_LIMITS.minCompetitorsForMedian ? "medium" : "low",
    rationale: `${fitSentence(spec, revenue, positioning)} ${basisNote}`,
    basisNote,
    limitations: limitations(evidence, signals, anchor, positioning, currency, revenue.primary),
  };
}

export function readPositioning(positioning: string | undefined, differentiator: string | undefined): Positioning {
  for (const [basis, text] of [["ownerPositioning", positioning], ["ownerDifferentiator", differentiator]] as const) {
    if (!text?.trim()) continue;
    const tiers = POSITIONING_TERMS.filter(([, re]) => re.test(text)).map(([tier]) => tier);
    if (tiers.length === 1) return { tier: tiers[0]!, basis, conflicting: false };
    if (tiers.length > 1) return { tier: null, basis, conflicting: true };
  }
  return { tier: null, basis: null, conflicting: false };
}

function chooseAnchor(
  primary: RevenueModel,
  spec: StructureSpec,
  ownerRange: OwnerPriceRange | null,
  signals: PricingSignals,
  positioning: Positioning,
  ownerCurrency: string | null,
): PriceAnchor {
  if (primary === "commission") return ownerRange?.percent ? { basis: "ownerRange", range: ownerRange } : { basis: "none", reason: "commission" };
  if (ownerRange && !ownerRange.percent) return { basis: "ownerRange", range: ownerRange };

  const sameBilling = signals.groups.filter((g) =>
    spec.comparable === "monthly" ? g.cadence === "month" : g.billing === "oneTime" || g.billing === "unspecified",
  );
  // Prices in another currency than the owner works in come from another market and are never converted.
  const comparable = sameBilling.filter((g) => !ownerCurrency || !g.currency || g.currency === ownerCurrency);
  const group = comparable[0];
  if (!group) {
    if (sameBilling.length > 0) return { basis: "none", reason: "otherCurrency" };
    return { basis: "none", reason: signals.groups.length > 0 ? "incompatible" : "noEvidence" };
  }

  const tier = positioning.tier ?? "midMarket";
  const lowEnd = tier === "budget" || tier === "accessible";
  if (group.medianEntry !== undefined && group.range) {
    if (lowEnd) return { basis: "competitorEvidence", group, reference: group.range.low.value, method: "low" };
    if (tier === "premium") return { basis: "competitorEvidence", group, reference: group.range.high.value, method: "high" };
    return { basis: "competitorEvidence", group, reference: group.medianEntry, method: "median" };
  }
  if (group.range) {
    if (lowEnd) return { basis: "competitorEvidence", group, reference: group.range.low.value, method: "low" };
    if (tier === "premium") return { basis: "competitorEvidence", group, reference: group.range.high.value, method: "high" };
    return { basis: "competitorEvidence", group, reference: (group.range.low.value + group.range.high.value) / 2, method: "midpoint" };
  }
  return { basis: "competitorEvidence", group, reference: group.entryPrices[0]!.value, method: "single" };
}

/** Currency comes from the owner's own price answer, else from the competitor prices the tiers are anchored on. Never from location. */
function resolveCurrency(anchor: PriceAnchor): PricingCurrency {
  if (anchor.basis === "ownerRange" && (anchor.range.currency || anchor.range.currencySymbol)) {
    return { currency: anchor.range.currency, currencySymbol: anchor.range.currencySymbol, basis: "ownerRange" };
  }
  if (anchor.basis === "competitorEvidence") {
    return { currency: anchor.group.currency, currencySymbol: anchor.group.currencySymbol, basis: "competitorEvidence" };
  }
  return { currency: null, currencySymbol: null, basis: null };
}

function tierRoles(primary: RevenueModel, details: string[]): TierRole[] {
  if (primary === "commission") return ["core", "premium"];
  const recurring = primary === "subscription" || primary === "recurring";
  return recurring && details.includes("freemium") ? ["free", "core", "premium"] : ["entry", "core", "premium"];
}

function cadenceFor(primary: RevenueModel, anchor: PriceAnchor, details: string[]): string {
  if (primary === "commission") return " per sale";
  if (primary !== "subscription" && primary !== "recurring") return "";
  const period = anchor.basis === "ownerRange" && anchor.range.cadence === "year" ? "year" : "month";
  return details.includes("perSeat") ? `/user/${period}` : `/${period}`;
}

function priceTiers(
  roles: TierRole[],
  names: Record<TierRole, string>,
  anchor: PriceAnchor,
  currency: PricingCurrency,
  positioning: Positioning,
  cadence: string,
  primary: RevenueModel,
): RecommendedTier[] {
  const values = tierValues(roles, anchor, positioning);
  const unpriced = primary === "custom" ? CUSTOM_QUOTE : UNPRICED;
  const percent = anchor.basis === "ownerRange" && anchor.range.percent;
  return roles.map((role, i) => {
    const value = role === "free" ? 0 : (values[role] ?? null);
    let price = unpriced;
    if (role === "free") price = "Free";
    else if (value !== null) price = percent ? `${value}%` : formatPrice(value, currency.currency, currency.currencySymbol);
    return {
      role,
      name: names[role],
      value,
      price,
      cadence: value === null || role === "free" ? "" : cadence,
      highlighted: roles.length === 2 ? i === 0 : role === "core",
    };
  });
}

function tierValues(roles: TierRole[], anchor: PriceAnchor, positioning: Positioning): Partial<Record<TierRole, number>> {
  if (anchor.basis === "none") return {};
  if (anchor.basis === "ownerRange") {
    const { min, max } = anchor.range;
    if (roles.length === 2) return { core: min, premium: max };
    if (min < max) return { entry: min, core: roundPrice((min + max) / 2), premium: max };
    return ladder(min);
  }
  return ladder(roundPrice(anchor.reference * POSITION_ADJUSTMENT[positioning.tier ?? "midMarket"]));
}

function ladder(core: number): Partial<Record<TierRole, number>> {
  return { entry: roundPrice(core * TIER_LADDER.entry), core, premium: roundPrice(core * TIER_LADDER.premium) };
}

/** Recommended prices are rounded to amounts people actually charge: halves below 20, whole numbers below 1,000, tens above. */
export function roundPrice(value: number): number {
  if (value >= 1000) return Math.round(value / 10) * 10;
  if (value >= 20) return Math.round(value);
  return Math.max(0.5, Math.round(value * 2) / 2);
}

const REVENUE_LABEL: Record<RevenueModel, string> = {
  subscription: "subscription",
  recurring: "recurring",
  oneTime: "one-time purchase",
  commission: "commission",
  custom: "custom",
};

function fitSentence(spec: StructureSpec, revenue: PricingEngineResult["revenue"], positioning: Positioning): string {
  const fit = revenue.stated
    ? `${spec.model} follows the stated ${REVENUE_LABEL[revenue.primary]} revenue model.`
    : `${spec.model} fits the business category; no revenue model was stated.`;
  return positioning.tier ? `${fit} Prices aim for a ${positionLabel(positioning.tier)} position, as the owner described.` : fit;
}

function positionLabel(tier: PositioningTier): string {
  return tier === "midMarket" ? "mid-market" : tier;
}

function anchorSentence(anchor: PriceAnchor): string {
  if (anchor.basis === "ownerRange") return `Tier prices follow the owner's expected price ("${anchor.range.text}"), which is the owner's own estimate rather than market data.`;
  if (anchor.basis === "none") {
    return anchor.reason === "commission"
      ? "No commission rate was stated and none was observed, so the rate is left to be validated."
      : "No owner price and no comparable competitor prices were available, so tier prices are left to be validated.";
  }
  const n = anchor.group.competitorIds.length;
  const basis: Record<typeof anchor.method, string> = {
    low: "the lowest observed entry price",
    high: "the highest observed entry price",
    median: "the median observed entry price",
    midpoint: "the midpoint of the two observed entry prices",
    single: "the one observed price",
  };
  return `Tier prices are positioned relative to ${basis[anchor.method]} among ${n} competitor${n === 1 ? "" : "s"} listing ${anchor.group.label} prices.`;
}

function limitations(
  evidence: PricingEvidence,
  signals: PricingSignals,
  anchor: PriceAnchor,
  positioning: Positioning,
  currency: PricingCurrency,
  primary: RevenueModel,
): string[] {
  const out: string[] = [];
  if (evidence.research === "absent") out.push("No research was supplied, so no competitor pricing evidence was used.");
  else if (evidence.research === "failed") out.push("Research failed, so no competitor pricing evidence was used.");
  else {
    if (evidence.research === "partial") out.push("Research was partial, so some competitor prices may be missing.");
    if (signals.competitorCount === 0) out.push("No validated competitors were found, so there is no competitor pricing evidence.");
    else if (signals.pricedCount === 0) out.push("None of the validated competitors publish prices; competitor pricing evidence is unavailable.");
    else if (signals.pricedCount === 1) out.push("Only one competitor publishes prices: a single data point, not a market range.");
    else if (signals.pricedCount < PRICING_LIMITS.minCompetitorsForMedian) out.push("Only two competitors publish prices, which is not a market distribution.");
    if (signals.mixedCurrencies) out.push("Competitor prices use different currencies and were not converted.");
  }
  if (anchor.basis === "none" && anchor.reason === "incompatible") {
    out.push("Observed competitor prices use a different billing basis than the recommended model, so they were not used as a price anchor.");
  }
  if (anchor.basis === "none" && anchor.reason === "otherCurrency") {
    out.push("Observed competitor prices are in a different currency from the owner's budget, so they come from another market and were not used as a price anchor or converted.");
  }
  if (anchor.basis === "ownerRange" && !anchor.range.cadence && (primary === "subscription" || primary === "recurring")) {
    out.push("The owner's expected price does not state a billing period; it was applied to the recurring plans.");
  }
  const percent = anchor.basis === "ownerRange" && anchor.range.percent;
  if (anchor.basis !== "none" && !percent && !currency.currency && !currency.currencySymbol) {
    out.push("No currency was stated, so prices are shown without one.");
  }
  if (positioning.conflicting) out.push("The stated positioning names conflicting price levels, so no price positioning was applied.");
  else if (!positioning.tier && anchor.basis === "competitorEvidence") out.push("No price positioning was stated, so a mid-market position was assumed.");
  out.push("Willingness to pay has not been researched; validate prices with real customers before publishing them.");
  return out;
}
