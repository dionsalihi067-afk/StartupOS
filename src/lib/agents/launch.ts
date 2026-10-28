import type { Brand, LaunchPlan } from "@/lib/types";
import type { AgentOutput, GenerationContext } from "@/lib/agents/context";
import type { BusinessModelKind, Consideration } from "@/lib/engine/profile";

/**
 * Launch Agent — produces an actionable go-to-market launch plan covering
 * pre-launch, launch day, and post-launch, plus a tickable checklist. Tasks
 * follow the business model and the sales channels the owner chose, so a
 * cleaning service is not told to configure a shop and an online store is not
 * told to open a WhatsApp flow it never asked for.
 */

type Channel = "website" | "social" | "marketplace" | "store" | "direct" | "messaging" | "partners";

const MODEL_PREP: Record<BusinessModelKind, { prep: string[]; ready: string }> = {
  product: {
    prep: ["Confirm supplier, stock levels and product costs", "Prepare product photos, descriptions and labelling", "Set up checkout, delivery and returns"],
    ready: "Checkout, delivery and returns ready",
  },
  saas: {
    prep: ["Run a private beta with target users and fix blocking issues", "Prepare onboarding and a help page", "Set up sign-up and billing"],
    ready: "Sign-up, onboarding and billing ready",
  },
  localService: {
    prep: ["Define the service area, job types and price per job", "Prepare equipment and a booking or quote process", "Confirm insurance cover for work at customers' premises"],
    ready: "Booking and quoting process ready",
  },
  professionalService: {
    prep: ["Package the services with clear scope and prices", "Prepare examples of past work or a sample deliverable", "Prepare a proposal and contract template"],
    ready: "Proposal and contract templates ready",
  },
  foodVenue: {
    prep: ["Finalise the menu, recipes and food costs", "Train staff and test service flow", "Hold a soft opening for friends and neighbours"],
    ready: "Ordering and payment at the venue ready",
  },
  marketplace: {
    prep: ["Recruit the first suppliers before opening to buyers", "Set listing rules, fees and dispute handling", "Test a full transaction end to end"],
    ready: "Listings, payments and dispute handling ready",
  },
  education: {
    prep: ["Prepare the first course module or class", "Set up enrolment and scheduling", "Run a pilot session and collect feedback"],
    ready: "Enrolment and scheduling ready",
  },
  general: {
    prep: ["Define the first offer and who it is for", "Decide how customers will pay"],
    ready: "Payment process ready",
  },
};

const CONSIDERATION_LABELS: Record<Consideration, string> = {
  cosmeticsSafety: "cosmetic product safety, labelling and notification",
  foodHygiene: "food hygiene registration and inspection",
  alcoholTobacco: "alcohol or tobacco licensing",
  healthClaims: "health and medical claims",
  financialServices: "financial-services licensing",
  vehicleImport: "vehicle import, customs and registration",
  construction: "construction permits and safety",
  childcare: "childcare licensing and staff checks",
  transportLicensing: "transport licensing and insurance",
  tourismLicensing: "tourism licensing",
  realEstate: "real-estate agency rules",
  personalData: "personal data protection",
  importCustoms: "import duties and customs",
  employment: "employment contracts and registration",
};

function chosenChannels(ctx: GenerationContext): Channel[] {
  const chosen = ctx.input.discovery?.model.channels ?? [];
  // Without discovery answers, assume a website plus social media: the minimum most businesses use.
  return chosen.length ? chosen : ["website", "social"];
}

/**
 * High-priority 0-30 strategy actions become concrete pre-launch tasks so
 * launch does not ignore the executive roadmap already produced upstream.
 */
export function strategyLaunchTasks(ctx: GenerationContext): { task: string; timing: string }[] {
  const priorities = ctx.strategy?.executive.priorities ?? [];
  return priorities
    .filter((p) => p.window === "0-30" && (p.priority === "high" || p.priority === "medium") && p.action.trim())
    .sort((a, b) => (a.priority === "high" ? 0 : 1) - (b.priority === "high" ? 0 : 1))
    .slice(0, 4)
    .map((p, i) => ({
      task: p.action.trim(),
      timing: `T-${16 - i * 2} days`,
    }));
}

