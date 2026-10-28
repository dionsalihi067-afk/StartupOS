import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { overviewBudgetLabel, overviewPositioning } from "@/lib/client/insights";
import { assessGenerationQuality, packageQuality } from "@/lib/generation-quality";
import { orchestrate } from "@/lib/orchestrator";
import { parseBusinessPackage } from "@/lib/package-schema";
import { UNPRICED } from "@/lib/pricing/strategy";
import type { BusinessInput, BusinessPackage, OrchestrationEvent } from "@/lib/types";
import { sampleInput } from "@/test/research";
import type { Translator } from "@/i18n/translator";

async function finalPackage(events: AsyncGenerator<OrchestrationEvent>): Promise<BusinessPackage> {
  let result: BusinessPackage | undefined;
  for await (const event of events) {
    if (event.type === "complete") result = event.result;
    if (event.type === "error") throw new Error(`generation failed: ${JSON.stringify(event)}`);
  }
  if (!result) throw new Error("generation did not complete");
  return result;
}

const t = Object.assign((key: string) => (key === "discovery.review.notDecided" ? "Not decided yet" : key), {
  rich: (key: string) => key,
  optional: () => undefined,
  locale: "en" as const,
}) as Translator;

const FABRICATED =
  /\b(?:trusted by thousands|industry-leading|guaranteed results|most trusted|most popular|best value|chosen by most|priority support|satisfaction guaranteed|limited time|\d+\s*%\s*off)\b/i;

const CONTACT_FABRICATED = /\b(?:info@|hello@|contact@|\+383|\+355|\(\d{3}\)\s*\d{3})\b/i;

