import "server-only";
import type {
  AgentKey,
  AgentLogEntry,
  BusinessInput,
  BusinessPackage,
  LogoAsset,
  OrchestrationEvent,
} from "@/lib/types";
import { runStrategyAgent } from "@/lib/agents/strategy";
import { themeFromBrand } from "@/lib/website/theme";
import { uid } from "@/lib/utils";
import { createContext, type ContextOptions, type GenerationContext } from "@/lib/agents/context";
import { knownMarketLocation } from "@/lib/agents/copy-brief";
import { ownerName, runBrandAgent, type VerbalIdentity } from "@/lib/agents/brand";
import { runDesignAgent } from "@/lib/agents/design";
import { runLogoAgent, emptyLogo } from "@/lib/agents/logo";
import { runPersonaAgent } from "@/lib/agents/persona";
import { runCompetitorAgent } from "@/lib/agents/competitor";
import { runMarketAgent } from "@/lib/agents/market";
import { getSearchProvider } from "@/lib/services/search";
import { runPricingAgent } from "@/lib/agents/pricing";
import { UNPRICED } from "@/lib/pricing/strategy";
import { runWebsiteAgent } from "@/lib/agents/website";
import { runSeoAgent } from "@/lib/agents/seo";
import { runMarketingAgent } from "@/lib/agents/marketing";
import { runEmailAgent } from "@/lib/agents/email";
import { runWhatsAppAgent } from "@/lib/agents/whatsapp";
import { runGrowthAgent } from "@/lib/agents/growth";
import { runLaunchAgent } from "@/lib/agents/launch";
import { assessGenerationQuality } from "@/lib/generation-quality";
import { resolveLlmProvider } from "@/lib/ai/provider";

interface Step {
  key: AgentKey;
  label: string;
}

/** Ordered pipeline presented to the UI. */
const STEPS: Step[] = [
  { key: "brand", label: "Brand Agent" },
  { key: "design", label: "Design Agent" },
  { key: "logo", label: "Logo Agent" },
  { key: "persona", label: "Persona Agent" },
  { key: "competitor", label: "Competitor Agent" },
  { key: "market", label: "Market Research Agent" },
  { key: "pricing", label: "Pricing Agent" },
  { key: "strategy", label: "Strategy Agent" },
  { key: "website", label: "Website Agent" },
  { key: "seo", label: "SEO Agent" },
  { key: "marketing", label: "Marketing Agent" },
  { key: "email", label: "Email Agent" },
  { key: "whatsapp", label: "WhatsApp Agent" },
  { key: "growth", label: "Growth Agent" },
  { key: "launch", label: "Launch Agent" },
  { key: "publisher", label: "Publisher Agent" },
];

export function pipelineSteps(): Step[] {
  return STEPS;
}

/**
 * Central orchestration engine. Runs every agent in dependency order, isolates
 * failures so one agent can never crash the pipeline, streams progress events,
 * and emits a fully-assembled {@link BusinessPackage} on completion.
 */
export interface OrchestrateOptions extends ContextOptions {
  /** Business the run writes to; used only to correlate server logs. */
  businessId?: string;
  /**
   * Unix ms deadline for this request (platform `maxDuration` soft stop).
   * When exceeded, orchestration stops without emitting `complete` so the route
   * can mark the row failed honestly. Does not invent a background worker.
   */
  deadlineAt?: number;
}

type StepOutput<T> = {
  data: T;
  source: "llm" | "deterministic";
  note?: string;
  modelId?: string;
  costUsd?: number;
  costEstimated?: true;
};

/** Honest stream messages — never claim recovery when the step has no usable fallback. */
const FATAL_STEP_ERROR: Partial<Record<AgentKey, string>> = {
  design: "Design could not be assembled — generation will fail.",
  website: "Website could not be generated.",
};

/** Internal control-flow for soft deadline; never escapes `orchestrate`. */
class GenerationDeadlineAbort extends Error {
  constructor() {
    super("time-budget");
    this.name = "GenerationDeadlineAbort";
  }
}

