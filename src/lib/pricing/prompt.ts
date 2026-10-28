import type { PricingEngineResult } from "@/lib/pricing/strategy";

/** The pricing contract the pricing agent's prompt always carries. */
export const PRICING_GUIDANCE = [
  "Observed competitor prices are evidence only, not recommendations.",
  "The recommended tiers are StartupOS strategy; never present them as observed or market prices.",
  "Never invent competitor prices, market averages, price ranges or 'market standard' prices.",
  "Never claim pricing evidence that is not listed here; when it is unavailable, say so.",
  "Keep every price in its stated currency and billing period; never convert currencies or assume a billing period.",
  "Do not change the recommended tier prices and do not add any other prices.",
  "Do not cite facts this context does not support, and do not turn recommendations into facts.",
  "The budget is a launch constraint, not evidence of what customers will pay.",
] as const;

const POSITIONING_LABEL = { budget: "budget", accessible: "accessible", midMarket: "mid-market", premium: "premium" } as const;

/** Compact pricing block: business model, evidence, signals, the recommended tiers and limitations. */
export function renderPricingContext(r: PricingEngineResult): string {
  const lines = ["PRICING ENGINE"];
  lines.push(`Revenue model: ${r.revenue.stated ? [r.revenue.primary, ...r.revenue.secondary].join(", ") : "not stated"} → ${r.model}`);
  if (r.pricingModelDetails.length > 0) lines.push(`Planned pricing mechanics (owner input): ${r.pricingModelDetails.join(", ")}`);
  lines.push(
    r.positioning.tier
      ? `Positioning: ${POSITIONING_LABEL[r.positioning.tier]} (from the owner's ${r.positioning.basis === "ownerPositioning" ? "stated positioning" : "differentiator"})`
      : `Positioning: ${r.positioning.conflicting ? "conflicting in the owner's answers" : "not stated"}`,
  );
  if (r.anchor.basis === "ownerRange") lines.push(`Owner's expected price (owner input, not market evidence): "${r.anchor.range.text}"`);

  const published = r.evidence.competitors.filter((c) => c.points.length > 0);
  if (published.length > 0) {
    lines.push("Observed competitor prices (evidence; verbatim, not converted):");
    for (const c of published) {
      for (const p of c.points) {
        const basis = p.cadence ? `per ${p.cadence}` : p.billing === "oneTime" ? "one-time" : "no billing period stated";
        lines.push(`- ${c.name} (${c.domain}): ${p.qualifier === "from" ? "from " : ""}${p.original} · ${basis} · "${p.excerpt}"`);
      }
    }
  } else {
    lines.push("Observed competitor prices: none available.");
  }
  if (r.signals.signals.length > 0) {
    lines.push("Pricing signals (derived from the observed prices):", ...r.signals.signals.map((s) => `- ${s.statement}`));
  }

  lines.push("Recommended tiers (StartupOS strategy, not market data; keep these prices exactly):");
  for (const t of r.tiers) lines.push(`- ${t.name}: ${t.price}${t.cadence}${t.highlighted ? " (highlighted)" : ""}`);
  lines.push(`Price basis: ${r.basisNote}`);
  lines.push("Limitations:", ...r.limitations.map((l) => `- ${l}`));
  lines.push("Pricing rules:", ...PRICING_GUIDANCE.map((rule, i) => `${i + 1}. ${rule}`));
  return lines.join("\n");
}
