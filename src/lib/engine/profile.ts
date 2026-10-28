import type { BusinessInput } from "@/lib/types";
import { FLEXIBLE_BUDGET } from "@/lib/discovery";
import { detectInputIndustry, type IndustryProfile } from "@/lib/engine/industry";

/**
 * Canonical business profile: one deterministic reading of the owner's input
 * that every generation step shares, so pricing, finance, marketing, the
 * website and the roadmap describe the same business. Each fact records where
 * it came from; nothing here is researched or invented.
 */

export const BUSINESS_MODEL_KINDS = [
  "product",
  "saas",
  "localService",
  "professionalService",
  "foodVenue",
  "marketplace",
  "education",
  "general",
] as const;
export type BusinessModelKind = (typeof BUSINESS_MODEL_KINDS)[number];

/** provided: the owner said so · inferred: derived from their words · assumed: a planning default · unavailable: unknown. */
export type FactBasis = "provided" | "inferred" | "assumed" | "unavailable";

export const PROFILE_FACTS = [
  "modelKind",
  "industry",
  "offer",
  "market",
  "customers",
  "customerType",
  "stage",
  "budget",
  "salesChannels",
  "revenueModel",
  "priceRange",
  "differentiator",
] as const;
export type ProfileFactKey = (typeof PROFILE_FACTS)[number];

export interface ProfileFact {
  key: ProfileFactKey;
  /** The owner's words or a stable identifier; empty when unavailable. */
  value: string;
  basis: FactBasis;
}

/** Areas where the business is likely to face rules, licences or claims that must be checked locally. */
export const CONSIDERATIONS = [
  "cosmeticsSafety",
  "foodHygiene",
  "alcoholTobacco",
  "healthClaims",
  "financialServices",
  "vehicleImport",
  "construction",
  "childcare",
  "transportLicensing",
  "tourismLicensing",
  "realEstate",
  "personalData",
  "importCustoms",
  "employment",
] as const;
export type Consideration = (typeof CONSIDERATIONS)[number];

export interface Budget {
  amount: number;
  currency: string;
  /** Whether the currency was stated or assumed from the market. */
  currencyBasis: "provided" | "assumed";
}

export interface BusinessProfile {
  modelKind: BusinessModelKind;
  modelBasis: "provided" | "inferred" | "assumed";
  industryKey: string;
  industryLabel: string;
  sellsOnline: boolean | null;
  budget: Budget | null;
  facts: ProfileFact[];
  considerations: Consideration[];
  /** Facts whose absence materially limits the analysis. */
  missing: ProfileFactKey[];
}

