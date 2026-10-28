import { z } from "zod";
import { businessInputSchema } from "@/lib/schemas";
import type { BusinessPackage } from "@/lib/types";
import { websiteSpecSchema } from "@/lib/website/model";
import { websitePublicationSchema } from "@/lib/website/publish";
import { BUSINESS_MODEL_KINDS, CONSIDERATIONS, PROFILE_FACTS } from "@/lib/engine/profile";
import { financialAssumptionsSchema, SCENARIOS } from "@/lib/finance/model";

/**
 * Structural validation for a complete BusinessPackage before it is persisted
 * and after it is read back. Objects use `passthrough` so fields added by newer
 * engine versions are preserved rather than silently dropped.
 */

const s = z.string();
const strings = z.array(z.string());
const obj = <T extends z.ZodRawShape>(shape: T) => z.object(shape).passthrough();

const researchStatus = z.enum(["ok", "search-not-configured", "no-results", "error"]);
const searchResult = obj({ title: s, url: s, snippet: s });

const logo = obj({
  generated: z.boolean(),
  imageUrl: s,
  iconUrl: s,
  prompt: s,
  model: s.nullable(),
  status: z.enum(["generated", "unavailable", "error"]),
  concept: s,
});

const brand = obj({
  name: s.min(1),
  slogan: s,
  description: s,
  mission: s,
  vision: s,
  values: strings,
  voice: strings,
  personality: strings,
  logo,
  palette: z.array(
    obj({
      name: s,
      hex: s,
      role: z.enum(["primary", "secondary", "accent", "neutral-dark", "neutral-light", "surface"]),
      usage: s,
    }),
  ),
  typography: obj({
    headingFont: s,
    headingFallback: s,
    bodyFont: s,
    bodyFallback: s,
    googleFontsHref: s,
    scale: z.array(obj({ label: s, sizePx: z.number(), weight: z.number(), lineHeight: z.number(), letterSpacing: s })),
  }),
  guidelines: z.array(obj({ title: s, rule: s })),
});

const websiteSection = obj({
  id: s,
  type: z.enum(["hero", "features", "social-proof", "services", "about", "testimonials", "pricing", "faq", "cta", "contact", "stats"]),
  heading: s,
  subheading: s.optional(),
  body: s.optional(),
  items: z.array(obj({ title: s, description: s, icon: s.optional() })).optional(),
  primaryCta: s.optional(),
  secondaryCta: s.optional(),
});

const website = obj({
  spec: websiteSpecSchema.optional(),
  pages: z.array(obj({ slug: s, title: s, metaDescription: s, sections: z.array(websiteSection) })),
  seo: obj({
    title: s,
    metaDescription: s,
    keywords: strings,
    ogTitle: s,
    ogDescription: s,
    slugStructure: z.array(obj({ page: s, slug: s })),
    jsonLd: z.record(z.unknown()),
    sitemap: strings,
  }),
  navItems: z.array(obj({ label: s, href: s })),
  footerColumns: z.array(obj({ title: s, links: z.array(obj({ label: s, href: s })) })),
  publication: websitePublicationSchema.optional(),
});

const marketing = obj({
  strategy: obj({
    positioning: s,
    channels: z.array(obj({ channel: s, rationale: s, budgetPercent: z.number() })),
    messaging: strings,
    kpis: z.array(obj({ metric: s, target: s })),
    contentPillars: z.array(obj({ pillar: s, description: s, sampleTopics: strings })),
    calendar: z.array(obj({ week: z.number(), theme: s, deliverables: strings })),
  }),
  instagram: z.array(
    obj({
      id: s,
      format: z.enum(["carousel", "single", "reel"]),
      headline: s,
      caption: s,
      hashtags: strings,
      cta: s,
      creativeSvg: s,
    }),
  ),
  facebookAds: z.array(
    obj({
      id: s,
      objective: s,
      primaryText: s,
      headline: s,
      description: s,
      cta: s,
      audience: s,
      estimatedCpc: s,
      creativeSvg: s,
    }),
  ),
  email: obj({
    name: s,
    goal: s,
    sequence: z.array(obj({ day: z.number(), subject: s, preview: s, goal: s, bodyHtml: s, bodyText: s })),
  }),
  whatsapp: obj({
    name: s,
    goal: s,
    nodes: z.array(
      obj({
        id: s,
        speaker: z.enum(["bot", "user"]),
        message: s,
        options: z.array(obj({ label: s, next: s })).optional(),
        next: s.optional(),
      }),
    ),
  }),
});

