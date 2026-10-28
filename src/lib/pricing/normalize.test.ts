import { describe, expect, it } from "vitest";
import { formatPrice, normalizePrice, parseAmount, parseOwnerPriceRange, readCadence, readCurrency } from "@/lib/pricing/normalize";

describe("price normalization", () => {
  it("reads a monthly price and keeps the original text", () => {
    expect(normalizePrice("€29/month", "Pro plan €29/month, cancel anytime")).toEqual({
      original: "€29/month",
      excerpt: "Pro plan €29/month, cancel anytime",
      value: 29,
      currency: "EUR",
      currencySymbol: null,
      cadence: "month",
      billing: "recurring",
      qualifier: "exact",
    });
  });

  it("reads yearly, per-unit and abbreviated cadences", () => {
    expect(normalizePrice("$290/yr", "Billed $290/yr").cadence).toBe("year");
    expect(normalizePrice("£12 per hour", "Tutoring £12 per hour").cadence).toBe("hour");
    const desk = normalizePrice("€8/day", "Desks from €8/day.");
    expect([desk.cadence, desk.billing, desk.qualifier]).toEqual(["day", "perUnit", "from"]);
  });

  it("marks one-time prices only when the evidence says so", () => {
    expect(normalizePrice("€199", "Lifetime licence €199 one-time").billing).toBe("oneTime");
    expect(normalizePrice("€199", "Full course €199").billing).toBe("unspecified");
  });

  it("never assumes a billing period for a bare price", () => {
    const p = normalizePrice("€29", "Plans at €29");
    expect(p.cadence).toBeNull();
    expect(p.billing).toBe("unspecified");
  });

  it("reads starting prices as lower bounds", () => {
    expect(normalizePrice("150 ALL", "Espresso from 150 ALL.").qualifier).toBe("from");
    expect(normalizePrice("$9/month", "Plans starting at $9/month").qualifier).toBe("from");
    expect(normalizePrice("2.000 lekë", "Paketa duke filluar nga 2.000 lekë").qualifier).toBe("from");
  });

  it("keeps an ambiguous currency marker without guessing the currency", () => {
    const p = normalizePrice("$49", "Only $49");
    expect(p.currency).toBeNull();
    expect(p.currencySymbol).toBe("$");
    expect(readCurrency("US$49").currency).toBe("USD");
  });

  it("reads explicit currencies and refuses mixed ones", () => {
    expect(readCurrency("1500 ALL")).toEqual({ currency: "ALL", currencySymbol: null });
    expect(readCurrency("2.000 lekë").currency).toBe("ALL");
    expect(readCurrency("CHF 40").currency).toBe("CHF");
    expect(readCurrency("all plans")).toEqual({ currency: null, currencySymbol: null });
    expect(readCurrency("€10 or £9")).toEqual({ currency: null, currencySymbol: null });
  });

  it("parses amounts with thousands and decimal separators", () => {
    expect(parseAmount("29")).toBe(29);
    expect(parseAmount("1.500")).toBe(1500);
    expect(parseAmount("1,500")).toBe(1500);
    expect(parseAmount("3,50")).toBe(3.5);
    expect(parseAmount("9.99")).toBe(9.99);
    expect(parseAmount("1.234,50")).toBe(1234.5);
    expect(parseAmount("1.2.3")).toBeNull();
    expect(parseAmount("0")).toBeNull();
  });

  it("returns no value when the amount cannot be read unambiguously", () => {
    expect(normalizePrice("€1.2.3", "€1.2.3").value).toBeNull();
  });

  it("reads cadence only from the price suffix", () => {
    expect(readCadence("€29/mo")).toBe("month");
    expect(readCadence("€29")).toBeNull();
    expect(readCadence("€29/fortnight")).toBeNull();
  });
});

describe("owner's expected price", () => {
  it("reads a range with its currency and billing period", () => {
    expect(parseOwnerPriceRange("€20–40 per month")).toMatchObject({ min: 20, max: 40, currency: "EUR", cadence: "month", percent: false });
    expect(parseOwnerPriceRange("1500 deri 3000 lekë")).toMatchObject({ min: 1500, max: 3000, currency: "ALL" });
  });

  it("reads a single amount and keeps the currency unknown when unstated", () => {
    expect(parseOwnerPriceRange("around 30")).toMatchObject({ min: 30, max: 30, currency: null, currencySymbol: null, cadence: null });
  });

  it("does not turn two unrelated numbers into a range", () => {
    expect(parseOwnerPriceRange("€30 for 2 people")).toMatchObject({ min: 30, max: 30 });
  });

  it("recognizes percentages and returns null without a number", () => {
    expect(parseOwnerPriceRange("10-15% commission")).toMatchObject({ min: 10, max: 15, percent: true });
    expect(parseOwnerPriceRange("not sure yet")).toBeNull();
  });
});

describe("formatting recommended prices", () => {
  it("formats in the given currency and never adds one", () => {
    expect(formatPrice(29, "EUR", null)).toBe("€29");
    expect(formatPrice(1500, "ALL", null)).toBe("1500 ALL");
    expect(formatPrice(40, "CHF", null)).toBe("CHF 40");
    expect(formatPrice(9.5, null, "$")).toBe("$9.50");
    expect(formatPrice(29, null, null)).toBe("29");
  });
});
