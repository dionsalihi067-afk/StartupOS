import type { Brand, GrowthPhase, GrowthTask, SalesFunnelStage } from "@/lib/types";
import { ensureArray, nonEmpty } from "@/lib/utils";
import { generateJson } from "@/lib/ai/client";
import { growthLlmSchema } from "@/lib/schemas";
import { fallbackNote, withBrief, withLlmTelemetry, withResearch, type AgentOutput, type GenerationContext } from "@/lib/agents/context";
import { languageInstruction } from "@/lib/agents/language";

export interface GrowthCore {
  phases: GrowthPhase[];
  salesFunnel: SalesFunnelStage[];
}

function task(title: string, description: string, owner: string, category: GrowthTask["category"]): GrowthTask {
  return { title, description, owner, category };
}

const BASELINE = "Measure baseline";

/** Sales needed per month to cover fixed costs, from the financial model; null when it was not estimated. */
function breakEvenTarget(ctx: GenerationContext): string | null {
  const be = ctx.strategy?.financials.results?.breakEven;
  if (!be?.unitsPerMonth) return null;
  return `${be.unitsPerMonth} ${be.unit} / month (estimated break-even)`;
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

/**
 * Strategy 30/60/90 actions already computed upstream. Growth must align with
 * them rather than inventing a parallel plan that ignores the executive roadmap.
 */
export function strategyActionsForWindow(
  ctx: GenerationContext,
  window: GrowthPhase["window"],
): string[] {
  const priorities = ctx.strategy?.executive.priorities ?? [];
  return priorities
    .filter((p) => p.window === window && p.action.trim())
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    .map((p) => p.action.trim());
}

function strategyPriorityBlock(ctx: GenerationContext): string {
  const windows: GrowthPhase["window"][] = ["0-30", "31-60", "61-90"];
  const lines = windows.flatMap((w) => {
    const actions = strategyActionsForWindow(ctx, w);
    return actions.length ? [`${w}: ${actions.join("; ")}`] : [];
  });
  return lines.length
    ? `Executive strategy priorities (align phase objectives and milestones with these; do not contradict them):\n${lines.join("\n")}`
    : "No executive strategy priorities were provided; keep phases grounded in the business facts below.";
}

/**
 * Targets come from the owner's own financial model or are explicitly left to
 * be measured. No benchmark conversion rates or customer counts are invented.
 */
function phaseTargets(ctx: GenerationContext): Record<GrowthPhase["window"], GrowthPhase["targets"]> {
  const breakEven = breakEvenTarget(ctx);
  return {
    "0-30": [
      { metric: "Paying customers", value: BASELINE },
      { metric: "Enquiries or sign-ups per week", value: BASELINE },
    ],
    "31-60": [
      { metric: "Monthly sales", value: breakEven ?? "Grow from the first month's baseline" },
      { metric: "Conversion from enquiry to sale", value: "Improve on the first month's baseline" },
    ],
    "61-90": [
      { metric: "Monthly sales", value: breakEven ?? "Grow from the second month's level" },
      { metric: "Repeat customers", value: "Measure and improve" },
    ],
  };
}

/** True when the owner stated a spendable budget (explicit zero means none). */
function hasPaidBudget(ctx: GenerationContext): boolean {
  const amount = ctx.profile.budget?.amount;
  return amount != null && amount > 0;
}

function mergeStrategyMilestones(window: GrowthPhase["window"], defaults: string[], ctx: GenerationContext): string[] {
  const fromStrategy = strategyActionsForWindow(ctx, window).slice(0, 3);
  if (fromStrategy.length === 0) return defaults;
  // Strategy actions first (deduped against defaults) so the executive roadmap stays visible.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of [...fromStrategy, ...defaults]) {
    const key = m.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
    if (out.length >= 6) break;
  }
  return out;
}

