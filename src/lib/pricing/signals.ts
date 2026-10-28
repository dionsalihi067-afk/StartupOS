import { PRICING_LIMITS } from "@/lib/pricing/limits";
import type { BillingBasis, Cadence, CurrencyCode, PricePoint, PricingEvidence, PriceQualifier } from "@/lib/pricing/model";
import { formatPrice } from "@/lib/pricing/normalize";
import { shortHash } from "@/lib/research/normalize";

/**
 * Pricing signals: what can be said about the observed prices without
 * estimating anything. Prices are only compared within one homogeneous group
 * (same currency, same billing basis and cadence); a range needs two
 * competitors and a median three. Monthly, yearly, per-unit and unspecified
 * prices are never combined, and currencies are never converted.
 */

export interface PriceObservation {
  competitorId: string;
  competitorName: string;
  original: string;
  value: number;
  qualifier: PriceQualifier;
  sourceIds: string[];
  evidenceIds: string[];
}

export interface PriceGroup {
  key: string;
  currency: CurrencyCode | null;
  currencySymbol: string | null;
  cadence: Cadence | null;
  billing: BillingBasis;
  /** e.g. "monthly EUR", "ALL (no billing period stated)". */
  label: string;
  observations: PriceObservation[];
  /** Distinct competitors in the group: the sample size. */
  competitorIds: string[];
  /** Each competitor's lowest listed price in this group. */
  entryPrices: PriceObservation[];
  /** Lowest and highest entry prices; only with at least `minCompetitorsForRange` competitors. */
  range?: { low: PriceObservation; high: PriceObservation };
  /** Median entry price; only with at least `minCompetitorsForMedian` competitors. */
  medianEntry?: number;
}

export const SIGNAL_KINDS = ["transparency", "onRequest", "freeOffer", "pricePoints", "currencyMix", "billingMix"] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

export interface PricingSignal {
  id: string;
  kind: SignalKind;
  statement: string;
  sampleSize: number;
  competitorIds: string[];
  sourceIds: string[];
  evidenceIds: string[];
}

export interface PricingSignals {
  competitorCount: number;
  pricedCount: number;
  onRequestCount: number;
  freeOfferCount: number;
  /** Groups with at least one readable amount and a known currency marker, largest sample first. */
  groups: PriceGroup[];
  mixedCurrencies: boolean;
  mixedBilling: boolean;
  signals: PricingSignal[];
}

const CADENCE_LABEL: Record<Cadence, string> = {
  month: "monthly", year: "yearly", week: "weekly", day: "per-day", hour: "hourly",
  session: "per-session", person: "per-person", user: "per-user", night: "per-night",
};

function groupLabel(p: Pick<PricePoint, "currency" | "currencySymbol" | "cadence" | "billing">): string {
  const currency = p.currency ?? p.currencySymbol ?? "unknown-currency";
  if (p.cadence) return `${CADENCE_LABEL[p.cadence]} ${currency}`;
  return p.billing === "oneTime" ? `one-time ${currency}` : `${currency} (no billing period stated)`;
}

function billingLabel(g: PriceGroup): string {
  if (g.cadence) return CADENCE_LABEL[g.cadence];
  return g.billing === "oneTime" ? "one-time" : "no billing period stated";
}

