import { describe, expect, it } from "vitest";
import { NO_RESEARCH_EVIDENCE } from "@/lib/pricing/evidence";
import { derivePricingSignals } from "@/lib/pricing/signals";
import { pricingEvidence } from "@/test/pricing";

const statements = (s: ReturnType<typeof derivePricingSignals>) => s.signals.map((x) => x.statement);

describe("pricing signals", () => {
  it("derives nothing from no evidence", () => {
    const s = derivePricingSignals(NO_RESEARCH_EVIDENCE);
    expect(s).toMatchObject({ competitorCount: 0, pricedCount: 0, groups: [], signals: [], mixedCurrencies: false, mixedBilling: false });
    expect(derivePricingSignals(pricingEvidence([], "complete")).signals).toEqual([]);
  });

  it("reports transparency even when nobody publishes prices", () => {
    const s = derivePricingSignals(pricingEvidence([{}, { status: "onRequest" }]));
    expect(s.groups).toEqual([]);
    expect(statements(s)).toEqual([
      "0 of 2 validated competitors publish prices.",
      "1 of 2 validated competitors ask customers to request a price.",
    ]);
  });

  it("treats one priced competitor as a single data point", () => {
    const s = derivePricingSignals(pricingEvidence([{ name: "Alpha", prices: ["€29/month"] }, {}]));
    const [group] = s.groups;
    expect(group!.range).toBeUndefined();
    expect(group!.medianEntry).toBeUndefined();
    expect(statements(s)).toContain("One competitor lists monthly EUR prices: Alpha €29/month. A single competitor is not a market range.");
  });

  it("gives two competitors a range but no distribution", () => {
    const s = derivePricingSignals(pricingEvidence([{ name: "Alpha", prices: ["€29/month"] }, { name: "Beta", prices: ["€49/month"] }]));
    const [group] = s.groups;
    expect(group!.range?.low.value).toBe(29);
    expect(group!.range?.high.value).toBe(49);
    expect(group!.medianEntry).toBeUndefined();
    expect(statements(s).join(" ")).toContain("Two competitors are not a market distribution.");
  });

  it("gives three or more competitors a median of entry prices", () => {
    const s = derivePricingSignals(
      pricingEvidence([
        { name: "Alpha", prices: ["€19/month", "€49/month"] },
        { name: "Beta", prices: ["€29/month"] },
        { name: "Gamma", prices: ["€59/month"] },
      ]),
    );
    const [group] = s.groups;
    expect(group!.entryPrices.map((o) => o.value)).toEqual([19, 29, 59]);
    expect(group!.medianEntry).toBe(29);
    expect(statements(s)).toContain(
      "3 competitors list monthly EUR prices (entry prices from €19/month to €59/month; median entry price €29): Alpha €19/month; Beta €29/month; Gamma €59/month.",
    );
  });

  it("never combines different currencies", () => {
    const s = derivePricingSignals(
      pricingEvidence([{ prices: ["€29/month"] }, { prices: ["£25/month"] }, { prices: ["1500 ALL/month"] }]),
    );
    expect(s.groups).toHaveLength(3);
    expect(s.groups.every((g) => g.competitorIds.length === 1 && !g.range)).toBe(true);
    expect(s.mixedCurrencies).toBe(true);
    expect(statements(s).join(" ")).toContain("they are not converted or combined");
  });

  it("never combines monthly, yearly and one-time prices", () => {
    const s = derivePricingSignals(
      pricingEvidence([
        { prices: ["€29/month"] },
        { prices: ["€290/year"] },
        { prices: [["€199", "Lifetime €199 one-time"]] },
        { prices: [["€49", "Plans at €49"]] },
      ]),
    );
    expect(s.groups.map((g) => g.label).sort()).toEqual(["EUR (no billing period stated)", "monthly EUR", "one-time EUR", "yearly EUR"]);
    expect(s.groups.every((g) => g.competitorIds.length === 1)).toBe(true);
    expect(s.mixedBilling).toBe(true);
    expect(statements(s).join(" ")).toContain("different billing bases");
  });

  it("excludes prices without a readable amount or currency marker from comparisons", () => {
    const evidence = pricingEvidence([{ prices: ["€29/month"] }, { prices: ["€1.2.3/month"] }]);
    const s = derivePricingSignals(evidence);
    expect(s.pricedCount).toBe(2);
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0]!.competitorIds).toHaveLength(1);
  });

  it("never states averages and carries provenance on every signal", () => {
    const s = derivePricingSignals(
      pricingEvidence([{ prices: ["€19/month"] }, { prices: ["€29/month"] }, { prices: ["€59/month"] }, { freeOffer: true }]),
    );
    for (const signal of s.signals) {
      expect(signal.statement).not.toMatch(/average|market standard|typical/i);
      expect(signal.sourceIds.length).toBeGreaterThan(0);
      expect(signal.evidenceIds.length).toBeGreaterThan(0);
      expect(signal.id).toMatch(/^ps_[0-9a-f]{12}$/);
    }
    expect(statements(s)).toContain("1 of 4 validated competitors mention a free trial or free plan.");
  });
});