const competitors = obj({
  available: z.boolean(),
  status: researchStatus,
  provider: s.nullable(),
  queries: strings,
  marketOverview: s,
  competitors: z.array(
    obj({
      name: s,
      type: z.enum(["direct", "indirect", "local", "uncertain"]),
      category: s,
      description: s,
      website: s,
      strengths: strings,
      weaknesses: strings,
      sources: strings,
    }),
  ),
  swot: obj({ strengths: strings, weaknesses: strings, opportunities: strings, threats: strings }),
  differentiation: strings,
  opportunityGaps: strings,
  sources: z.array(searchResult),
});

const insight = obj({ insight: s, sources: strings });

const marketResearch = obj({
  available: z.boolean(),
  status: researchStatus,
  provider: s.nullable(),
  queries: strings,
  summary: s,
  trends: z.array(insight),
  painPoints: z.array(insight),
  demandSignals: z.array(insight),
  opportunities: z.array(insight),
  sources: z.array(searchResult),
});

const pricing = obj({
  model: s,
  rationale: s,
  tiers: z.array(obj({ name: s, price: s, cadence: s, tagline: s, features: strings, highlighted: z.boolean(), cta: s })),
  psychology: strings,
  upsells: strings,
  grounding: obj({
    evidence: z.enum(["observed", "unavailable", "researchFailed", "notResearched"]),
    priceBasis: z.enum(["ownerRange", "competitorEvidence", "none"]),
    observations: z.array(obj({ competitor: s, domain: s, price: s })),
    signals: strings,
    limitations: strings,
  }).optional(),
});

const persona = obj({
  name: s,
  archetype: s,
  age: s,
  occupation: s,
  bio: s,
  goals: strings,
  painPoints: strings,
  channels: strings,
  objections: strings,
  quote: s,
});

const growthPhase = obj({
  window: z.enum(["0-30", "31-60", "61-90"]),
  title: s,
  objective: s,
  northStar: s,
  weeklyFocus: z.array(
    obj({
      week: z.number(),
      focus: s,
      tasks: z.array(
        obj({ title: s, description: s, owner: s, category: z.enum(["marketing", "product", "sales", "ops", "brand"]) }),
      ),
    }),
  ),
  milestones: strings,
  targets: z.array(obj({ metric: s, value: s })),
});

const launch = obj({
  summary: s,
  prelaunch: z.array(obj({ task: s, timing: s })),
  launchDay: z.array(obj({ task: s, channel: s })),
  postlaunch: z.array(obj({ task: s, timing: s })),
  checklist: z.array(obj({ item: s, done: z.boolean() })),
});

const num = z.number().finite();
const nullableNum = num.nullable();

