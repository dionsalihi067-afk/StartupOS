import "server-only";
import type {
  AgentKey,
  AgentLogEntry,
  BusinessInput,
  BusinessPackage,
  OrchestrationEvent,
} from "@/lib/types";
import { uid } from "@/lib/utils";
import { createContext, type GenerationContext } from "@/lib/agents/context";
import { runBrandAgent, type VerbalIdentity } from "@/lib/agents/brand";
import { runDesignAgent } from "@/lib/agents/design";
import { runLogoAgent, emptyLogo } from "@/lib/agents/logo";
import { runPersonaAgent } from "@/lib/agents/persona";
import { runCompetitorAgent } from "@/lib/agents/competitor";
import { runMarketAgent } from "@/lib/agents/market";
import { getSearchProvider } from "@/lib/services/search";
import { runPricingAgent } from "@/lib/agents/pricing";
import { runWebsiteAgent } from "@/lib/agents/website";
import { runSeoAgent } from "@/lib/agents/seo";
import { runMarketingAgent } from "@/lib/agents/marketing";
import { runEmailAgent } from "@/lib/agents/email";
import { runWhatsAppAgent } from "@/lib/agents/whatsapp";
import { runGrowthAgent } from "@/lib/agents/growth";
import { runLaunchAgent } from "@/lib/agents/launch";

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
export async function* orchestrate(input: BusinessInput): AsyncGenerator<OrchestrationEvent> {
  const startedAt = Date.now();
  const ctx = createContext(input);
  const log: AgentLogEntry[] = [];
  let completed = 0;
  const total = STEPS.length;

  const progress = () => Math.round((completed / total) * 100);

  // Helper to run a step with isolation + logging + events.
  async function* runStep<T>(
    key: AgentKey,
    label: string,
    fn: () => Promise<{ data: T; source: "llm" | "deterministic"; note?: string }> | { data: T; source: "llm" | "deterministic"; note?: string },
  ): AsyncGenerator<OrchestrationEvent, T | null> {
    const t0 = Date.now();
    yield { type: "agent-start", agent: key, label, progress: progress() };
    try {
      const out = await fn();
      completed++;
      log.push({ agent: label, status: out.note ? "fallback" : "ok", source: out.source, durationMs: Date.now() - t0, note: out.note });
      yield { type: "agent-complete", agent: key, label, progress: progress(), source: out.source };
      return out.data;
    } catch (err) {
      completed++;
      log.push({ agent: label, status: "error", source: "deterministic", durationMs: Date.now() - t0, note: err instanceof Error ? err.message : "unknown error" });
      yield { type: "agent-error", agent: key, label, progress: progress(), message: "Recovered with fallback output." };
      return null;
    }
  }

  // 1. Brand (verbal identity)
  const verbal = (yield* runStep<VerbalIdentity>("brand", "Brand Agent", () => runBrandAgent(ctx))) ?? safeVerbal(ctx);

  // 2. Design (full brand assembly)
  const brand =
    (yield* runStep("design", "Design Agent", () => runDesignAgent(ctx, verbal))) ?? throwIfNull("design");
  ctx.brand = brand;

  // 2b. Logo (real image generation — unique per startup)
  brand.logo =
    (yield* runStep("logo", "Logo Agent", () => runLogoAgent(ctx, brand))) ?? emptyLogo("error");

  // 3. Persona
  const persona =
    (yield* runStep("persona", "Persona Agent", () => runPersonaAgent(ctx))) ?? fallbackPersona(ctx);
  ctx.persona = persona;

  // 4. Competitor (real web search)
  const competitors =
    (yield* runStep("competitor", "Competitor Agent", () => runCompetitorAgent(ctx))) ?? fallbackCompetitors();
  ctx.competitors = competitors;

  // 4b. Market research (real web search)
  const marketResearch =
    (yield* runStep("market", "Market Research Agent", () => runMarketAgent(ctx))) ?? fallbackMarket();

  // 5. Pricing
  const pricing =
    (yield* runStep("pricing", "Pricing Agent", () => runPricingAgent(ctx))) ?? fallbackPricing();
  ctx.pricing = pricing;

  // 6. Website
  const websiteCore =
    (yield* runStep("website", "Website Agent", () => runWebsiteAgent(ctx, brand, persona, competitors, pricing))) ??
    { pages: [], navItems: [], footerColumns: [] };

  // 7. SEO
  const seo =
    (yield* runStep("seo", "SEO Agent", () => runSeoAgent(ctx, brand, websiteCore.pages))) ?? fallbackSeo(brand);

  // 8. Marketing
  const marketingCore =
    (yield* runStep("marketing", "Marketing Agent", () => runMarketingAgent(ctx, brand, persona))) ??
    { strategy: fallbackMarketingStrategy(), instagram: [], facebookAds: [], linkedin: [], contentIdeas: [] };

  // 9. Email
  const email =
    (yield* runStep("email", "Email Agent", () => runEmailAgent(ctx, brand))) ??
    { name: "Welcome Sequence", goal: "Convert subscribers", sequence: [] };

  // 10. WhatsApp
  const whatsapp =
    (yield* runStep("whatsapp", "WhatsApp Agent", () => runWhatsAppAgent(ctx, brand))) ??
    { flows: [] };

  // 11. Growth
  const growthCore =
    (yield* runStep("growth", "Growth Agent", () => runGrowthAgent(ctx, brand))) ??
    { phases: [], salesFunnel: [] };

  // 12. Launch
  const launch =
    (yield* runStep("launch", "Launch Agent", () => runLaunchAgent(ctx, brand))) ?? fallbackLaunch();

  // 13. Publisher — assemble final package.
  yield { type: "agent-start", agent: "publisher", label: "Publisher Agent", progress: progress() };

  const usedLlm = log.some((l) => l.source === "llm");
  const allDet = log.every((l) => l.source === "deterministic");

  const pkg: BusinessPackage = {
    id: uid("biz"),
    createdAt: new Date().toISOString(),
    input,
    brand,
    website: { pages: websiteCore.pages, navItems: websiteCore.navItems, footerColumns: websiteCore.footerColumns, seo },
    marketing: {
      strategy: marketingCore.strategy,
      instagram: marketingCore.instagram,
      facebookAds: marketingCore.facebookAds,
      linkedin: marketingCore.linkedin,
      contentIdeas: marketingCore.contentIdeas,
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
    meta: {
      engine: allDet ? "deterministic" : usedLlm ? "hybrid" : "deterministic",
      searchProvider: getSearchProvider(),
      durationMs: Date.now() - startedAt,
      agentLog: log,
    },
  };

  completed++;
  log.push({ agent: "Publisher Agent", status: "ok", source: "deterministic", durationMs: 0 });
  yield { type: "agent-complete", agent: "publisher", label: "Publisher Agent", progress: 100 };
  yield { type: "complete", progress: 100, result: pkg };
}

/* ---- Last-resort fallbacks (only used if an agent throws unexpectedly) ---- */

function safeVerbal(ctx: GenerationContext): VerbalIdentity {
  const name = ctx.industry.roots[0] ?? "Nova";
  return {
    name,
    slogan: "Built for what's next.",
    description: `${name} is a ${ctx.industry.label.toLowerCase()} brand serving ${ctx.input.location}.`,
    story: `${name} was founded to bring a genuinely better ${ctx.industry.label.toLowerCase()} experience to ${ctx.input.location}.`,
    mission: "To deliver a genuinely better experience.",
    vision: "To become the most trusted name in our category.",
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

function fallbackPricing() {
  return {
    model: "Tiered packages",
    revenueModel: "Recurring revenue from tiered plans plus add-on services.",
    rationale: "A simple three-tier structure to maximize perceived value.",
    tiers: [
      { name: "Starter", price: "$29", cadence: "", tagline: "Get started.", features: ["Core offering"], highlighted: false, cta: "Get started" },
      { name: "Growth", price: "$59", cadence: "", tagline: "Most popular.", features: ["Everything in Starter", "Priority support"], highlighted: true, cta: "Start growing" },
      { name: "Premium", price: "$129", cadence: "", tagline: "The very best.", features: ["Everything in Growth", "White-glove service"], highlighted: false, cta: "Talk to us" },
    ],
    psychology: ["Center tier anchoring", "Charm pricing"],
    upsells: ["Add-on services"],
    subscriptionOptions: [
      { name: "Monthly", price: "$59", cadence: "/mo", note: "Flexible, cancel anytime" },
      { name: "Annual", price: "$590", cadence: "/yr", note: "2 months free vs. monthly" },
    ],
    profitEstimation: {
      assumptions: ["Illustrative projection only"],
      monthlyCustomers: 50,
      avgRevenuePerCustomer: "$59",
      estimatedMonthlyRevenue: "$2,950",
      estimatedMonthlyCosts: "$1,180",
      estimatedMonthlyProfit: "$1,770",
      margin: "60%",
    },
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
    kpis: [{ metric: "Conversion rate", target: "3–5%" }],
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
