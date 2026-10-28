import { discoverySchema, toBusinessInput, type Discovery } from "@/lib/discovery";
import { runResearch } from "@/lib/research/engine";
import type { ResearchDimension, ResearchRunResult } from "@/lib/research/model";
import { planResearch } from "@/lib/research/planner";
import { ResearchProviderError, type RawSearchHit, type ResearchSearchOptions, type ResearchSearchProvider } from "@/lib/research/provider";
import type { BusinessInput } from "@/lib/types";

type DiscoveryOverrides = Partial<{ [K in keyof Discovery]: Partial<Discovery[K]> }>;

export function sampleDiscovery(overrides: DiscoveryOverrides = {}): Discovery {
  return discoverySchema.parse({
    business: { name: "Drita", idea: "Specialty coffee shop", stage: "idea", type: "physical", category: "food", location: "Tirana", ...overrides.business },
    customer: { ideal: "Remote workers", type: "b2c", ...overrides.customer },
    offer: { status: "planned", ...overrides.offer },
    model: { revenue: ["oneTime"], ...overrides.model },
    market: { ...overrides.market },
    brand: { style: "Modern / Minimal", tone: "calm", language: "sq", ...overrides.brand },
    goals: { priority: "launch", ...overrides.goals },
  });
}

export function sampleInput(overrides: DiscoveryOverrides = {}): BusinessInput {
  return toBusinessInput(sampleDiscovery(overrides));
}

export interface RecordedCall {
  query: string;
  options: ResearchSearchOptions;
}

/** Fake provider whose behavior per query is decided by `handler`. Records every call. */
export function fakeProvider(
  handler: (query: string, call: number) => Promise<unknown> | unknown,
  name = "fake",
): ResearchSearchProvider & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  return {
    name,
    calls,
    async search(query, options) {
      calls.push({ query, options });
      return (await handler(query, calls.length - 1)) as RawSearchHit[];
    },
  };
}

export function hit(path: string, overrides: RawSearchHit = {}): RawSearchHit {
  return { title: `Title ${path}`, url: `https://example.com/${path}`, snippet: `Snippet about ${path}.`, ...overrides };
}

export interface ResearchRunOptions {
  /** Hits per successful query (each carries a distinctive "<dimension> signal <n>" snippet). */
  hitsPerQuery?: number;
  failing?: ResearchDimension[];
  snippet?: (dimension: ResearchDimension, n: number) => string;
  provider?: string;
  /** Exact results for some dimensions (replacing the generated ones). */
  results?: Partial<Record<ResearchDimension, RawSearchHit[]>>;
  input?: BusinessInput;
}

/**
 * Fake provider that answers each planned query of `input` by its text (so it
 * works however the engine orders or parallelizes calls); unplanned queries throw.
 */
export function scriptedProvider(options: ResearchRunOptions = {}): ResearchSearchProvider & { calls: RecordedCall[] } {
  const { hitsPerQuery = 2, failing = [], snippet = (d, n) => `${d} signal ${n}.`, provider = "fake", results = {}, input = sampleInput() } = options;
  const byText = new Map(planResearch(input).queries.map((q) => [q.text, q.id]));
  return fakeProvider((query) => {
    const dimension = byText.get(query);
    if (!dimension) throw new Error(`unexpected query "${query}"`);
    if (failing.includes(dimension)) throw new ResearchProviderError("timeout");
    return (
      results[dimension] ??
      Array.from({ length: hitsPerQuery }, (_, n) => hit(`${dimension}-${n}`, { title: `${dimension} title ${n}`, snippet: snippet(dimension, n) }))
    );
  }, provider);
}

/** A real, schema-validated research run produced by the engine with a fake provider. */
export async function researchRun(options: ResearchRunOptions = {}): Promise<ResearchRunResult> {
  return runResearch(options.input ?? sampleInput(), scriptedProvider(options), { now: steppingClock() });
}

/**
 * Competitor-discovery results for `sampleInput()` (specialty coffee shop, remote workers, Tirana):
 * four real businesses mixed with an article, a platform page, a supplier, an irrelevant business,
 * an evidence-less result and a second URL of an already-found business.
 */
export function competitorResults(): Partial<Record<ResearchDimension, RawSearchHit[]>> {
  return {
    competitors: [
      { title: "Tea House Tirana", url: "https://shop.teahouse.al/", snippet: "Specialty tea, an alternative to coffee, served in Tirana." },
      { title: "10 best coffee shops in Tirana", url: "https://guide.example.org/coffee-tirana", snippet: "Our guide to the best coffee in the city." },
    ],
    localCompetitors: [
      { title: "Rio Café | Specialty coffee in Tirana", url: "https://www.riocafe.al/", snippet: "Specialty coffee roasted daily in Tirana. Espresso from 150 ALL." },
      { title: "Rio Café on Instagram", url: "https://www.instagram.com/riocafe", snippet: "Coffee photos from Rio Café." },
      { title: "Some Cafe", url: "https://somecafe.al/", snippet: "" },
    ],
    directCompetitors: [
      { title: "Rio Café – Menu", url: "https://riocafe.al/menu?utm_source=search", snippet: "Specialty coffee and pastries, made in house." },
      { title: "Coffee Bean Wholesale Supplier", url: "https://beans-wholesale.com/", snippet: "Wholesale coffee beans for cafés." },
      { title: "Mulliri Vjetër", url: "https://mulliri.al/", snippet: "Coffee chain with locations across Albania. Free delivery available." },
    ],
    nicheCompetitors: [
      { title: "Nomad Hub - coworking café", url: "https://nomadhub.co.uk/", snippet: "Coffee and coworking for remote workers in Tirana. Free delivery on beans. Desks from €8/day." },
      { title: "Tirana Car Rental", url: "https://cars.al/", snippet: "Rent a car in Tirana." },
    ],
  };
}

/** Clock that advances one second per call, starting at a fixed instant. */
export function steppingClock(start = "2026-10-08T12:00:00.000Z"): () => Date {
  let t = Date.parse(start);
  return () => {
    const d = new Date(t);
    t += 1000;
    return d;
  };
}
