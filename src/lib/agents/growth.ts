import type { Brand, GrowthPhase, GrowthTask, SalesFunnelStage } from "@/lib/types";
import { ensureArray, nonEmpty } from "@/lib/utils";
import { generateJson } from "@/lib/ai/client";
import { growthLlmSchema } from "@/lib/schemas";
import type { AgentOutput, GenerationContext } from "@/lib/agents/context";

export interface GrowthCore {
  phases: GrowthPhase[];
  salesFunnel: SalesFunnelStage[];
}

function task(title: string, description: string, owner: string, category: GrowthTask["category"]): GrowthTask {
  return { title, description, owner, category };
}

function deterministicPhases(ctx: GenerationContext, brand: Brand): GrowthPhase[] {
  const { industry } = ctx;
  const ch = industry.channels;

  return [
    {
      window: "0-30",
      title: "Foundation & First Customers",
      objective: `Launch ${brand.name}, validate the offer, and land the first paying customers.`,
      northStar: "First 25 paying customers",
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
          task("Run intro ad campaign", "Launch the awareness ad set to a tightly targeted audience.", "Marketing", "marketing"),
          task("Collect first reviews", "Ask early customers for testimonials and feedback.", "Ops", "ops"),
        ] },
        { week: 4, focus: "Iterate", tasks: [
          task("Review metrics", "Analyze what's working; double down on the best channel.", "Founder", "ops"),
          task("Refine offer", "Tweak pricing/messaging based on real feedback.", "Product", "product"),
        ] },
      ],
      milestones: ["Website live", "First 25 customers", "First 10 reviews collected", "Best-performing channel identified"],
      targets: [
        { metric: "Paying customers", value: "25" },
        { metric: "Email subscribers", value: "200" },
        { metric: "Social followers", value: "500" },
      ],
    },
    {
      window: "31-60",
      title: "Traction & Optimization",
      objective: "Find a repeatable acquisition channel and improve conversion.",
      northStar: "Repeatable, profitable acquisition",
      weeklyFocus: [
        { week: 5, focus: "Double down", tasks: [
          task("Scale winning channel", "Increase budget on the channel with the best CPA.", "Marketing", "marketing"),
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
      milestones: ["Profitable acquisition channel", "Referral program live", "Conversion rate improved 20%", "5 partnerships in motion"],
      targets: [
        { metric: "Paying customers", value: "80" },
        { metric: "Repeat rate", value: "30%" },
        { metric: "Conversion rate", value: "4%+" },
      ],
    },
    {
      window: "61-90",
      title: "Scale & Systemize",
      objective: "Systemize operations and scale what works profitably.",
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
          task("Forecast & budget", "Plan budget allocation for the next phase.", "Founder", "ops"),
        ] },
      ],
      milestones: ["Operations documented", "Second channel validated", "Upsells live", "Quarterly plan set"],
      targets: [
        { metric: "Paying customers", value: "200" },
        { metric: "Avg. order value", value: "+25%" },
        { metric: "Monthly growth", value: "15%+" },
      ],
    },
  ];
}

function salesFunnel(ctx: GenerationContext): SalesFunnelStage[] {
  const { industry } = ctx;
  return [
    { stage: "Awareness", goal: "Reach the right audience", tactics: [`${industry.channels[0] ?? "Social"} content`, "Paid ads", "Local SEO"], metric: "Impressions / reach", conversionTarget: "—" },
    { stage: "Interest", goal: "Earn attention & a follow/visit", tactics: ["Engaging content", "Lead magnet", "Retargeting"], metric: "Website visits", conversionTarget: "8–12% of reach" },
    { stage: "Consideration", goal: "Build trust & capture leads", tactics: ["Email capture", "Social proof", "Comparison content"], metric: "Leads / subscribers", conversionTarget: "20–30% of visits" },
    { stage: "Conversion", goal: "Turn leads into customers", tactics: ["Welcome sequence", "Intro offer", "WhatsApp concierge"], metric: "Customers", conversionTarget: "3–5% of leads" },
    { stage: "Loyalty", goal: "Drive repeat & referrals", tactics: ["Loyalty program", "Referral incentives", "Re-engagement"], metric: "Repeat rate", conversionTarget: "40%+ retention" },
  ];
}

export async function runGrowthAgent(ctx: GenerationContext, brand: Brand): Promise<AgentOutput<GrowthCore>> {
  const phases = deterministicPhases(ctx, brand);
  const funnel = salesFunnel(ctx);

  if (!ctx.useLlm) return { data: { phases, salesFunnel: funnel }, source: "deterministic" };

  // LLM augments objectives/milestones/targets; weekly task scaffolding stays deterministic for reliability.
  const res = await generateJson<unknown>({
    system: "You are a startup growth strategist. Produce realistic 30/60/90-day growth objectives.",
    user: `Return JSON: phases[3 of {window ("0-30"|"31-60"|"61-90"), title, objective, northStar, milestones[4], targets[3 of {metric, value}]}].
Business: ${ctx.input.idea}
Industry: ${ctx.industry.label}
Audience: ${ctx.input.audience}
Budget: ${ctx.input.budget}
Brand: ${brand.name}`,
    temperature: 0.7,
    maxTokens: 1400,
  });

  const parsed = growthLlmSchema.safeParse(res.data);
  if (!res.data || !parsed.success || !parsed.data.phases) {
    return { data: { phases, salesFunnel: funnel }, source: "deterministic", note: res.note };
  }

  const merged = phases.map((p) => {
    const match = parsed.data.phases?.find((x) => x.window === p.window);
    if (!match) return p;
    return {
      ...p,
      title: nonEmpty(match.title, p.title),
      objective: nonEmpty(match.objective, p.objective),
      northStar: nonEmpty(match.northStar, p.northStar),
      milestones: ensureArray(match.milestones, p.milestones),
      targets: ensureArray(
        match.targets?.map((t) => ({ metric: nonEmpty(t.metric, ""), value: nonEmpty(t.value, "") })).filter((t) => t.metric),
        p.targets,
      ),
    };
  });

  return { data: { phases: merged, salesFunnel: funnel }, source: "llm" };
}