export function derivePricingSignals(evidence: PricingEvidence): PricingSignals {
  const competitors = evidence.competitors;
  const priced = competitors.filter((c) => c.status === "published");
  const onRequest = competitors.filter((c) => c.status === "onRequest");
  const free = competitors.filter((c) => c.freeOffer);
  const groups = groupPrices(evidence);

  const currencies = [...new Set(groups.map((g) => g.currency ?? g.currencySymbol ?? ""))];
  const bases = [...new Set(groups.map(billingLabel))];

  const signals: PricingSignal[] = [];
  const add = (kind: SignalKind, key: string, statement: string, from: { competitorIds: string[]; sourceIds: string[]; evidenceIds: string[] }, sampleSize: number) => {
    if (from.sourceIds.length === 0) return;
    signals.push({ id: `ps_${shortHash(`${kind}|${key}`)}`, kind, statement, sampleSize, ...from });
  };
  const fromCompetitors = (list: typeof competitors, pick: (c: (typeof competitors)[number]) => { sourceIds: string[]; evidenceIds: string[] } = (c) => c) => ({
    competitorIds: list.map((c) => c.competitorId),
    sourceIds: unique(list.flatMap((c) => pick(c).sourceIds)),
    evidenceIds: unique(list.flatMap((c) => pick(c).evidenceIds)),
  });

  const n = competitors.length;
  if (n > 0) {
    add("transparency", "all", `${priced.length} of ${n} validated competitors publish prices.`, fromCompetitors(priced.length > 0 ? priced : competitors), n);
  }
  if (onRequest.length > 0) {
    add("onRequest", "all", `${onRequest.length} of ${n} validated competitors ask customers to request a price.`, fromCompetitors(onRequest), n);
  }
  if (free.length > 0) {
    add("freeOffer", "all", `${free.length} of ${n} validated competitors mention a free trial or free plan.`, fromCompetitors(free, (c) => c.freeOffer!), n);
  }
  for (const g of groups) {
    add("pricePoints", g.key, groupStatement(g), {
      competitorIds: g.competitorIds,
      sourceIds: unique(g.observations.flatMap((o) => o.sourceIds)),
      evidenceIds: unique(g.observations.flatMap((o) => o.evidenceIds)),
    }, g.competitorIds.length);
  }
  const allObservations = groups.flatMap((g) => g.observations);
  const groupProvenance = {
    competitorIds: unique(allObservations.map((o) => o.competitorId)),
    sourceIds: unique(allObservations.flatMap((o) => o.sourceIds)),
    evidenceIds: unique(allObservations.flatMap((o) => o.evidenceIds)),
  };
  if (currencies.length > 1) {
    add("currencyMix", "all", `Observed prices use ${currencies.length} currencies (${currencies.join(", ")}); they are not converted or combined.`, groupProvenance, priced.length);
  }
  if (bases.length > 1) {
    add("billingMix", "all", `Observed prices use different billing bases (${bases.join(", ")}); they are not combined.`, groupProvenance, priced.length);
  }

  return {
    competitorCount: n,
    pricedCount: priced.length,
    onRequestCount: onRequest.length,
    freeOfferCount: free.length,
    groups,
    mixedCurrencies: currencies.length > 1,
    mixedBilling: bases.length > 1,
    signals,
  };
}

function groupPrices(evidence: PricingEvidence): PriceGroup[] {
  const groups = new Map<string, PriceGroup>();
  for (const c of evidence.competitors) {
    for (const p of c.points) {
      if (p.value === null || (!p.currency && !p.currencySymbol)) continue;
      const key = `${p.currency ?? p.currencySymbol}|${p.cadence ?? p.billing}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          currency: p.currency,
          currencySymbol: p.currencySymbol,
          cadence: p.cadence,
          billing: p.billing,
          label: groupLabel(p),
          observations: [],
          competitorIds: [],
          entryPrices: [],
        };
        groups.set(key, group);
      }
      group.observations.push({
        competitorId: c.competitorId,
        competitorName: c.name,
        original: p.original,
        value: p.value,
        qualifier: p.qualifier,
        sourceIds: p.sourceIds,
        evidenceIds: p.evidenceIds,
      });
      if (!group.competitorIds.includes(c.competitorId)) group.competitorIds.push(c.competitorId);
    }
  }

  for (const g of groups.values()) {
    g.entryPrices = g.competitorIds.map((id) =>
      g.observations.filter((o) => o.competitorId === id).reduce((low, o) => (o.value < low.value ? o : low)),
    );
    const sorted = [...g.entryPrices].sort((a, b) => a.value - b.value);
    if (sorted.length >= PRICING_LIMITS.minCompetitorsForRange) g.range = { low: sorted[0]!, high: sorted[sorted.length - 1]! };
    if (sorted.length >= PRICING_LIMITS.minCompetitorsForMedian) g.medianEntry = median(sorted.map((o) => o.value));
  }
  return [...groups.values()].sort((a, b) => b.competitorIds.length - a.competitorIds.length);
}

function groupStatement(g: PriceGroup): string {
  const n = g.competitorIds.length;
  const listed = g.entryPrices.map((o) => `${o.competitorName} ${o.qualifier === "from" ? "from " : ""}${o.original}`).join("; ");
  if (n === 1) return `One competitor lists ${g.label} prices: ${listed}. A single competitor is not a market range.`;
  if (!g.range) return `${n} competitors list ${g.label} prices: ${listed}.`;
  const span = `entry prices from ${g.range.low.original} to ${g.range.high.original}`;
  if (g.medianEntry === undefined) {
    return `${n} competitors list ${g.label} prices (${span}): ${listed}. Two competitors are not a market distribution.`;
  }
  const medianText = formatPrice(roundTo2(g.medianEntry), g.currency, g.currencySymbol);
  return `${n} competitors list ${g.label} prices (${span}; median entry price ${medianText}): ${listed}.`;
}

function median(values: number[]): number {
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 1 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2;
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