export async function* orchestrate(input: BusinessInput, options: OrchestrateOptions = {}): AsyncGenerator<OrchestrationEvent> {
  const startedAt = Date.now();
  const runId = uid("run");
  const ctx = createContext(input, options);
  const log: AgentLogEntry[] = [];
  let completed = 0;
  const total = STEPS.length;

  const progress = () => Math.round((completed / total) * 100);

  function pastDeadline(): boolean {
    return typeof options.deadlineAt === "number" && Date.now() >= options.deadlineAt;
  }

  function record(key: AgentKey, entry: AgentLogEntry) {
    log.push({ ...entry, agentKey: entry.agentKey ?? key });
    logStep(runId, options.businessId, key, entry);
  }

  async function* finishStep<T>(
    key: AgentKey,
    label: string,
    t0: number,
    outcome: { out: StepOutput<T> } | { err: unknown },
  ): AsyncGenerator<OrchestrationEvent, T | null> {
    completed++;
    if ("out" in outcome) {
      const { out } = outcome;
      record(key, {
        agent: label,
        agentKey: key,
        status: out.note ? "fallback" : "ok",
        source: out.source,
        durationMs: Date.now() - t0,
        note: out.note,
        ...(out.modelId ? { modelId: out.modelId } : {}),
        ...(typeof out.costUsd === "number" ? { costUsd: out.costUsd, costEstimated: true as const } : {}),
      });
      // `fallback: true` only when a note explains recovery (timeout, invalid schema, …).
      // Intentional deterministic steps have no note and must not look like failures.
      yield {
        type: "agent-complete",
        agent: key,
        label,
        progress: progress(),
        source: out.source,
        ...(out.note ? { fallback: true as const } : {}),
      };
      return out.data;
    }
    const message = outcome.err instanceof Error ? outcome.err.message.slice(0, 200) : "unknown error";
    record(key, { agent: label, agentKey: key, status: "error", source: "deterministic", durationMs: Date.now() - t0, note: message });
    const streamMessage =
      FATAL_STEP_ERROR[key] ??
      (key === "website"
        ? "Website could not be generated."
        : "Step failed — using the best available local fallback when one exists.");
    yield { type: "agent-error", agent: key, label, progress: progress(), message: streamMessage };
    return null;
  }

  // Helper to run a step with isolation + logging + events.
  async function* runStep<T>(
    key: AgentKey,
    label: string,
    fn: () => Promise<StepOutput<T>> | StepOutput<T>,
  ): AsyncGenerator<OrchestrationEvent, T | null> {
    if (pastDeadline()) {
      yield {
        type: "error",
        businessId: options.businessId,
        message: "time-budget",
        progress: progress(),
      };
      throw new GenerationDeadlineAbort();
    }
    const t0 = Date.now();
    yield { type: "agent-start", agent: key, label, progress: progress() };
    let outcome: { out: StepOutput<T> } | { err: unknown };
    try {
      outcome = { out: await fn() };
    } catch (err) {
      outcome = { err };
    }
    return yield* finishStep(key, label, t0, outcome);
  }

  try {
  if (pastDeadline()) {
    yield { type: "error", businessId: options.businessId, message: "time-budget", progress: 0 };
    return;
  }

  // PHASE 1 — Brand (verbal) then design (full brand). Sequential: design needs verbal.
  const verbal = (yield* runStep<VerbalIdentity>("brand", "Brand Agent", () => runBrandAgent(ctx))) ?? safeVerbal(ctx);

  const brand =
    (yield* runStep("design", "Design Agent", () => runDesignAgent(ctx, verbal))) ?? throwIfNull("design");
  ctx.brand = brand;

  // Logo only needs the brand — run beside research / planning (not on the critical path).
  const logoStarted = Date.now();
  yield { type: "agent-start", agent: "logo", label: "Logo Agent", progress: progress() };
  const logoRun: Promise<{ out: StepOutput<LogoAsset> } | { err: unknown }> = Promise.resolve()
    .then(() => runLogoAgent(ctx, brand))
    .then((out) => ({ out }), (err: unknown) => ({ err }));

  // PHASE 2 — Persona, competitors, market, and pricing are independent given brand + research.
  // Pricing uses research evidence + input only (not persona/competitors), so it shares this wave.
  if (pastDeadline()) {
    yield { type: "error", businessId: options.businessId, message: "time-budget", progress: progress() };
    throw new GenerationDeadlineAbort();
  }
  const researchStarted = Date.now();
  for (const s of [
    { key: "persona" as const, label: "Persona Agent" },
    { key: "competitor" as const, label: "Competitor Agent" },
    { key: "market" as const, label: "Market Research Agent" },
    { key: "pricing" as const, label: "Pricing Agent" },
  ]) {
    yield { type: "agent-start", agent: s.key, label: s.label, progress: progress() };
  }
  const [personaOutcome, competitorOutcome, marketOutcome, pricingOutcome] = await Promise.all([
    Promise.resolve()
      .then(() => runPersonaAgent(ctx))
      .then((out) => ({ out }) as const, (err: unknown) => ({ err }) as const),
    Promise.resolve()
      .then(() => runCompetitorAgent(ctx))
      .then((out) => ({ out }) as const, (err: unknown) => ({ err }) as const),
    Promise.resolve()
      .then(() => runMarketAgent(ctx))
      .then((out) => ({ out }) as const, (err: unknown) => ({ err }) as const),
    Promise.resolve()
      .then(() => runPricingAgent(ctx))
      .then((out) => ({ out }) as const, (err: unknown) => ({ err }) as const),
  ]);
  const persona =
    (yield* finishStep("persona", "Persona Agent", researchStarted, personaOutcome)) ?? fallbackPersona(ctx);
  ctx.persona = persona;
  const competitors =
    (yield* finishStep("competitor", "Competitor Agent", researchStarted, competitorOutcome)) ??
    fallbackCompetitors();
  ctx.competitors = competitors;
  const marketResearch =
    (yield* finishStep("market", "Market Research Agent", researchStarted, marketOutcome)) ?? fallbackMarket();
  const pricing =
    (yield* finishStep("pricing", "Pricing Agent", researchStarted, pricingOutcome)) ?? fallbackPricing();
  ctx.pricing = pricing;

  // PHASE 3 — Strategy depends on pricing (and benefits from research context already on ctx).
  const strategy = (yield* runStep("strategy", "Strategy Agent", () => runStrategyAgent(ctx))) ?? undefined;
  ctx.strategy = strategy;

  // PHASE 4 — Downstream specialists that share the canonical brand/pricing/persona.
  // Website, marketing, email, whatsapp, growth, launch do not depend on each other.
  // SEO needs website pages: start as soon as website resolves so it overlaps the rest of the wave.
  if (pastDeadline()) {
    yield { type: "error", businessId: options.businessId, message: "time-budget", progress: progress() };
    throw new GenerationDeadlineAbort();
  }
  const prodStarted = Date.now();
  const productionSpecs = [
    { key: "website" as const, label: "Website Agent" },
    { key: "marketing" as const, label: "Marketing Agent" },
    { key: "email" as const, label: "Email Agent" },
    { key: "whatsapp" as const, label: "WhatsApp Agent" },
    { key: "growth" as const, label: "Growth Agent" },
    { key: "launch" as const, label: "Launch Agent" },
    { key: "seo" as const, label: "SEO Agent" },
  ];
  for (const s of productionSpecs) {
    yield { type: "agent-start", agent: s.key, label: s.label, progress: progress() };
  }
  const websiteRun = Promise.resolve()
    .then(() => runWebsiteAgent(ctx, brand, pricing))
    .then((out) => ({ out }) as const, (err: unknown) => ({ err }) as const);
  const seoRun = websiteRun.then((websiteOutcome) => {
    const pages =
      "out" in websiteOutcome && websiteOutcome.out.data && Array.isArray(websiteOutcome.out.data.pages)
        ? websiteOutcome.out.data.pages
        : [];
    return Promise.resolve()
      .then(() => runSeoAgent(ctx, brand, pages))
      .then((out) => ({ out }) as const, (err: unknown) => ({ err }) as const);
  });
  const [
    websiteOutcome,
    marketingOutcome,
    emailOutcome,
    whatsappOutcome,
    growthOutcome,
    launchOutcome,
    seoOutcome,
  ] = await Promise.all([
    websiteRun,
    Promise.resolve()
      .then(() => runMarketingAgent(ctx, brand, persona))
      .then((out) => ({ out }) as const, (err: unknown) => ({ err }) as const),
    Promise.resolve()
      .then(() => runEmailAgent(ctx, brand))
      .then((out) => ({ out }) as const, (err: unknown) => ({ err }) as const),
    Promise.resolve()
      .then(() => runWhatsAppAgent(ctx, brand))
      .then((out) => ({ out }) as const, (err: unknown) => ({ err }) as const),
    Promise.resolve()
      .then(() => runGrowthAgent(ctx, brand))
      .then((out) => ({ out }) as const, (err: unknown) => ({ err }) as const),
    Promise.resolve()
      .then(() => runLaunchAgent(ctx, brand))
      .then((out) => ({ out }) as const, (err: unknown) => ({ err }) as const),
    seoRun,
  ]);
  // Finish in stable UI order (same wall-clock start for duration attribution).
  const websiteCore =
    (yield* finishStep("website", "Website Agent", prodStarted, websiteOutcome)) ??
    { pages: [], navItems: [], footerColumns: [] };
  const marketingCore =
    (yield* finishStep("marketing", "Marketing Agent", prodStarted, marketingOutcome)) ??
    { strategy: fallbackMarketingStrategy(), instagram: [], facebookAds: [] };
  const email =
    (yield* finishStep("email", "Email Agent", prodStarted, emailOutcome)) ??
    { name: "Welcome Sequence", goal: "Convert subscribers", sequence: [] };
  const whatsapp =
    (yield* finishStep("whatsapp", "WhatsApp Agent", prodStarted, whatsappOutcome)) ??
    { name: "Concierge", goal: "Qualify leads", nodes: [] };
  const growthCore =
    (yield* finishStep("growth", "Growth Agent", prodStarted, growthOutcome)) ??
    { phases: [], salesFunnel: [] };
  const launch =
    (yield* finishStep("launch", "Launch Agent", prodStarted, launchOutcome)) ?? fallbackLaunch();
  const seo =
    (yield* finishStep("seo", "SEO Agent", prodStarted, seoOutcome)) ?? fallbackSeo(brand);

  if (pastDeadline()) {
    yield { type: "error", businessId: options.businessId, message: "time-budget", progress: progress() };
    throw new GenerationDeadlineAbort();
  }
  brand.logo = (yield* finishStep("logo", "Logo Agent", logoStarted, await logoRun)) ?? emptyLogo("error");
  // The website was built before the logo finished; its theme carries the logo URL.
  const website = "spec" in websiteCore && websiteCore.spec
    ? { ...websiteCore, spec: { ...websiteCore.spec, theme: themeFromBrand(brand) }, seo }
    : { ...websiteCore, seo };

  // 13. Publisher — assemble final package and assess quality before the terminal event.
  if (pastDeadline()) {
    yield { type: "error", businessId: options.businessId, message: "time-budget", progress: progress() };
    throw new GenerationDeadlineAbort();
  }
  yield { type: "agent-start", agent: "publisher", label: "Publisher Agent", progress: progress() };

  completed++;
  record("publisher", { agent: "Publisher Agent", status: "ok", source: "deterministic", durationMs: 0 });

  const usedLlm = log.some((l) => l.source === "llm");
  const allDet = log.every((l) => l.source === "deterministic");
  const estimatedCostUsd = sumEstimatedCostUsd(log);
  const llmAtEnd = resolveLlmProvider();
  const metaWithoutQuality = {
    engine: (allDet ? "deterministic" : usedLlm ? "hybrid" : "deterministic") as BusinessPackage["meta"]["engine"],
    searchProvider: getSearchProvider(),
    // Provenance of configuration for this run — not proof every step called the provider.
    llmProvider: llmAtEnd.configured ? llmAtEnd.kind : null,
    llmSelectionReason: llmAtEnd.selectionReason,
    durationMs: Date.now() - startedAt,
    agentLog: log,
    runId,
    ...(estimatedCostUsd != null ? { estimatedCostUsd } : {}),
  };
  const draft: BusinessPackage = {
    id: uid("biz"),
    createdAt: new Date().toISOString(),
    input,
    brand,
    website,
    marketing: {
      strategy: marketingCore.strategy,
      instagram: marketingCore.instagram,
      facebookAds: marketingCore.facebookAds,
      email,
      whatsapp,
    },
    competitors,
    marketResearch,
    pricing,
    persona,
    salesFunnel: growthCore.salesFunnel,
    growth: growthCore.phases,
    launch,
    ...(strategy ? { strategy } : {}),
    meta: metaWithoutQuality,
  };
  const quality = assessGenerationQuality(draft);
  const pkg: BusinessPackage = { ...draft, meta: { ...metaWithoutQuality, quality } };

  yield { type: "agent-complete", agent: "publisher", label: "Publisher Agent", progress: 100 };
  // Always `complete` when a structurally assemblable package exists; quality.outcome
  // distinguishes success / provisional / degraded without a new incompatible event type.
  yield { type: "complete", progress: 100, result: pkg };
  } catch (err) {
    if (err instanceof GenerationDeadlineAbort) return;
    throw err;
  }
}

