import type { Brand, LaunchPlan } from "@/lib/types";
import type { AgentOutput, GenerationContext } from "@/lib/agents/context";

/**
 * Launch Agent — produces an actionable go-to-market launch plan covering
 * pre-launch, launch day, and post-launch, plus a tickable checklist.
 */
export function runLaunchAgent(ctx: GenerationContext, brand: Brand): AgentOutput<LaunchPlan> {
  const { input, industry } = ctx;
  const ch = industry.channels;

  return {
    data: {
      summary: `A focused, two-week launch sprint to introduce ${brand.name} to ${input.location}, build early momentum, and convert the first wave of ${input.audience.toLowerCase()} into paying customers.`,
      prelaunch: [
        { task: "Finalize brand assets and website", timing: "T-14 days" },
        { task: `Set up ${ch[0] ?? "Instagram"} and ${ch[1] ?? "Google"} profiles`, timing: "T-12 days" },
        { task: "Build a waitlist / early-access landing page", timing: "T-10 days" },
        { task: "Create launch content (posts, emails, ads)", timing: "T-7 days" },
        { task: "Line up an intro offer for launch", timing: "T-5 days" },
        { task: "Brief friends, family & partners to amplify", timing: "T-3 days" },
        { task: "Schedule all launch-day content", timing: "T-1 day" },
      ],
      launchDay: [
        { task: "Publish launch announcement post", channel: ch[0] ?? "Instagram" },
        { task: "Send launch email to waitlist", channel: "Email" },
        { task: "Go live with the intro offer", channel: "Website" },
        { task: "Turn on the awareness ad campaign", channel: "Meta Ads" },
        { task: "Engage with every comment & DM personally", channel: "Social" },
        { task: "Activate the WhatsApp concierge flow", channel: "WhatsApp" },
      ],
      postlaunch: [
        { task: "Thank-you message to first customers", timing: "Day +1" },
        { task: "Request reviews & testimonials", timing: "Day +3" },
        { task: "Share early wins & social proof", timing: "Day +5" },
        { task: "Review metrics and optimize ads", timing: "Day +7" },
        { task: "Launch referral incentive", timing: "Day +10" },
      ],
      checklist: [
        { item: "Brand identity finalized", done: false },
        { item: "Website & all pages live", done: false },
        { item: "Analytics & tracking installed", done: false },
        { item: "Social profiles set up & branded", done: false },
        { item: "Launch content scheduled", done: false },
        { item: "Email sequence connected", done: false },
        { item: "Ad campaigns built & ready", done: false },
        { item: "WhatsApp flow configured", done: false },
        { item: "Intro offer defined", done: false },
        { item: "Payment / booking system ready", done: false },
      ],
    },
    source: "deterministic",
  };
}