function deterministicPhases(ctx: GenerationContext, brand: Brand): GrowthPhase[] {
  const { industry } = ctx;
  const ch = industry.channels;
  const targets = phaseTargets(ctx);
  const paid = hasPaidBudget(ctx);
  const earlyActions = strategyActionsForWindow(ctx, "0-30");
  const midActions = strategyActionsForWindow(ctx, "31-60");
  const lateActions = strategyActionsForWindow(ctx, "61-90");
  const firstCampaign = paid
    ? task("Run intro ad campaign", "Launch a small awareness ad set to a tightly targeted audience.", "Marketing", "marketing")
    : task("Publish organic launch content", "Ship useful posts on the owner's channels without paid media.", "Marketing", "marketing");
  const scaleChannel = paid
    ? task("Scale winning channel", "Increase spend only on the channel with the best measured CPA.", "Marketing", "marketing")
    : task("Double down on organic channel", "Spend more time on the unpaid channel that brought the best results.", "Marketing", "marketing");
  const planAhead = paid
    ? task("Forecast & budget", "Plan budget allocation for the next phase from measured results.", "Founder", "ops")
    : task("Plan next quarter", "Set goals from measured results; keep paid media optional until a budget exists.", "Founder", "ops");

  return [
    {
      window: "0-30",
      title: "Foundation & First Customers",
      objective: earlyActions[0]
        ? `Launch ${brand.name} and execute: ${earlyActions[0]}. Validate the offer and land the first paying customers.`
        : `Launch ${brand.name}, validate the offer, and land the first paying customers.`,
      northStar: "First paying customers",
      weeklyFocus: [
        { week: 1, focus: "Launch readiness", tasks: [
          task("Publish website & landing page", "Ship all core pages and connect analytics.", "Founder", "ops"),
          task("Set up social profiles", `Create ${ch[0] ?? "Instagram"} and ${ch[1] ?? "Google"} profiles with brand assets.`, "Marketing", "brand"),
        ] },
        { week: 2, focus: "Go to market", tasks: [
          task("Launch announcement", "Post launch content across all channels.", "Marketing", "marketing"),
          task("Activate personal network", "Reach out to warm contacts for first customers & referrals.", "Founder", "sales"),
        ] },
        { week: 3, focus: "First campaigns", tasks: [
          firstCampaign,
          task("Collect first reviews", "Ask early customers for testimonials and feedback.", "Ops", "ops"),
        ] },
        { week: 4, focus: "Iterate", tasks: [
          task("Review metrics", "Analyze what's working; double down on the best channel.", "Founder", "ops"),
          task("Refine offer", "Tweak pricing/messaging based on real feedback.", "Product", "product"),
        ] },
      ],
      milestones: mergeStrategyMilestones("0-30", ["Website live", "First paying customers", "First reviews collected", "Best-performing channel identified"], ctx),
      targets: targets["0-30"],
    },
    {
      window: "31-60",
      title: "Traction & Optimization",
      objective: midActions[0]
        ? `Find a repeatable acquisition channel while progressing: ${midActions[0]}.`
        : "Find a repeatable acquisition channel and improve conversion.",
      northStar: "Repeatable, profitable acquisition",
      weeklyFocus: [
        { week: 5, focus: "Double down", tasks: [
          scaleChannel,
          task("Launch referral program", "Reward customers for bringing friends.", "Marketing", "marketing"),
        ] },
        { week: 6, focus: "Conversion", tasks: [
          task("A/B test landing page", "Test headline and CTA variations.", "Marketing", "product"),
          task("Optimize email sequence", "Improve open and click rates.", "Marketing", "marketing"),
        ] },
        { week: 7, focus: "Content engine", tasks: [
          task("Establish content cadence", "Publish consistently against content pillars.", "Marketing", "marketing"),
          task("Build partnerships", "Approach 3 local/complementary partners.", "Founder", "sales"),
        ] },
        { week: 8, focus: "Retention", tasks: [
          task("Launch loyalty mechanic", "Encourage repeat purchases.", "Ops", "ops"),
          task("Win-back campaign", "Re-engage customers who lapsed.", "Marketing", "marketing"),
        ] },
      ],
      milestones: mergeStrategyMilestones("31-60", ["Repeatable acquisition channel identified", "Referral program live", "Conversion measured and improving", "First partnerships in motion"], ctx),
      targets: targets["31-60"],
    },
    {
      window: "61-90",
      title: "Scale & Systemize",
      objective: lateActions[0]
        ? `Systemize operations and advance: ${lateActions[0]}.`
        : "Systemize operations and scale what works profitably.",
      northStar: "Sustainable monthly growth",
      weeklyFocus: [
        { week: 9, focus: "Systemize", tasks: [
          task("Document playbooks", "Turn what works into repeatable SOPs.", "Ops", "ops"),
          task("Automate where possible", "Set up automations for repetitive tasks.", "Ops", "ops"),
        ] },
        { week: 10, focus: "Expand reach", tasks: [
          task("Add a second channel", "Test a new acquisition channel.", "Marketing", "marketing"),
          task("Introduce upsells", "Roll out add-ons and bundles.", "Product", "product"),
        ] },
        { week: 11, focus: "Authority", tasks: [
          task("PR & community", "Pursue local press and community presence.", "Founder", "marketing"),
          task("Showcase results", "Publish case studies and social proof.", "Marketing", "marketing"),
        ] },
        { week: 12, focus: "Plan ahead", tasks: [
          task("90-day review", "Assess results and set the next quarter's goals.", "Founder", "ops"),
          planAhead,
        ] },
      ],
      milestones: mergeStrategyMilestones("61-90", ["Operations documented", "Second channel validated", "Upsells live", "Quarterly plan set"], ctx),
      targets: targets["61-90"],
    },
  ];
}