/**
 * One line per step so an incomplete package can be traced from the UI (run id
 * in package meta) to the server. Notes are internal codes, never prompts,
 * provider responses or credentials.
 */
function logStep(runId: string, businessId: string | undefined, key: AgentKey, entry: AgentLogEntry) {
  const model = entry.modelId ? ` model=${entry.modelId}` : "";
  const cost =
    typeof entry.costUsd === "number" ? ` costUsd~=${entry.costUsd.toFixed(6)}${entry.costEstimated ? "(est)" : ""}` : "";
  const line = `[generation] run=${runId}${businessId ? ` business=${businessId}` : ""} step=${key} status=${entry.status} source=${entry.source} ms=${entry.durationMs}${model}${cost}${entry.note ? ` note=${entry.note.replace(/\s+/g, " ").slice(0, 200)}` : ""}`;
  if (entry.status === "error") console.error(line);
  else if (process.env.NODE_ENV !== "test") console.info(line);
}

/** Sums per-step catalog estimates; returns null when no step reported a cost. */
function sumEstimatedCostUsd(log: readonly AgentLogEntry[]): number | null {
  let sum = 0;
  let any = false;
  for (const entry of log) {
    if (typeof entry.costUsd === "number" && Number.isFinite(entry.costUsd) && entry.costUsd >= 0) {
      sum += entry.costUsd;
      any = true;
    }
  }
  return any ? sum : null;
}