const strategy = obj({
  source: z.enum(["llm", "template"]),
  profile: obj({
    modelKind: z.enum(BUSINESS_MODEL_KINDS),
    modelBasis: z.enum(["provided", "inferred", "assumed"]),
    industryKey: s,
    industryLabel: s,
    sellsOnline: z.boolean().nullable(),
    budget: obj({ amount: num, currency: s, currencyBasis: z.enum(["provided", "assumed"]) }).nullable(),
    facts: z.array(obj({ key: z.enum(PROFILE_FACTS), value: s, basis: z.enum(["provided", "inferred", "assumed", "unavailable"]) })),
    considerations: z.array(z.enum(CONSIDERATIONS)),
    missing: z.array(z.enum(PROFILE_FACTS)),
  }),
  executive: obj({
    summary: s,
    problem: s,
    solution: s,
    valueProposition: s,
    businessModel: s,
    revenueStreams: strings,
    segments: z.array(obj({ name: s, need: s })),
    differentiation: strings,
    entryStrategy: s,
    assumptions: strings,
    risks: z.array(obj({ risk: s, mitigation: s })),
    missingInformation: strings,
    priorities: z.array(
      obj({
        window: z.enum(["0-30", "31-60", "61-90"]),
        action: s,
        priority: z.enum(["high", "medium", "low"]),
        outcome: s,
        dependsOn: s,
        resources: s,
        metric: s,
        assumption: s,
      }),
    ),
  }),
  financials: obj({
    status: z.enum(["estimated", "insufficient"]),
    basis: z.enum(["ai-estimate", "none"]),
    currency: s,
    assumptions: financialAssumptionsSchema.nullable(),
    results: obj({
      totalStartupCosts: num,
      totalMonthlyFixedCosts: num,
      scenarios: z.array(
        obj({
          scenario: z.enum(SCENARIOS),
          monthlyRevenue: num,
          monthlyVariableCosts: num,
          monthlyGrossProfit: num,
          grossMarginPct: nullableNum,
          monthlyFixedCosts: num,
          monthlyOperatingProfit: num,
          paybackMonths: nullableNum,
        }),
      ),
      breakEven: obj({ unitsPerMonth: nullableNum, monthlyRevenue: nullableNum, contributionPerUnit: nullableNum, unit: s }),
      budget: obj({
        status: z.enum(["within", "over", "unknown"]),
        budget: nullableNum,
        startupCosts: num,
        remainingAfterStartup: nullableNum,
        runwayMonths: nullableNum,
        shortfall: nullableNum.optional(),
        essentialStartupCosts: num.optional(),
      }),
    }).nullable(),
    limitations: strings,
  }),
});

export const businessPackageSchema = obj({
  id: s.min(1).max(200),
  createdAt: s.min(1),
  input: businessInputSchema.passthrough(),
  brand,
  website,
  marketing,
  competitors,
  marketResearch,
  pricing,
  persona,
  salesFunnel: z.array(obj({ stage: s, goal: s, tactics: strings, metric: s, conversionTarget: s })),
  growth: z.array(growthPhase),
  launch,
  strategy: strategy.optional(),
  meta: obj({
    engine: z.enum(["llm", "deterministic", "hybrid"]),
    searchProvider: s.nullable(),
    llmProvider: s.nullable().optional(),
    llmSelectionReason: s.optional(),
    durationMs: z.number(),
    runId: s.optional(),
    agentLog: z.array(
      obj({
        agent: s,
        agentKey: z
          .enum([
            "brand",
            "design",
            "logo",
            "website",
            "seo",
            "marketing",
            "email",
            "whatsapp",
            "pricing",
            "strategy",
            "competitor",
            "market",
            "persona",
            "growth",
            "launch",
            "publisher",
          ])
          .optional(),
        status: z.enum(["ok", "fallback", "error"]),
        source: z.enum(["llm", "deterministic"]),
        durationMs: z.number(),
        note: s.optional(),
        modelId: s.optional(),
        costUsd: z.number().optional(),
        costEstimated: z.literal(true).optional(),
      }),
    ),
    quality: obj({
      outcome: z.enum(["success", "provisional", "degraded"]),
      limitations: z.array(s),
    }).optional(),
    estimatedCostUsd: z.number().optional(),
  }),
});

// Compile-time guarantee that a parsed package satisfies the domain type.
const _parsedIsPackage: z.ZodType<BusinessPackage, z.ZodTypeDef, unknown> = businessPackageSchema;
void _parsedIsPackage;

/** Upper bound for one stored package; generated packages are typically well under 1 MB. */
export const MAX_PACKAGE_BYTES = 5_000_000;

export function parseBusinessPackage(value: unknown): BusinessPackage | null {
  const result = businessPackageSchema.safeParse(value);
  return result.success ? (result.data as BusinessPackage) : null;
}
