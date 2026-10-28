import type { z } from "zod";
import { PRICING_LIMITS } from "@/lib/pricing/limits";
import { normalizePrice } from "@/lib/pricing/normalize";
import { CUSTOM_QUOTE, UNPRICED, type PricingEngineResult, type RecommendedTier, type RevenueModel } from "@/lib/pricing/strategy";
import { readPricing } from "@/lib/research/competitors/signals";
import { clipText } from "@/lib/research/normalize";
import type { pricingLlmSchema } from "@/lib/schemas";
import type { PricingGrounding, PricingStrategy, PricingTier } from "@/lib/types";
import { ensureArray, nonEmpty } from "@/lib/utils";

/**
 * Maps an engine result onto the existing PricingStrategy package shape and
 * merges model-written copy into it. Tier prices, cadences, the highlighted
 * tier and the grounding always come from the engine; model text that
 * mentions any price the engine did not produce or observe is discarded.
 */

const OFFER_LABEL_CHARS = 60;
const MAX_UPSELLS = 3;

const SECONDARY_UPSELL: Record<RevenueModel, string> = {
  subscription: "A subscription option for repeat customers",
  recurring: "A recurring plan for regular customers",
  oneTime: "One-time add-ons sold alongside the main offer",
  commission: "Commission from partner referrals",
  custom: "Custom packages for larger clients",
};

export function toPricingStrategy(result: PricingEngineResult): PricingStrategy {
  const offer = clipText(result.offer, OFFER_LABEL_CHARS) || "this offer";
  return {
    model: result.model,
    rationale: result.rationale,
    tiers: result.tiers.map((tier, i) => ({ ...tierFields(tier), ...tierCopy(tier, offer, result.tiers[i - 1]?.name) })),
    psychology: tactics(result),
    upsells: [...result.revenue.secondary.map((m) => SECONDARY_UPSELL[m]), "Bundles that combine the main offer with extras", "Referral rewards for existing customers"].slice(0, MAX_UPSELLS),
    grounding: grounding(result),
  };
}

function tierFields(tier: RecommendedTier): Pick<PricingTier, "name" | "price" | "cadence" | "highlighted"> {
  return { name: tier.name, price: tier.price, cadence: tier.cadence, highlighted: tier.highlighted };
}

/** True when the engine left a numeric/ Free price rather than an unresolved placeholder. */
function hasConcretePrice(price: string): boolean {
  return price !== UNPRICED && price !== CUSTOM_QUOTE && price.trim() !== "";
}

/**
 * Package copy stays tied to the owner's offer. Features never invent support
 * SLAs, popularity, guarantees or delivery times. Unpriced tiers use a quote CTA.
 */
function tierCopy(tier: RecommendedTier, offer: string, previous: string | undefined): Pick<PricingTier, "tagline" | "features" | "cta"> {
  const priced = hasConcretePrice(tier.price);
  const prior = previous ? [`Builds on ${previous}`] : [];
  switch (tier.role) {
    case "free":
      return { tagline: `Try ${offer} at no cost.`, features: [`Access to ${offer}`], cta: "Start free" };
    case "entry":
      return {
        tagline: priced ? `A simple starting option for ${offer}.` : `Suggested starting package for ${offer}.`,
        features: [`Focused on ${offer}`],
        cta: priced ? "Get started" : "Request a quote",
      };
    case "core":
      return {
        tagline: priced ? `Suggested main option for ${offer}.` : `Suggested main package for ${offer}.`,
        features: [...prior, `Centered on ${offer}`],
        cta: priced ? "Choose this plan" : "Request a quote",
      };
    case "premium":
      return {
        tagline: priced ? `A higher-scope option for ${offer}.` : `Suggested higher-scope package for ${offer}.`,
        features: [...prior, `More scope around ${offer}`],
        cta: "Talk to us",
      };
  }
}

