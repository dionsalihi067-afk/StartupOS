import { z } from "zod";

/**
 * Validation schemas. Input schemas guard the public API surface; the agent
 * output schemas are intentionally lenient (most fields optional) so that
 * partial / malformed LLM responses can be repaired and merged with
 * deterministic defaults instead of crashing the pipeline.
 */

import { BUSINESS_STYLES } from "@/lib/styles";
import { discoverySchema } from "@/lib/discovery";
import { websiteBriefSchema } from "@/lib/website/brief";

export { BUSINESS_STYLES };

export const businessInputSchema = z.object({
  idea: z.string().trim().min(3, "Describe your business idea (at least 3 characters).").max(600),
  audience: z.string().trim().min(2, "Describe your target audience.").max(300),
  location: z.string().trim().min(2, "Enter a location.").max(160),
  budget: z.string().trim().min(1, "Enter a budget.").max(120),
  style: z.enum(BUSINESS_STYLES),
  /** Full Business Discovery answers; absent for businesses created before the wizard existed. */
  discovery: discoverySchema.optional(),
  /** Website setup answers; absent until the owner sets the website up. */
  website: websiteBriefSchema.optional(),
});

export type BusinessInputDTO = z.infer<typeof businessInputSchema>;

/* ---- Lenient LLM output schemas (per agent) ---- */

const str = z.string().trim();
const strArr = z.array(z.string().trim()).default([]);

/*
 * Element-tolerant building blocks for the Growth and Marketing answers. A model that
 * writes one field in an unexpected shape (an object where a string was asked for, a
 * share like "~30%") used to lose the whole answer. These recover the text where the
 * meaning is unambiguous and drop only the element that cannot be read; the agents
 * still ground every value afterwards and report invalid output when nothing usable remains.
 */

/** Plain text from a string, number, list of strings, or an object holding one text value. */
export function textOf(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (Array.isArray(v)) {
    const parts = v.map((x) => (typeof x === "string" || typeof x === "number" ? textOf(x) : undefined)).filter((x): x is string => Boolean(x));
    return parts.length ? parts.join(" ") : undefined;
  }
  if (v && typeof v === "object") {
    const values = Object.values(v).filter((x): x is string => typeof x === "string" && x.trim() !== "");
    return values.length === 1 ? values[0]!.trim() : undefined;
  }
  return undefined;
}

const looseText = z.preprocess(textOf, z.string().optional());

/** Texts from a list (or a lone value, or an object map of values); unreadable entries are dropped. */
const looseTextList = z.preprocess((v) => {
  const items = Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : v === undefined || v === null ? [] : [v];
  return items.map(textOf).filter((x): x is string => Boolean(x));
}, z.array(z.string()));

/** Array of `item`s from a list (or an object map); elements that do not validate are dropped. */
function looseArray<T extends z.ZodTypeAny>(item: T, fromString?: (s: string) => unknown) {
  return z.preprocess(
    (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : v === undefined || v === null ? [] : [v]),
    z.array(z.unknown()).transform((items) =>
      items.flatMap((raw): z.output<T>[] => {
        const r = item.safeParse(typeof raw === "string" && fromString ? fromString(raw) : raw);
        return r.success ? [r.data] : [];
      }),
    ),
  );
}

/** "Metric: target" written as one string. */
const metricPair = (valueKey: "value" | "target") => (s: string) => {
  const at = s.indexOf(":");
  return at > 0 ? { metric: s.slice(0, at), [valueKey]: s.slice(at + 1) } : { metric: s };
};

/** {"Paying customers": "Measure baseline"} is a list of metric/target pairs. */
function metricMap(valueKey: "value" | "target") {
  return (v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v) && !("metric" in v)
      ? Object.entries(v).map(([metric, value]) => ({ metric, [valueKey]: value }))
      : v;
}

/** A budget share such as 30, "30%", "~30 %" or "30 percent"; anything else is not a share. */
const sharePercent = z.preprocess((v) => {
  const m = typeof v === "string" ? v.trim().match(/^~?\s*(\d+(?:\.\d+)?)\s*(?:%|percent)?$/i) : null;
  const n = typeof v === "number" ? v : m ? Number.parseFloat(m[1]!) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined;
}, z.number().optional());

/** Unwraps {"growthPlan": {...}} style answers that nest the requested object one level down. */
function unwrapped(keys: readonly string[]) {
  return (v: unknown) => {
    if (!v || typeof v !== "object" || Array.isArray(v) || keys.some((k) => k in v)) return v;
    const nested = Object.values(v).filter((x) => x && typeof x === "object" && !Array.isArray(x) && keys.some((k) => k in x));
    return nested.length === 1 ? nested[0] : v;
  };
}