export function runLaunchAgent(ctx: GenerationContext, brand: Brand): AgentOutput<LaunchPlan> {
  const { input, industry, profile } = ctx;
  const channels = chosenChannels(ctx);
  const has = (c: Channel) => channels.includes(c);
  const social = industry.channels.find((c) => /instagram|tiktok|facebook|linkedin|youtube|pinterest/i.test(c)) ?? "social media";
  const model = MODEL_PREP[profile.modelKind];

  const rules = profile.considerations.map((c) => CONSIDERATION_LABELS[c]);
  const strategyTasks = strategyLaunchTasks(ctx);
  const prelaunch = [
    ...(rules.length ? [{ task: `Check the local rules that may apply: ${rules.join("; ")}`, timing: "T-21 days" }] : []),
    ...model.prep.map((task, i) => ({ task, timing: `T-${14 - i * 2} days` })),
    ...strategyTasks,
    ...(has("website") ? [{ task: "Finish the website and connect analytics", timing: "T-10 days" }] : []),
    ...(has("social") ? [{ task: `Set up branded ${social} profiles`, timing: "T-10 days" }] : []),
    ...(has("marketplace") ? [{ task: "Create and review marketplace listings", timing: "T-9 days" }] : []),
    { task: "Collect early-interest contacts (waitlist, pre-orders or enquiries)", timing: "T-7 days" },
    { task: "Prepare launch content and an introductory offer", timing: "T-5 days" },
    ...(has("partners") ? [{ task: "Brief partners on the launch and what to share", timing: "T-3 days" }] : []),
  ];

  const launchDay = [
    ...(has("social") ? [{ task: "Publish the launch announcement", channel: social }] : []),
    ...(has("website") ? [{ task: "Make the introductory offer live", channel: "Website" }] : []),
    { task: "Tell everyone on the early-interest list", channel: has("messaging") ? "Messaging" : "Email" },
    ...(has("store") ? [{ task: "Open the doors with the introductory offer", channel: "Store" }] : []),
    ...(has("marketplace") ? [{ task: "Activate marketplace listings", channel: "Marketplace" }] : []),
    ...(has("direct") ? [{ task: "Contact your first prospects personally", channel: "Direct" }] : []),
    { task: "Reply to every comment and enquiry personally", channel: has("social") ? "Social" : "All channels" },
  ];

  const postlaunch = [
    { task: "Thank the first customers and ask what nearly stopped them buying", timing: "Day +1" },
    { task: "Ask satisfied customers for a review", timing: "Day +3" },
    { task: "Record the first week's numbers as your baseline", timing: "Day +7" },
    { task: "Drop the weakest channel or message and repeat what worked", timing: "Day +10" },
  ];

  const checklist = [
    "Brand identity finalized",
    ...(rules.length ? ["Local rules checked"] : []),
    ...strategyTasks.map((t) => t.task),
    ...(has("website") ? ["Website live with analytics"] : []),
    ...(has("social") ? ["Social profiles set up and branded"] : []),
    ...(has("marketplace") ? ["Marketplace listings live"] : []),
    ...(has("messaging") ? ["Messaging replies and hours set"] : []),
    "Launch content prepared",
    "Introductory offer defined",
    model.ready,
  ].map((item) => ({ item, done: false }));

  const strategyLead = strategyTasks[0]?.task;
  return {
    data: {
      summary: strategyLead
        ? `A focused launch for ${brand.name} in ${input.location}: prioritize “${strategyLead}”, prepare what this ${MODEL_NOUN[profile.modelKind]} needs to serve its first customers, announce it on the channels you chose, and measure the first weeks before spending more.`
        : `A focused launch for ${brand.name} in ${input.location}: prepare what this ${MODEL_NOUN[profile.modelKind]} needs to serve its first customers, announce it on the channels you chose, and measure the first weeks before spending more.`,
      prelaunch,
      launchDay,
      postlaunch,
      checklist,
    },
    source: "deterministic",
  };
}

const MODEL_NOUN: Record<BusinessModelKind, string> = {
  product: "product business",
  saas: "software product",
  localService: "service",
  professionalService: "service",
  foodVenue: "venue",
  marketplace: "marketplace",
  education: "programme",
  general: "business",
};