const words = (list: readonly string[]) =>
  new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${list.map((w) => w.replace(/\s+/g, "\\s+")).join("|")})(?:s|es)?(?=$|[^\\p{L}\\p{N}])`, "iu");

/** "bar" as a venue, not a product shape ("soap bars", "chocolate bar", "bar of soap"). */
const BAR = "(?<!(?:soap|chocolate|granola|protein|energy|candy|cereal|snack|nut|shampoo)\\s)bar(?!s?\\s+of\\s)";

const KIND_SIGNALS: { kind: BusinessModelKind; pattern: RegExp }[] = [
  { kind: "marketplace", pattern: words(["marketplace", "two-sided", "connects buyers", "connects sellers", "connecting buyers", "connecting sellers", "platform connecting", "commission on each booking", "listing platform"]) },
  { kind: "saas", pattern: words(["saas", "software", "app", "mobile app", "web app", "platform", "api", "dashboard", "subscription software", "crm", "scheduling tool", "ai tool"]) },
  { kind: "education", pattern: words(["course", "online course", "academy", "tutoring", "school", "bootcamp", "training program", "workshop", "lessons", "classes"]) },
  { kind: "foodVenue", pattern: words(["restaurant", "cafe", "café", "coffee shop", "bakery", BAR, "bistro", "food truck", "catering", "pizzeria", "kitchen", "furrë", "kafene", "restorant"]) },
  { kind: "localService", pattern: words(["cleaning", "plumbing", "plumber", "electrician", "repair", "auto repair", "car repair", "mechanic", "mekanik", "workshop", "officina", "detailing", "car wash", "landscaping", "gardening", "moving", "handyman", "salon", "barber", "nail", "renovation", "construction", "painting", "pest control", "laundry", "childcare", "dog walking", "pet grooming", "personal trainer", "gym", "courier", "delivery service", "tour", "tours"]) },
  { kind: "professionalService", pattern: words(["consulting", "consultancy", "agency", "marketing agency", "web development", "web agency", "software agency", "digital agency", "accounting", "bookkeeping", "legal", "law firm", "design studio", "recruiting", "advisory", "freelance", "architecture", "real estate agency", "photography"]) },
  { kind: "product", pattern: words(["online store", "e-commerce", "ecommerce", "shop", "store", "brand", "products", "cosmetics", "skincare", "clothing", "fashion", "apparel", "boutique", "jewelry", "jewellery", "furniture", "manufacturing", "manufacture", "import", "wholesale", "honey", "olive oil", "candles", "handmade", "dealership", "car dealer", "auto dealer", "vehicle sales"]) },
];

const CATEGORY_KIND: Record<string, BusinessModelKind | undefined> = {
  software: "saas",
  food: "foodVenue",
  ecommerce: "product",
};

const LOCAL_SERVICE = words(["cleaning", "plumbing", "plumber", "electrician", "repair", "detailing", "landscaping", "moving", "handyman", "salon", "barber", "renovation", "construction", "painting", "laundry", "childcare", "gym", "trainer", "courier", "delivery", "tour"]);

function classifyModel(input: BusinessInput, text: string): { kind: BusinessModelKind; basis: BusinessProfile["modelBasis"] } {
  const d = input.discovery;
  const revenue = d?.model.revenue ?? [];
  const firstSignal = (pattern: RegExp) => pattern.test(text);

  if (KIND_SIGNALS[0]!.pattern.test(text) || (revenue.includes("commission") && /platform|marketplace|app/i.test(text))) {
    return { kind: "marketplace", basis: "inferred" };
  }
  const category = d?.business.category;
  if (category && CATEGORY_KIND[category]) {
    // An online-only "food" business that sells packaged goods is a product business.
    if (category === "food" && d?.business.type === "online" && !firstSignal(words(["restaurant", "cafe", "café", "delivery", "catering"]))) {
      return { kind: "product", basis: "inferred" };
    }
    return { kind: CATEGORY_KIND[category]!, basis: "provided" };
  }
  if (category === "services") {
    if (LOCAL_SERVICE.test(text) || d?.business.type === "physical") return { kind: "localService", basis: "inferred" };
    if (firstSignal(KIND_SIGNALS.find((k) => k.kind === "education")!.pattern)) return { kind: "education", basis: "inferred" };
    return { kind: "professionalService", basis: "inferred" };
  }
  for (const { kind, pattern } of KIND_SIGNALS) {
    if (pattern.test(text)) return { kind, basis: "inferred" };
  }
  return { kind: "general", basis: "assumed" };
}

const CONSIDERATION_SIGNALS: { key: Consideration; pattern: RegExp }[] = [
  { key: "cosmeticsSafety", pattern: words(["cosmetic", "cosmetics", "skincare", "skin care", "makeup", "serum", "cream", "lotion", "perfume", "fragrance", "soap", "sunscreen", "haircare", "kozmetik"]) },
  { key: "foodHygiene", pattern: words(["food", "restaurant", "cafe", "café", "bakery", "catering", "kitchen", "honey", "olive oil", "dairy", "meat", "snack", "beverage", "drinks", "juice", "furrë", "byrek"]) },
  { key: "alcoholTobacco", pattern: words(["alcohol", "wine", "beer", "spirits", "liquor", "cocktail", BAR, "tobacco", "vape", "shisha", "rakia"]) },
  { key: "healthClaims", pattern: words(["supplement", "supplements", "medical", "clinic", "health", "therapy", "pharmacy", "dental", "nutrition", "wellness", "cbd", "diet"]) },
  { key: "financialServices", pattern: words(["loan", "loans", "lending", "payments", "payment app", "crypto", "investment", "insurance", "fintech", "money transfer", "credit"]) },
  { key: "vehicleImport", pattern: words(["car import", "import cars", "importing cars", "vehicle import", "used cars", "car dealership", "dealership"]) },
  { key: "construction", pattern: words(["construction", "renovation", "building", "contractor", "roofing", "electrical installation", "scaffolding"]) },
  { key: "childcare", pattern: words(["childcare", "kindergarten", "nursery", "daycare", "babysitting", "kids club"]) },
  { key: "transportLicensing", pattern: words(["taxi", "transport", "courier", "delivery service", "logistics", "freight", "trucking", "moving company", "ride"]) },
  { key: "tourismLicensing", pattern: words(["tour", "tours", "travel agency", "hotel", "hostel", "guesthouse", "excursion", "tourism"]) },
  { key: "realEstate", pattern: words(["real estate", "property", "properties", "realtor", "lettings", "rentals", "property management"]) },
  { key: "importCustoms", pattern: words(["import", "importing", "imported", "export", "dropshipping", "wholesale", "sourcing from"]) },
];

const PERSONAL_DATA = words(["app", "software", "saas", "platform", "crm", "booking", "appointments", "customer data", "online store", "e-commerce", "ecommerce", "subscription", "health"]);
const STAFF = words(["staff", "employees", "team of", "hire", "hiring", "workers", "cleaners", "drivers", "waiters", "chefs"]);

const CURRENCY_SYMBOLS: { pattern: RegExp; code: string }[] = [
  { pattern: /€|\beur(?:o|os)?\b/i, code: "EUR" },
  { pattern: /\$|\busd\b|\bdollars?\b/i, code: "USD" },
  { pattern: /£|\bgbp\b|\bpounds?\b/i, code: "GBP" },
  { pattern: /\bALL\b|\b[Ll]ek[eë]?(?![\p{L}])/u, code: "ALL" },
  { pattern: /\bchf\b/i, code: "CHF" },
];

const ALBANIA = /\b(albania|shqip[eë]ri|tiran[aë]|durr[eë]s|vlor[eë]|shkod[eë]r|kor[cç][eë]|elbasan)\b/i;

/** Market currency when the owner names none: lek in Albania, otherwise the euro (Kosovo and the EU). */
function marketCurrency(location: string): string {
  return ALBANIA.test(location) ? "ALL" : "EUR";
}

const ZERO_WORDS = /^(?:zero|nothing|nil|asgj[eë]|zero\s+\p{L}+)$/iu;

/**
 * Reads a budget the owner typed ("€8,000", "8.000 EUR", "3k", "5000-8000").
 * Ranges use their lower bound so plans never assume more money than stated.
 * Returns null when no budget was given; an explicit "0" or "zero" is a real budget of 0.
 */
export function parseBudget(text: string | undefined, location = ""): Budget | null {
  if (!text || text.trim().toLowerCase() === FLEXIBLE_BUDGET) return null;
  const stated = CURRENCY_SYMBOLS.find((c) => c.pattern.test(text));
  const currency = { currency: stated?.code ?? marketCurrency(location), currencyBasis: stated ? ("provided" as const) : ("assumed" as const) };
  if (ZERO_WORDS.test(text.trim())) return { amount: 0, ...currency };
  const match = text.match(/(\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d+)?)\s*(k|m|mijë|mije|thousand|million)?/i);
  if (!match) return null;
  let raw = match[1]!;
  if (/^\d{1,3}(?:[.,\s]\d{3})+$/.test(raw)) raw = raw.replace(/[.,\s]/g, "");
  else raw = raw.replace(",", ".");
  let amount = Number(raw);
  const unit = match[2]?.toLowerCase();
  if (unit === "k" || unit === "thousand" || unit === "mijë" || unit === "mije") amount *= 1_000;
  if (unit === "m" || unit === "million") amount *= 1_000_000;
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) return null;
  return { amount: Math.round(amount), ...currency };
}

function profileText(input: BusinessInput): string {
  const d = input.discovery;
  return [input.idea, d?.business.offering, d?.offer.main, d?.offer.others, d?.business.name]
    .filter(Boolean)
    .join(" \n ");
}

export function buildBusinessProfile(input: BusinessInput, industry: IndustryProfile = detectInputIndustry(input)): BusinessProfile {
  const d = input.discovery;
  const text = profileText(input);
  const { kind, basis } = classifyModel(input, text);
  const budget = parseBudget(input.budget, input.location);
  const facts: ProfileFact[] = [];
  const fact = (key: ProfileFactKey, value: string | undefined, factBasis: FactBasis) =>
    facts.push({ key, value: value?.trim() ?? "", basis: value?.trim() ? factBasis : "unavailable" });

  const offer =
    d?.offer.main?.trim() || d?.business.offering?.trim() || (input.idea.trim() ? input.idea.trim() : undefined);
  const offerBasis: FactBasis = d?.offer.main?.trim() || d?.business.offering?.trim() ? "provided" : input.idea.trim() ? "provided" : "unavailable";

  fact("modelKind", kind, basis === "provided" ? "provided" : basis);
  // Industry label is inferred taxonomy — never override a more specific owner offer below.
  fact("industry", industry.label, "inferred");
  fact("offer", offer, offerBasis);
  fact("market", input.location, "provided");
  fact("customers", input.audience, "provided");
  fact("customerType", d?.customer.type, "provided");
  fact("stage", d?.business.stage, "provided");
  fact("budget", budget ? `${budget.amount} ${budget.currency}` : undefined, budget?.currencyBasis === "assumed" ? "inferred" : "provided");
  fact("salesChannels", d?.model.channels.join(", "), "provided");
  fact("revenueModel", d?.model.revenue.join(", "), "provided");
  fact("priceRange", d?.offer.priceUnknown ? "" : d?.offer.priceRange, "provided");
  fact("differentiator", d?.offer.differentiator || d?.market.difference, "provided");

  const considerations: Consideration[] = CONSIDERATION_SIGNALS.filter((c) => c.pattern.test(text)).map((c) => c.key);
  if (kind === "saas" || kind === "marketplace" || PERSONAL_DATA.test(text) || d?.model.channels.includes("website")) {
    considerations.push("personalData");
  }
  if (STAFF.test(text) || kind === "foodVenue" || (kind === "localService" && (budget?.amount ?? 0) > 20_000)) {
    considerations.push("employment");
  }

  const missing = (["budget", "priceRange", "differentiator", "salesChannels"] as const).filter(
    (key) => facts.find((f) => f.key === key)?.basis === "unavailable",
  );

  return {
    modelKind: kind,
    modelBasis: basis,
    industryKey: industry.key,
    industryLabel: industry.label,
    sellsOnline: d ? d.business.type !== "physical" : null,
    budget,
    facts,
    considerations: [...new Set(considerations)],
    missing,
  };
}

/** Plain-language summary of the profile for LLM prompts: facts are labelled with their basis. */
export function renderProfile(profile: BusinessProfile): string {
  const lines = profile.facts
    .filter((f) => f.basis !== "unavailable")
    .map((f) => `- ${f.key}: ${f.value} (${f.basis === "provided" ? "owner-provided" : f.basis})`);
  const offer = profile.facts.find((f) => f.key === "offer" && f.basis !== "unavailable");
  const industry = profile.facts.find((f) => f.key === "industry");
  const specificity =
    offer && industry
      ? `\nPrefer the owner offer over the broad industry label when they differ. Industry "${industry.value}" is taxonomy only.`
      : "";
  const missing = profile.missing.length ? `\nNot provided by the owner (state assumptions instead of inventing facts): ${profile.missing.join(", ")}` : "";
  return `Canonical business profile:\n${lines.join("\n")}${specificity}${missing}`;
}

/**
 * Soft readiness gate: generation may proceed, but missing material facts should
 * be labelled as assumptions. Never blocks solely because optional details are absent.
 */
export function contextReadiness(profile: BusinessProfile): {
  ready: true;
  warnings: ProfileFactKey[];
  blocking: ProfileFactKey[];
} {
  const material: ProfileFactKey[] = ["customers", "market", "industry"];
  const blocking = material.filter((key) => {
    const fact = profile.facts.find((f) => f.key === key);
    return !fact || fact.basis === "unavailable" || !fact.value.trim();
  });
  return {
    ready: true,
    warnings: profile.missing,
    blocking,
  };
}