beforeEach(() => {
  for (const key of ["OPENAI_API_KEY", "TAVILY_API_KEY", "SERPER_API_KEY", "BRAVE_API_KEY"]) vi.stubEnv(key, "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Compact cross-module invariants shared by fixtures A/B/C. */
function assertCoreInvariants(
  pkg: BusinessPackage,
  want: {
    name?: string;
    offeringNeedle: RegExp;
    audienceNeedle: RegExp;
    allowPaidAds: boolean;
    seoType: "LocalBusiness" | "Organization";
    forbidLocation?: RegExp;
    quality?: "success" | "degraded";
  },
) {
  const parsed = parseBusinessPackage(pkg);
  expect(parsed).not.toBeNull();
  const p = parsed!;

  if (want.name) expect(p.brand.name).toBe(want.name);
  expect(p.meta.quality?.outcome).toMatch(/^(success|provisional|degraded)$/);
  if (want.quality) expect(packageQuality(p).outcome).toBe(want.quality);

  const marketing = JSON.stringify(p.marketing);
  const website = JSON.stringify(p.website);
  const pricing = JSON.stringify(p.pricing);
  const growth = JSON.stringify(p.growth);
  const brand = JSON.stringify(p.brand);

  expect(marketing).toMatch(want.offeringNeedle);
  expect(website).toMatch(want.offeringNeedle);
  expect(marketing).toMatch(want.audienceNeedle);
  expect(website).toMatch(want.audienceNeedle);

  expect(marketing).not.toMatch(FABRICATED);
  expect(website).not.toMatch(FABRICATED);
  expect(pricing).not.toMatch(/Most Popular|Chosen by Most|Priority support/i);
  expect(brand).not.toMatch(/most trusted/i);
  expect(website).not.toMatch(CONTACT_FABRICATED);

  expect(p.website.seo.jsonLd["@type"]).toBe(want.seoType);
  if (want.forbidLocation) {
    expect(brand).not.toMatch(want.forbidLocation);
    expect(JSON.stringify(p.website.seo)).not.toMatch(want.forbidLocation);
    expect(p.website.seo.jsonLd).not.toHaveProperty("address");
  }

  if (want.allowPaidAds) {
    expect(p.marketing.facebookAds.length).toBeGreaterThan(0);
    expect(p.marketing.facebookAds.every((a) => a.estimatedCpc === "")).toBe(true);
    expect(growth).toMatch(/ad campaign|paid/i);
  } else {
    expect(p.marketing.facebookAds).toEqual([]);
    expect(growth).not.toMatch(/intro ad campaign|Increase spend/i);
  }

  return p;
}

describe("Phase 9 cross-module fixtures", () => {
  it("Fixture A — local service (physical, known market, spendable budget)", async () => {
    const input = sampleInput({
      business: {
        name: "Rrota",
        idea: "Mobile bike repair for city riders",
        offering: "On-site bike repairs and tune-ups",
        stage: "preparing",
        type: "physical",
        category: "services",
        location: "Prishtina, Kosovo",
      },
      customer: {
        ideal: "Commuters in Prishtina",
        type: "b2c",
        problem: "cannot leave work for a shop visit",
        need: "reliable on-site repair",
      },
      offer: {
        status: "planned",
        main: "Flat-rate tune-ups",
        differentiator: "We come to your office parking lot",
        priceRange: "€25-60",
      },
      model: { revenue: ["oneTime"], channels: ["direct", "messaging", "social"], budget: "€4,000" },
      market: { positioning: "On-site bike care for busy city riders" },
      brand: { language: "en" },
      goals: { priority: "launch" },
    });

    const pkg = await finalPackage(orchestrate(input));
    const parsed = assertCoreInvariants(pkg, {
      name: "Rrota",
      offeringNeedle: /tune-up|bike|Rrota/i,
      audienceNeedle: /Commuters|Prishtina|riders/i,
      allowPaidAds: true,
      seoType: "LocalBusiness",
      quality: "success",
    });

    expect(overviewPositioning(parsed)).toEqual({
      text: "On-site bike care for busy city riders",
      source: "owner",
    });
    expect(overviewBudgetLabel(parsed.input.budget, t)).toBe("€4,000");
    expect(String(parsed.website.seo.jsonLd.areaServed ?? "")).toContain("Prishtina");
    expect(parsed.input.discovery?.offer.main).toBe("Flat-rate tune-ups");
  });

  it("Fixture B — online business (digital channels, known remote market, no paid ads without social+budget combo for ads)", async () => {
    const input = sampleInput({
      business: {
        name: "Lume",
        idea: "Scheduling CRM for freelancers",
        offering: "Booking and invoicing software",
        stage: "preparing",
        type: "online",
        category: "software",
        location: "Remote / EU",
      },
      customer: { ideal: "Freelance designers", type: "b2b", problem: "juggling clients in spreadsheets" },
      offer: { status: "planned", main: "Monthly scheduling subscriptions", priceRange: "€19-39 per month" },
      model: { revenue: ["subscription"], channels: ["website", "direct"], budget: "flexible", budgetUnknown: true },
      brand: { language: "en" },
    });

    const pkg = await finalPackage(orchestrate(input));
    const parsed = assertCoreInvariants(pkg, {
      name: "Lume",
      offeringNeedle: /scheduling|Lume|subscription/i,
      audienceNeedle: /Freelance|designers/i,
      allowPaidAds: false,
      seoType: "Organization",
      quality: "success",
    });

    // Owner price range is a recommendation basis — not a confirmed promo in marketing.
    expect(parsed.pricing.grounding?.priceBasis).toBe("ownerRange");
    expect(JSON.stringify(parsed.marketing)).not.toMatch(/\b€19\b|\b€39\b|\d+\s*%\s*off|limited spots/i);
    expect(String(parsed.website.seo.jsonLd.areaServed ?? "")).toMatch(/Remote|EU/i);
    // Unknown budget ≠ permission to spend.
    expect(overviewBudgetLabel(parsed.input.budget, t)).toMatch(/flexible|not decided|Not decided/i);
  });

  it("Fixture C — sparse input (Unspecified market, zero budget) does not fabricate place or spend", async () => {
    const input: BusinessInput = {
      idea: "Handmade notebooks sold online",
      audience: "Journal keepers",
      location: "Unspecified",
      budget: "0",
      style: "Modern / Minimal",
    };

    const pkg = await finalPackage(orchestrate(input));
    const parsed = assertCoreInvariants(pkg, {
      offeringNeedle: /notebook|journal/i,
      audienceNeedle: /Journal keepers|journal/i,
      // Legacy inputs default to social → ad *copy* is allowed; spend/CPC must stay empty.
      allowPaidAds: true,
      seoType: "Organization",
      forbidLocation: /Unspecified|Kosovo|Prishtin|Tirana|Albania/i,
      quality: "success",
    });

    expect(parsed.input.location).toBe("Unspecified");
    expect(overviewPositioning(parsed)?.source).toBe("ai");
    expect(overviewBudgetLabel(parsed.input.budget, t)).toBe("0");
    expect(parsed.brand.description).not.toMatch(/based in/i);
    expect(parsed.pricing.tiers.every((tier) => tier.price === UNPRICED || tier.price === "Free" || tier.price === "Custom quote" || tier.price === "To be validated")).toBe(true);
    // Research absent → not presented as completed competitive research.
    expect(parsed.competitors.status).toMatch(/search-not-configured|no-results|error/);
    expect(parsed.competitors.available).toBe(false);
  });
});

describe("facts vs recommendations", () => {
  it("keeps owner positioning as owner and pricing grounding distinct from marketing offers", async () => {
    const input = sampleInput({
      business: {
        name: "Drita",
        idea: "Specialty coffee shop for remote workers",
        offering: "Pour-over coffee and quiet workspace seating",
        stage: "preparing",
        type: "physical",
        category: "food",
        location: "Prishtina, Kosovo",
      },
      customer: { ideal: "Remote workers in Prishtina", type: "b2c" },
      offer: { status: "planned", main: "Specialty pour-over coffee", priceRange: "€2-4" },
      model: { revenue: ["oneTime"], channels: ["store", "social"], budget: "€8,000" },
      market: { positioning: "Calm specialty coffee for focused remote work" },
      brand: { language: "en" },
    });

    const parsed = parseBusinessPackage(await finalPackage(orchestrate(input)))!;
    expect(overviewPositioning(parsed)?.source).toBe("owner");
    expect(parsed.pricing.grounding?.priceBasis).toBeTruthy();
    expect(JSON.stringify(parsed.marketing)).not.toMatch(/\b€2\b|\b€4\b|\d+\s*%\s*off/i);
    expect(parsed.marketResearch.status).toMatch(/search-not-configured|no-results|error|ok/);
  });
});

describe("quality metadata through assembly and parsing", () => {
  it("stores success quality on a complete deterministic run and survives parseBusinessPackage", async () => {
    const pkg = await finalPackage(orchestrate(sampleInput({ brand: { language: "en" } })));
    expect(pkg.meta.quality?.outcome).toBe("success");
    const parsed = parseBusinessPackage(pkg);
    expect(parsed?.meta.quality).toEqual(pkg.meta.quality);
    expect(assessGenerationQuality(parsed!).outcome).toBe("success");
  });

  it("marks critical fallback as degraded without inventing a new event type", async () => {
    const pkg = await finalPackage(orchestrate(sampleInput({ brand: { language: "en" } })));
    const degradedDraft: BusinessPackage = {
      ...pkg,
      meta: {
        ...pkg.meta,
        agentLog: [
          ...pkg.meta.agentLog,
          { agent: "Website Agent", status: "fallback", source: "deterministic", durationMs: 1, note: "llm-invalid-output" },
        ],
        quality: undefined,
      },
    };
    const quality = assessGenerationQuality(degradedDraft);
    expect(quality.outcome).toBe("degraded");
    expect(quality.limitations).toContain("criticalFallback");

    const withQuality = { ...degradedDraft, meta: { ...degradedDraft.meta, quality } };
    const parsed = parseBusinessPackage(withQuality);
    expect(parsed?.meta.quality?.outcome).toBe("degraded");
    expect(packageQuality(parsed!).outcome).toBe("degraded");
  });
});

describe("historical package compatibility", () => {
  it("derives quality when meta.quality is absent after parse", async () => {
    const pkg = await finalPackage(orchestrate(sampleInput({ brand: { language: "en" } })));
    const { quality: _q, ...metaWithout } = pkg.meta;
    const raw = { ...pkg, meta: metaWithout };
    const parsed = parseBusinessPackage(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.meta.quality).toBeUndefined();
    expect(packageQuality(parsed!).outcome).toBe("success");
  });

  it("rejects structurally invalid packages on the existing failure path", () => {
    expect(parseBusinessPackage({ id: "x", createdAt: "bad" })).toBeNull();
    expect(parseBusinessPackage(null)).toBeNull();
  });
});