/** Funnel stages with tactics for the owner's channels; conversion rates are measured, never assumed. */
function salesFunnel(ctx: GenerationContext): SalesFunnelStage[] {
  const { industry, profile } = ctx;
  const channels = ctx.input.discovery?.model.channels ?? [];
  const local = profile.modelKind === "localService" || profile.modelKind === "foodVenue" || channels.includes("store");
  const awareness = [
    `${industry.channels[0] ?? "Social"} content`,
    local ? "Local search listing" : "Search-friendly website content",
    channels.includes("partners") ? "Partner referrals" : "Word of mouth",
  ];
  const conversion = [
    "Intro offer",
    channels.includes("messaging") ? "Fast replies on messaging" : "Follow-up email",
    profile.modelKind === "saas" ? "Free trial or demo" : "Clear pricing",
  ];
  return [
    { stage: "Awareness", goal: "Reach the right audience", tactics: awareness, metric: "Reach", conversionTarget: BASELINE },
    { stage: "Interest", goal: "Earn a visit, follow or enquiry", tactics: ["Useful content", "Customer stories once you have them"], metric: "Visits / enquiries", conversionTarget: BASELINE },
    { stage: "Consideration", goal: "Build trust", tactics: ["Reviews from real customers", "Answers to common objections"], metric: "Leads", conversionTarget: BASELINE },
    { stage: "Conversion", goal: "Turn interest into a sale", tactics: conversion, metric: "Customers", conversionTarget: BASELINE },
    { stage: "Loyalty", goal: "Drive repeat business and referrals", tactics: ["Follow-up after purchase", "Referral incentive"], metric: "Repeat rate", conversionTarget: BASELINE },
  ];
}

export async function runGrowthAgent(ctx: GenerationContext, brand: Brand): Promise<AgentOutput<GrowthCore>> {
  const phases = deterministicPhases(ctx, brand);
  const funnel = salesFunnel(ctx);

  if (!ctx.useLlm) return { data: { phases, salesFunnel: funnel }, source: "deterministic" };

  // LLM augments objectives/milestones/targets; weekly task scaffolding stays deterministic for reliability.
  const res = await generateJson({
    system:
      "You are a startup growth strategist. Produce realistic 30/60/90-day growth objectives that align with the executive strategy priorities when provided. Never invent benchmark conversion rates, follower counts or customer numbers: a numeric target must come from the break-even estimate given, otherwise use a non-numeric target such as 'Measure baseline'. Do not contradict the executive priorities.",
    user: withResearch(
      ctx,
      "growth",
      withBrief(
        ctx,
        `${languageInstruction(ctx)}
Return JSON: phases[3 of {window ("0-30"|"31-60"|"61-90"), title, objective, northStar, milestones[4], targets[2-3 of {metric, value}]}].
Business: ${ctx.input.idea}
Industry: ${ctx.industry.label}
Audience: ${ctx.input.audience}
Budget: ${ctx.input.budget}
Estimated break-even: ${breakEvenTarget(ctx) ?? "not estimated"}
Brand: ${brand.name}
${strategyPriorityBlock(ctx)}`,
      ),
    ),
    task: "reasoning",
    temperature: 0.55,
    maxTokens: 2000,
    // Shares the post-strategy parallel wave with website/marketing; Astra needs headroom.
    timeoutMs: 180_000,
    schema: growthLlmSchema,
  });

  // Defense in depth: generateJson may already have validated; mocks and edge
  // payloads still go through the preprocess/normalize schema here.
  const validated = growthLlmSchema.safeParse(res.data);
  const parsed = validated.success ? validated.data : null;
  if (!parsed || parsed.phases.length === 0) {
    console.warn(`[growth] llm output rejected: ${res.note ?? "no-usable-phases"}`);
    return withLlmTelemetry(
      { data: { phases, salesFunnel: funnel }, source: "deterministic", note: fallbackNote(res.note) },
      res,
    );
  }

  const breakEvenUnits = ctx.strategy?.financials.results?.breakEven?.unitsPerMonth;
  const grounded = (value: string) =>
    !/\d/.test(value) || (breakEvenUnits != null && new RegExp(`\\b${breakEvenUnits}\\b`).test(value)) ? value : BASELINE;

  const merged = phases.map((p) => {
    const match = parsed.phases.find((x) => x.window === p.window);
    if (!match) return p;
    const llmMilestones = ensureArray(match.milestones, p.milestones);
    return {
      ...p,
      title: nonEmpty(match.title, p.title),
      objective: nonEmpty(match.objective, p.objective),
      northStar: nonEmpty(match.northStar, p.northStar),
      // Keep executive strategy actions visible even when the model rewrites milestones.
      milestones: mergeStrategyMilestones(p.window, llmMilestones, ctx),
      targets: ensureArray(
        (match.targets ?? []).map((t) => ({ metric: nonEmpty(t.metric, ""), value: grounded(nonEmpty(t.value, BASELINE)) })).filter((t) => t.metric),
        p.targets,
      ),
    };
  });

  return withLlmTelemetry({ data: { phases: merged, salesFunnel: funnel }, source: "llm" }, res);
}