export const brandLlmSchema = z
  .object({
    name: str.optional(),
    slogan: str.optional(),
    description: str.optional(),
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

/**
 * Competitor analysis grounded in research: the model refers to validated
 * competitors by their prompt ref ("C1") and can only annotate them — names,
 * websites and sources always come from the research itself.
 */
export const competitorResearchLlmSchema = z
  .object({
    marketOverview: str.optional(),
    competitors: z
      .array(
        z.object({
          ref: str,
          type: z.enum(["direct", "indirect", "uncertain"]).optional(),
          strengths: strArr.optional(),
          weaknesses: strArr.optional(),
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

const MARKETING_KEYS = ["positioning", "messaging", "channels", "kpis", "contentPillars", "instagramCaptions", "facebookAds"] as const;

export const marketingLlmSchema = z.preprocess(
  unwrapped(MARKETING_KEYS),
  z
    .object({
      positioning: looseText,
      messaging: looseTextList,
      channels: looseArray(
        z.object({ channel: looseText, rationale: looseText, budgetPercent: sharePercent }).refine((c) => Boolean(c.channel)),
        (channel) => ({ channel }),
      ),
      kpis: z.preprocess(
        metricMap("target"),
        looseArray(z.object({ metric: looseText, target: looseText }).refine((k) => Boolean(k.metric)), metricPair("target")),
      ),
      contentPillars: looseArray(
        z.object({ pillar: looseText, description: looseText, sampleTopics: looseTextList }).refine((p) => Boolean(p.pillar)),
        (pillar) => ({ pillar }),
      ),
      instagramCaptions: looseArray(z.object({ headline: looseText, caption: looseText, cta: looseText })),
      facebookAds: looseArray(
        z.object({ objective: looseText, primaryText: looseText, headline: looseText, description: looseText, cta: looseText }),
      ),
    })
    .passthrough(),
);

/** True when a parsed marketing answer carries any content the agent can use. */
export function hasMarketingContent(d: z.output<typeof marketingLlmSchema>): boolean {
  return Boolean(
    d.positioning ||
      d.messaging?.length ||
      d.channels?.length ||
      d.kpis?.length ||
      d.contentPillars?.length ||
      d.instagramCaptions?.some((c) => c.headline && c.caption) ||
      d.facebookAds?.some((a) => a.primaryText && a.headline),
  );
}

export const pricingLlmSchema = z
  .object({
    model: str.optional(),
    rationale: str.optional(),
    psychology: strArr.optional(),
    upsells: strArr.optional(),
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

const GROWTH_WINDOWS = ["0-30", "31-60", "61-90"] as const;
type GrowthWindow = (typeof GROWTH_WINDOWS)[number];

/**
 * The 30/60/90-day window a model meant, or null when it named a window that is not one of
 * them ("10-30" is not the first month). Undefined when no window was given.
 */
export function growthWindowOf(v: unknown): GrowthWindow | null | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "number") return v === 30 ? "0-30" : v === 60 ? "31-60" : v === 90 ? "61-90" : null;
  if (typeof v !== "string") return null;
  const s = v.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  const range = s.match(/(?<!\d)(\d{1,2})\s*(?:-|to)\s*(\d{2})(?!\d)/);
  if (range) {
    const [start, end] = [Number(range[1]), Number(range[2])];
    if (end === 30 && start <= 1) return "0-30";
    if (end === 60 && (start === 30 || start === 31)) return "31-60";
    if (end === 90 && (start === 60 || start === 61)) return "61-90";
    return null;
  }
  const month = s.match(/^(?:month|muaji)\s*([123])$/)?.[1];
  if (month) return GROWTH_WINDOWS[Number(month) - 1];
  if (/^(?:first\s+)?30(?:\s*days?)?$/.test(s)) return "0-30";
  if (/^60(?:\s*days?)?$/.test(s)) return "31-60";
  if (/^90(?:\s*days?)?$/.test(s)) return "61-90";
  return null;
}

const growthPhase = z.object({
  window: z.unknown().optional(),
  title: looseText,
  objective: looseText,
  northStar: looseText,
  milestones: looseTextList,
  targets: z.preprocess(
    metricMap("value"),
    looseArray(z.object({ metric: looseText, value: looseText }).refine((t) => Boolean(t.metric)), metricPair("value")),
  ),
});

export const growthLlmSchema = z.preprocess(
  unwrapped(["phases"]),
  z
    .object({
      phases: z.preprocess(
        // {"0-30": {...}, "31-60": {...}} is the same plan keyed by window.
        (v) =>
          v && typeof v === "object" && !Array.isArray(v)
            ? Object.entries(v).map(([window, phase]) => (phase && typeof phase === "object" ? { window, ...phase } : phase))
            : v,
        looseArray(growthPhase).transform((phases) => {
          const windows = phases.map((p) => growthWindowOf(p.window));
          // Three phases with no windows at all are the three windows in order.
          const positional = phases.length === GROWTH_WINDOWS.length && windows.every((w) => w === undefined);
          const seen = new Set<GrowthWindow>();
          return phases.flatMap((p, i) => {
            const window = positional ? GROWTH_WINDOWS[i]! : windows[i];
            if (!window || seen.has(window)) return [];
            seen.add(window);
            return [{ ...p, window }];
          });
        }),
      ),
    })
    .passthrough(),
);