function tactics(result: PricingEngineResult): string[] {
  const { tiers, signals, revenue, pricingModelDetails: details, anchor } = result;
  const core = tiers.find((t) => t.highlighted);
  const premium = tiers.find((t) => t.role === "premium");
  const out: string[] = [];
  if (core) out.push(`Highlight ${core.name} as the suggested default so the decision stays simple — this is strategy, not evidence of popularity.`);
  if (core && premium && premium !== core && tiers.length >= 3) out.push(`Use ${premium.name} as a reference point that makes ${core.name} feel reasonable.`);
  if (revenue.primary === "subscription" || revenue.primary === "recurring") {
    out.push("Consider annual billing once monthly prices are validated; do not invent a discount until you set one.");
  }
  if (details.includes("trial")) out.push("Offer a time-limited free trial, as planned.");
  else if (signals.freeOfferCount > 0) out.push(`Consider a free trial: ${signals.freeOfferCount} of ${signals.competitorCount} competitors found mention one.`);
  if (details.includes("usage")) out.push("Add a usage-based component so heavier use costs more.");
  if (signals.pricedCount > 0) out.push(`Publish prices clearly; ${signals.pricedCount} of ${signals.competitorCount} competitors found do.`);
  else if (signals.competitorCount > 0) out.push(`Publishing prices could stand out: none of the ${signals.competitorCount} competitors found list theirs.`);
  if (anchor.basis === "none") out.push("Test price points with real customers before publishing them.");
  return out;
}

function grounding(result: PricingEngineResult): PricingGrounding {
  const { evidence, signals, anchor } = result;
  let status: PricingGrounding["evidence"] = "unavailable";
  if (evidence.research === "absent") status = "notResearched";
  else if (evidence.research === "failed") status = "researchFailed";
  else if (signals.pricedCount > 0) status = "observed";

  return {
    evidence: status,
    priceBasis: anchor.basis,
    observations: evidence.competitors
      .flatMap((c) => c.points.map((p) => ({ competitor: c.name, domain: c.domain, price: p.original })))
      .slice(0, PRICING_LIMITS.maxGroundingObservations),
    signals: signals.signals.map((s) => s.statement).slice(0, PRICING_LIMITS.maxGroundingSignals),
    limitations: result.limitations,
  };
}

/* ------------------------------ Model copy ------------------------------- */

type PricingLlm = z.infer<typeof pricingLlmSchema>;

/** Price keys ("EUR|29") the output may mention: recommended tiers, observed prices and the owner's own price. */
function allowedPrices(result: PricingEngineResult): Set<string> {
  const keys = new Set<string>();
  const marker = result.currency.currency ?? result.currency.currencySymbol;
  for (const t of result.tiers) if (t.value) keys.add(`${marker}|${t.value}`);
  for (const c of result.evidence.competitors) for (const p of c.points) if (p.value !== null) keys.add(`${p.currency ?? p.currencySymbol}|${p.value}`);
  if (result.anchor.basis === "ownerRange") {
    const r = result.anchor.range;
    for (const v of [r.min, r.max]) keys.add(`${r.currency ?? r.currencySymbol}|${v}`);
  }
  return keys;
}

/** True when the text mentions no price, or only prices the engine produced or observed. */
export function mentionsOnlyKnownPrices(text: string, allowed: ReadonlySet<string>): boolean {
  const read = readPricing(text);
  if (read.status === "unavailable") return true;
  if (read.status === "ambiguous") return false;
  return read.prices.every(({ amount }) => {
    const p = normalizePrice(amount, amount);
    return p.value !== null && allowed.has(`${p.currency ?? p.currencySymbol}|${p.value}`);
  });
}

export function mergeLlmPricing(result: PricingEngineResult, base: PricingStrategy, llm: PricingLlm): PricingStrategy {
  const allowed = allowedPrices(result);
  const ok = (text: string | undefined): text is string => !!text?.trim() && mentionsOnlyKnownPrices(text, allowed);
  const list = (values: string[] | undefined, fallback: string[]) => ensureArray((values ?? []).filter(ok), fallback);
  const llmTiers = ensureArray(llm.tiers, []);

  const tiers = base.tiers.map((tier, i) => {
    const t = llmTiers[i];
    return {
      ...tier,
      name: ok(t?.name) ? t.name : tier.name,
      tagline: ok(t?.tagline) ? t.tagline : tier.tagline,
      features: list(t?.features, tier.features),
      cta: ok(t?.cta) ? t.cta : tier.cta,
    };
  });

  return {
    ...base,
    rationale: ok(llm.rationale) ? `${nonEmpty(llm.rationale, "")} ${result.basisNote}` : base.rationale,
    tiers,
    psychology: list(llm.psychology, base.psychology),
    upsells: list(llm.upsells, base.upsells),
  };
}
