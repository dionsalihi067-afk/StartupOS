import { z } from "zod";

/**
 * Validation schemas. Input schemas guard the public API surface; the agent
 * output schemas are intentionally lenient (most fields optional) so that
 * partial / malformed LLM responses can be repaired and merged with
 * deterministic defaults instead of crashing the pipeline.
 */

export const BUSINESS_STYLES = [
  "Premium / Luxury",
  "Modern / Minimal",
  "Bold / Energetic",
  "Friendly / Approachable",
  "Corporate / Professional",
  "Playful / Creative",
  "Tech / Futuristic",
  "Organic / Natural",
] as const;

export const businessInputSchema = z.object({
  idea: z.string().trim().min(3, "Describe your business idea (at least 3 characters).").max(600),
  audience: z.string().trim().min(2, "Describe your target audience.").max(300),
  location: z.string().trim().min(2, "Enter a location.").max(160),
  budget: z.string().trim().min(1, "Enter a budget.").max(120),
  style: z.enum(BUSINESS_STYLES),
});

export type BusinessInputDTO = z.infer<typeof businessInputSchema>;

/* ---- Lenient LLM output schemas (per agent) ---- */

const str = z.string().trim();
const strArr = z.array(z.string().trim()).default([]);

export const brandLlmSchema = z
  .object({
    name: str.optional(),
    slogan: str.optional(),
    description: str.optional(),
    story: str.optional(),
    mission: str.optional(),
    vision: str.optional(),
    values: strArr.optional(),
    voice: strArr.optional(),
    personality: strArr.optional(),
    logoConcept: str.optional(),
  })
  .passthrough();

export const competitorLlmSchema = z
  .object({
    marketOverview: str.optional(),
    competitors: z
      .array(
        z.object({
          name: str.optional(),
          website: str.optional(),
          type: z.enum(["direct", "indirect", "local"]).optional(),
          category: str.optional(),
          description: str.optional(),
          strengths: strArr.optional(),
          weaknesses: strArr.optional(),
          sources: strArr.optional(),
        }),
      )
      .optional(),
    swot: z
      .object({
        strengths: strArr.optional(),
        weaknesses: strArr.optional(),
        opportunities: strArr.optional(),
        threats: strArr.optional(),
      })
      .optional(),
    differentiation: strArr.optional(),
    opportunityGaps: strArr.optional(),
  })
  .passthrough();

const insightArr = z
  .array(z.object({ insight: str.optional(), sources: strArr.optional() }))
  .optional();

export const marketResearchLlmSchema = z
  .object({
    summary: str.optional(),
    trends: insightArr,
    painPoints: insightArr,
    demandSignals: insightArr,
    opportunities: insightArr,
  })
  .passthrough();

export const personaLlmSchema = z
  .object({
    name: str.optional(),
    archetype: str.optional(),
    age: str.optional(),
    occupation: str.optional(),
    bio: str.optional(),
    goals: strArr.optional(),
    painPoints: strArr.optional(),
    channels: strArr.optional(),
    objections: strArr.optional(),
    quote: str.optional(),
  })
  .passthrough();

export const marketingLlmSchema = z
  .object({
    positioning: str.optional(),
    messaging: strArr.optional(),
    channels: z
      .array(
        z.object({
          channel: str.optional(),
          rationale: str.optional(),
          budgetPercent: z.number().optional(),
        }),
      )
      .optional(),
    kpis: z.array(z.object({ metric: str.optional(), target: str.optional() })).optional(),
    contentPillars: z
      .array(
        z.object({
          pillar: str.optional(),
          description: str.optional(),
          sampleTopics: strArr.optional(),
        }),
      )
      .optional(),
    instagramCaptions: z
      .array(z.object({ headline: str.optional(), caption: str.optional(), cta: str.optional() }))
      .optional(),
    facebookAds: z
      .array(
        z.object({
          objective: str.optional(),
          primaryText: str.optional(),
          headline: str.optional(),
          description: str.optional(),
          cta: str.optional(),
        }),
      )
      .optional(),
    linkedinPosts: z
      .array(z.object({ hook: str.optional(), body: str.optional(), cta: str.optional() }))
      .optional(),
    contentIdeas: strArr.optional(),
  })
  .passthrough();

export const pricingLlmSchema = z
  .object({
    model: str.optional(),
    revenueModel: str.optional(),
    rationale: str.optional(),
    psychology: strArr.optional(),
    upsells: strArr.optional(),
    subscriptionOptions: z
      .array(z.object({ name: str.optional(), price: str.optional(), cadence: str.optional(), note: str.optional() }))
      .optional(),
    tiers: z
      .array(
        z.object({
          name: str.optional(),
          price: str.optional(),
          cadence: str.optional(),
          tagline: str.optional(),
          features: strArr.optional(),
          highlighted: z.boolean().optional(),
          cta: str.optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

export const websiteCopyLlmSchema = z
  .object({
    hero: z
      .object({ heading: str.optional(), subheading: str.optional(), primaryCta: str.optional() })
      .optional(),
    valueProps: z.array(z.object({ title: str.optional(), description: str.optional() })).optional(),
    about: str.optional(),
    services: z.array(z.object({ title: str.optional(), description: str.optional() })).optional(),
    faq: z.array(z.object({ q: str.optional(), a: str.optional() })).optional(),
  })
  .passthrough();

export const emailLlmSchema = z
  .object({
    name: str.optional(),
    goal: str.optional(),
    sequence: z
      .array(
        z.object({
          day: z.number().optional(),
          subject: str.optional(),
          preview: str.optional(),
          goal: str.optional(),
          body: str.optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

export const growthLlmSchema = z
  .object({
    phases: z
      .array(
        z.object({
          window: z.enum(["0-30", "31-60", "61-90"]).optional(),
          title: str.optional(),
          objective: str.optional(),
          northStar: str.optional(),
          milestones: strArr.optional(),
          targets: z.array(z.object({ metric: str.optional(), value: str.optional() })).optional(),
        }),
      )
      .optional(),
  })
  .passthrough();