/* ---- Last-resort fallbacks (only used if an agent throws unexpectedly) ---- */

function safeVerbal(ctx: GenerationContext): VerbalIdentity {
  const name = ownerName(ctx) ?? ctx.industry.roots[0] ?? "Nova";
  const offering = ctx.input.discovery?.offer.main?.trim() || ctx.input.discovery?.business.offering?.trim() || ctx.input.idea;
  const place = knownMarketLocation(ctx.input.location);
  const audience = ctx.input.audience.trim();
  const description = [
    `${name} focuses on ${offering}.`,
    audience ? `It is for ${audience}.` : null,
    place ? `Based in ${place}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    name,
    slogan: "Built for what's next.",
    description,
    mission: `Help people get ${offering}.`,
    vision: `Grow ${name} carefully with real customer feedback.`,
    values: ["Quality", "Honesty", "Care", "Craft"],
    voice: ["Clear", "Confident", "Human"],
    personality: ["Thoughtful", "Reliable"],
    logoConcept: "A clean, modern mark.",
  };
}

function throwIfNull(agent: string): never {
  throw new Error(`Critical agent "${agent}" failed without a fallback.`);
}

function fallbackPersona(ctx: GenerationContext) {
  return {
    name: "Alex",
    archetype: "The Practical Buyer",
    age: "30–45",
    occupation: "Professional",
    bio: `A representative member of ${ctx.input.audience}.`,
    goals: ["Find a reliable option", "Get great value"],
    painPoints: ["Inconsistent quality", "Poor service"],
    channels: ["Instagram", "Google", "Email"],
    objections: ["Is it worth it?", "Can I trust them?"],
    quote: `"I just want something that works."`,
  };
}

function fallbackCompetitors() {
  return {
    available: false,
    status: "error" as const,
    provider: null,
    queries: [],
    marketOverview: "",
    competitors: [],
    swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
    differentiation: [],
    opportunityGaps: [],
    sources: [],
  };
}

function fallbackMarket() {
  return {
    available: false,
    status: "error" as const,
    provider: null,
    queries: [],
    summary: "",
    trends: [],
    painPoints: [],
    demandSignals: [],
    opportunities: [],
    sources: [],
  };
}

/** Used only if the pricing step throws: structure without prices, since nothing supports any price. */
function fallbackPricing() {
  return {
    model: "Tiered packages",
    rationale: "Pricing could not be generated, so tier prices are left to be validated.",
    tiers: [
      { name: "Starter", price: UNPRICED, cadence: "", tagline: "Suggested starting package.", features: ["Focused on the main offer"], highlighted: false, cta: "Request a quote" },
      { name: "Growth", price: UNPRICED, cadence: "", tagline: "Suggested main package.", features: ["Builds on Starter", "Centered on the main offer"], highlighted: true, cta: "Request a quote" },
      { name: "Premium", price: UNPRICED, cadence: "", tagline: "Suggested higher-scope package.", features: ["Builds on Growth", "More scope around the main offer"], highlighted: false, cta: "Talk to us" },
    ],
    psychology: ["Highlight Growth as the suggested default — strategy, not evidence of popularity."],
    upsells: ["Add-on services"],
  };
}

function fallbackSeo(brand: { name: string; slogan: string; description: string }) {
  return {
    title: `${brand.name} — ${brand.slogan}`,
    metaDescription: brand.description.slice(0, 155),
    keywords: [brand.name.toLowerCase()],
    ogTitle: brand.name,
    ogDescription: brand.slogan,
    slugStructure: [{ page: "Home", slug: "/" }],
    jsonLd: { "@context": "https://schema.org", "@type": "Organization", name: brand.name },
    sitemap: ["/"],
  };
}

function fallbackMarketingStrategy() {
  return {
    positioning: "A differentiated brand built around customer experience.",
    channels: [{ channel: "Instagram", rationale: "High-intent audience", budgetPercent: 50 }, { channel: "Email", rationale: "Owned audience", budgetPercent: 50 }],
    messaging: ["Built for you."],
    kpis: [{ metric: "Conversion rate", target: "Measure a baseline in the first 30 days" }],
    contentPillars: [{ pillar: "Brand stories", description: "Build trust.", sampleTopics: ["Behind the scenes"] }],
    calendar: [{ week: 1, theme: "Launch", deliverables: ["3 posts"] }],
  };
}

function fallbackLaunch() {
  return {
    summary: "A focused launch sprint.",
    prelaunch: [{ task: "Finalize assets", timing: "T-7 days" }],
    launchDay: [{ task: "Announce launch", channel: "Social" }],
    postlaunch: [{ task: "Collect reviews", timing: "Day +3" }],
    checklist: [{ item: "Website live", done: false }],
  };
}
