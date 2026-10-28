import type {
  Brand,
  CustomerPersona,
  FacebookAd,
  InstagramPost,
  MarketingStrategy,
} from "@/lib/types";
import { nonEmpty, ensureArray, uid, midSentence } from "@/lib/utils";
import { generateJson } from "@/lib/ai/client";
import { hasMarketingContent, marketingLlmSchema } from "@/lib/schemas";
import { fallbackNote, withBrief, withLlmTelemetry, withResearch, type AgentOutput, type GenerationContext } from "@/lib/agents/context";
import { audiencePhrase, copyBrief, hasChannel, type CopyBrief } from "@/lib/agents/copy-brief";
import { languageInstruction } from "@/lib/agents/language";
import { instagramCreative, facebookAdCreative } from "@/lib/engine/creatives";

export interface MarketingCore {
  strategy: MarketingStrategy;
  instagram: InstagramPost[];
  facebookAds: FacebookAd[];
}

const LOCAL_KINDS = new Set(["localService", "foodVenue"]);

function hashtagsFor(brand: Brand, ctx: GenerationContext, brief: CopyBrief): string[] {
  const base = brand.name.replace(/[^a-zA-Z0-9]/g, "");
  const industry = ctx.industry.label.replace(/[^a-zA-Z]/g, "");
  const tags = [`#${base}`, industry ? `#${industry}` : ""];
  if (brief.city) tags.push(`#${brief.city.replace(/\s+/g, "")}`);
  if (LOCAL_KINDS.has(brief.modelKind) && brief.location) tags.push("#ShopLocal");
  return tags.filter((tag) => tag.length > 1);
}

const MEASURE = "Measure a baseline in the first 30 days";

/** Marketing channels from the owner's sales channels; without answers, a website plus the industry's main social channel. */
function marketingChannels(ctx: GenerationContext): MarketingStrategy["channels"] {
  const chosen = ctx.input.discovery?.model.channels ?? [];
  const social = ctx.industry.channels.find((c) => /instagram|tiktok|facebook|linkedin|youtube|pinterest/i.test(c)) ?? "Social media";
  const labels: Record<string, [string, string]> = {
    website: ["Website and search", "Where people who already look for this kind of offer can find and compare it."],
    social: [social, "Where the customers you described can discover the brand and see it in use."],
    marketplace: ["Marketplace listings", "Reaches buyers already searching on marketplaces you chose to sell on."],
    store: ["Physical location", "Turns local foot traffic and neighbours into first customers."],
    direct: ["Direct outreach", "Personal contact wins the first customers fastest and teaches you what they need."],
    messaging: ["Messaging apps", "Quick, personal replies to enquiries on the apps customers already use."],
    partners: ["Partners and referrals", "Borrows trust and reach from businesses that already serve these customers."],
  };
  const keys = (chosen.length ? chosen : ["website", "social"]).filter((c) => c in labels).slice(0, 5);
  const share = Math.floor(100 / keys.length);
  return keys.map((key, i) => ({
    channel: labels[key]![0],
    rationale: labels[key]![1],
    budgetPercent: i === 0 ? 100 - share * (keys.length - 1) : share,
  }));
}

const channelKey = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function sameChannel(a: string, b: string): boolean {
  const x = channelKey(a);
  const y = channelKey(b);
  return x !== "" && y !== "" && (x.includes(y) || y.includes(x) || x.split(" ")[0] === y.split(" ")[0]);
}

/**
 * Exactly the owner's channels, in the owner's order and wording. The model can only
 * supply a rationale and budget share for a channel it named; suggestions for other
 * channels are ignored. Shares are scaled to add up to 100, or spread evenly when the
 * model did not give one for every channel.
 */
export function ownerChannels(
  suggested: { channel?: string; rationale?: string; budgetPercent?: number }[],
  allowed: MarketingStrategy["channels"],
): MarketingStrategy["channels"] {
  const remaining = [...suggested];
  const merged = allowed.map((a) => {
    const i = remaining.findIndex((s) => sameChannel(s.channel ?? "", a.channel));
    const s = i >= 0 ? remaining.splice(i, 1)[0] : undefined;
    return { channel: a.channel, rationale: nonEmpty(s?.rationale, a.rationale), share: s?.budgetPercent };
  });
  if (merged.length === 0) return allowed;

  const usable = merged.every((m) => typeof m.share === "number" && m.share > 0);
  const total = usable ? merged.reduce((sum, m) => sum + (m.share as number), 0) : 0;
  const rounded = merged.map((m) => Math.floor(usable ? ((m.share as number) / total) * 100 : 100 / merged.length));
  const remainder = 100 - rounded.reduce((a, b) => a + b, 0);
  return merged.map((m, i) => ({ channel: m.channel, rationale: m.rationale, budgetPercent: rounded[i]! + (i === 0 ? remainder : 0) }));
}

function weekDeliverables(brief: CopyBrief): string[] {
  const items: string[] = [];
  if (hasChannel(brief, "social")) {
    items.push("2 organic social posts");
    items.push(brief.hasPaidBudget ? "1 paid ad draft" : "1 ad creative draft (no spend set)");
    items.push("2 stories");
  }
  if (hasChannel(brief, "website")) items.push("1 website or landing update");
  if (hasChannel(brief, "messaging") || hasChannel(brief, "direct")) items.push("1 outreach message draft");
  items.push("1 email draft");
  return items.slice(0, 4);
}

/**
 * Content pillars derived from this business's offer, audience, problems, and
 * differentiators — not from shared industry topic banks. Industry labels may
 * only appear as a last-resort framing hint when owner facts are sparse.
 */
export function deriveContentPillars(
  brief: CopyBrief,
  brand: Brand,
  persona: CustomerPersona,
): MarketingStrategy["contentPillars"] {
  const audience = midSentence(audiencePhrase(brief) || "the people you serve");
  const offering = midSentence(brief.offering);
  const pain = persona.painPoints[0] || brief.problem;
  const need = brief.need || persona.goals[0];
  const angle = brief.positioning || brief.differentiator;

  const pillars: MarketingStrategy["contentPillars"] = [
    {
      pillar: `Understanding ${offering}`,
      description: `Explain what ${brand.name} offers and how ${offering} helps ${audience}.`,
      sampleTopics: [
        `What ${offering} includes`,
        `Who ${offering} is for`,
        brief.location ? `How we serve ${brief.city || brief.location}` : `How to get started with ${brand.name}`,
      ],
    },
  ];

  if (pain) {
    pillars.push({
      pillar: "Customer problems we solve",
      description: `Content that names the friction ${audience} face and how ${offering} addresses it.`,
      sampleTopics: [
        `When ${midSentence(pain)}`,
        `A clearer alternative to ${midSentence(pain)}`,
        `Questions ${audience} ask before choosing`,
      ],
    });
  } else if (need) {
    pillars.push({
      pillar: "What customers are looking for",
      description: `Show how ${brand.name} meets the need ${audience} already described.`,
      sampleTopics: [
        `Getting to ${midSentence(need)}`,
        `Practical steps toward ${midSentence(need)}`,
        `What good looks like for ${audience}`,
      ],
    });
  } else {
    pillars.push({
      pillar: `Built for ${audience}`,
      description: `Speak directly to ${audience} with examples drawn from their situation — not generic industry tips.`,
      sampleTopics: [
        `A day in the life of ${audience}`,
        `What ${audience} should ask before buying`,
        `How ${brand.name} fits ${audience}`,
      ],
    });
  }

  if (angle) {
    pillars.push({
      pillar: "What makes this offer different",
      description: `Make the owner's stated difference concrete without inventing awards or results.`,
      sampleTopics: [
        midSentence(angle).replace(/\.$/, ""),
        `How we work at ${brand.name}`,
        `What we will not compromise on`,
      ],
    });
  } else {
    pillars.push({
      pillar: `How ${brand.name} works`,
      description: `Process, expectations, and proof points the owner can fill in — no fabricated testimonials.`,
      sampleTopics: [
        `Our process for ${offering}`,
        `What to expect in the first week`,
        brief.earlyStage ? `Help us shape ${offering}` : `Working with ${brand.name}`,
      ],
    });
  }

  pillars.push({
    pillar: brief.city ? `Local presence in ${brief.city}` : "Trust and next steps",
    description: brief.city
      ? `Local relevance for ${brief.city} without inventing reviews or footfall claims.`
      : `Invite ${audience} to a clear next step matched to the channels they already use.`,
    sampleTopics: brief.city
      ? [`${offering} in ${brief.city}`, `Serving neighbours in ${brief.city}`, `Visit or message ${brand.name}`]
      : [`How to reach ${brand.name}`, `What happens after you enquire`, `Start with one clear question`],
  });

  return pillars.slice(0, 4);
}

function deriveCalendar(
  pillars: MarketingStrategy["contentPillars"],
  brief: CopyBrief,
): MarketingStrategy["calendar"] {
  return [1, 2, 3, 4].map((week) => {
    const pillar = pillars[(week - 1) % pillars.length]!;
    return {
      week,
      theme: pillar.pillar,
      deliverables: weekDeliverables(brief),
    };
  });
}

/** Compact persona facts for prompts and deterministic copy — never invents details. */
export function personaBrief(persona: CustomerPersona): string {
  const lines = [
    `Persona: ${persona.name} — ${persona.archetype} (${persona.age}, ${persona.occupation})`,
    persona.bio.trim() ? `Bio: ${persona.bio.trim()}` : null,
    persona.goals.length ? `Goals: ${persona.goals.join("; ")}` : null,
    persona.painPoints.length ? `Pain points: ${persona.painPoints.join("; ")}` : null,
    persona.channels.length ? `Channels they use: ${persona.channels.join("; ")}` : null,
    persona.objections.length ? `Objections: ${persona.objections.join("; ")}` : null,
    persona.quote.trim() ? `Quote: ${persona.quote.trim()}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function deterministicStrategy(
  ctx: GenerationContext,
  brand: Brand,
  brief: CopyBrief,
  persona: CustomerPersona,
): MarketingStrategy {
  const audience = midSentence(audiencePhrase(brief) || "the people you serve");
  const offering = midSentence(brief.offering);
  const place = brief.location ? ` based in ${brief.location}` : "";
  const angle =
    brief.positioning ||
    brief.differentiator ||
    "clear, honest communication";
  const pain = persona.painPoints[0] || brief.problem;
  const goal = persona.goals[0];

  const contentPillars = deriveContentPillars(brief, brand, persona);

  return {
    positioning:
      brief.positioning ||
      `For ${audience}, ${brand.name} offers ${offering}${place}, focused on ${midSentence(angle)}.`,
    channels: marketingChannels(ctx),
    messaging: [
      brand.slogan,
      `${offering.charAt(0).toUpperCase()}${offering.slice(1)}.`,
      pain ? `Built for people who ${midSentence(pain)}.` : `Made for ${audience}.`,
      goal
        ? `Helps ${midSentence(persona.name)} toward ${midSentence(goal)}.`
        : brief.differentiator
          ? brief.differentiator.replace(/\.$/, "") + "."
          : brief.location
            ? `Serving ${brief.location}.`
            : `A ${brief.styleLead} approach to ${offering}.`,
    ],
    kpis: [
      {
        metric: "Cost per new customer",
        target: brief.hasPaidBudget
          ? "Proposed: track spend ÷ new paying customers after you have 30 days of spend data (estimate, not a guarantee)"
          : MEASURE,
      },
      {
        metric: "Visitor-to-enquiry or sale conversion",
        target: "Proposed: count enquiries or sales ÷ unique visitors once analytics are connected (baseline first)",
      },
      {
        metric: "Engagement on your main channel",
        target: "Proposed: saves, replies, or profile visits on the channel you already use — set a baseline in week 1",
      },
      {
        metric: "Repeat customers",
        target: brief.earlyStage
          ? "Not applicable until you have first customers — track first purchases only for now"
          : "Proposed: share of buyers who return within 90 days once you have a customer list",
      },
    ],
    contentPillars,
    calendar: deriveCalendar(contentPillars, brief),
  };
}

function deterministicCaptions(ctx: GenerationContext, brand: Brand, brief: CopyBrief): { headline: string; caption: string; cta: string }[] {
  const audience = midSentence(audiencePhrase(brief) || "you");
  const offering = brief.offering;
  const city = brief.city;
  const early = brief.earlyStage;

  const intro = early
    ? { headline: `${brand.name} is getting started`, caption: `We're building ${offering} for ${audience}. ${brand.slogan} Follow along as we shape the offer with real feedback.`, cta: "Follow along" }
    : { headline: `${offering}`.slice(0, 42), caption: `Meet ${brand.name}. ${brand.slogan} Built for ${audience}. Tap to learn more.`, cta: "Learn more" };

  const localOrOffer = city
    ? {
        headline: city.length < 28 ? `For ${city}` : `Where we work`,
        caption: `${brand.description.split(".")[0]}. ${offering} — see what ${brand.name} is about.`,
        cta: "Discover",
      }
    : {
        headline: "What we offer",
        caption: `${brand.description.split(".")[0]}. ${offering}.`,
        cta: "Discover",
      };

  const problemOrDiff = brief.problem
    ? {
        headline: "A clearer way",
        caption: `If you ${midSentence(brief.problem)}, ${brand.name} focuses on ${offering}. ${brief.differentiator ? brief.differentiator : "Tell us what you need."}`,
        cta: "Learn more",
      }
    : {
        headline: "Behind the work",
        caption: `Every detail at ${brand.name} is intentional. ${brief.differentiator || ctx.industry.valueProps[1] || "Crafted with care"}.`,
        cta: "Follow us",
      };

  const invite = early
    ? {
        headline: "Help shape the offer",
        caption: `${brand.name} is early. Tell us what you need from ${offering} and help shape what we launch.`,
        cta: "Get in touch",
      }
    : {
        headline: "Ready when you are",
        caption: `Questions about ${offering}? Message ${brand.name} — a real person will reply.`,
        cta: "Get in touch",
      };

  return [intro, localOrOffer, problemOrDiff, invite];
}

function deterministicAds(ctx: GenerationContext, brand: Brand, brief: CopyBrief): { objective: string; primaryText: string; headline: string; description: string; cta: string }[] {
  const audience = midSentence(audiencePhrase(brief) || "people like you");
  const offering = brief.offering;
  const pain = brief.problem || ctx.industry.painPoints[0] || "Looking for a better fit";

  return [
    {
      objective: "Awareness",
      primaryText: `${midSentence(pain)}? ${brand.name} offers ${offering} for ${audience}.`,
      headline: brand.slogan || brand.name,
      description: brief.differentiator || ctx.industry.valueProps[0] || "Learn what we offer.",
      cta: "Learn More",
    },
    {
      objective: "Traffic",
      primaryText: `See how ${brand.name} approaches ${offering}. No pressure — just clear information.`,
      headline: `About ${brand.name}`,
      description: brief.location ? `Serving ${brief.location}.` : "Read the details and decide if it fits.",
      cta: "Learn More",
    },
    {
      objective: "Engagement",
      primaryText: `Still comparing options for ${offering}? Take another look at ${brand.name}.`,
      headline: "Still curious?",
      description: "Ask a question or read more when you are ready.",
      cta: "Learn More",
    },
  ];
}

function buildInstagramPosts(
  ctx: GenerationContext,
  brand: Brand,
  brief: CopyBrief,
  captions: { headline: string; caption: string; cta: string }[],
): InstagramPost[] {
  const formats: InstagramPost["format"][] = ["single", "carousel", "reel"];
  const tags = hashtagsFor(brand, ctx, brief);
  return captions.map((c, i) => ({
    id: uid("ig"),
    format: formats[i % formats.length]!,
    headline: c.headline,
    caption: c.caption,
    hashtags: tags,
    cta: c.cta,
    creativeSvg: instagramCreative({
      palette: brand.palette,
      brandName: brand.name,
      headline: c.headline,
      subtext: brief.offering,
      cta: c.cta,
      badge: brief.earlyStage && i === 0 ? "Early" : undefined,
      headingFont: brand.typography.headingFont,
      variant: i,
    }),
  }));
}

function buildFacebookAds(
  ctx: GenerationContext,
  brand: Brand,
  brief: CopyBrief,
  persona: CustomerPersona,
  ads: { objective: string; primaryText: string; headline: string; description: string; cta: string }[],
): FacebookAd[] {
  const audienceParts = [
    brief.audience,
    persona.occupation.trim() || null,
    persona.age.trim() || null,
    brief.location,
    `interests in ${ctx.industry.label.toLowerCase()}`,
  ].filter(Boolean);
  return ads.map((a, i) => ({
    id: uid("fb"),
    objective: a.objective,
    primaryText: a.primaryText,
    headline: a.headline,
    description: a.description,
    cta: a.cta,
    audience: audienceParts.join(" • "),
    estimatedCpc: "",
    creativeSvg: facebookAdCreative({
      palette: brand.palette,
      brandName: brand.name,
      headline: a.headline,
      subtext: a.description,
      cta: a.cta,
      badge: a.objective.split(" ")[0],
      headingFont: brand.typography.headingFont,
      variant: i,
    }),
  }));
}

export async function runMarketingAgent(
  ctx: GenerationContext,
  brand: Brand,
  persona: CustomerPersona,
): Promise<AgentOutput<MarketingCore>> {
  const brief = copyBrief(ctx);
  const strategy = deterministicStrategy(ctx, brand, brief, persona);
  const { input, industry } = ctx;
  const detCaptions = deterministicCaptions(ctx, brand, brief);
  // Ready-to-use ad *copy* when social is in play — never invent spend/CPC.
  // Without social channel, keep ads empty (not a Meta live campaign).
  const detAds = hasChannel(brief, "social") ? deterministicAds(ctx, brand, brief) : [];
  const socialCaptions = hasChannel(brief, "social") ? detCaptions : [];

  if (!ctx.useLlm) {
    return {
      data: {
        strategy,
        instagram: buildInstagramPosts(ctx, brand, brief, socialCaptions),
        facebookAds: buildFacebookAds(ctx, brand, brief, persona, detAds),
      },
      source: "deterministic",
    };
  }

  const budgetNote = brief.hasPaidBudget
    ? "A spendable budget was stated; paid ad drafts are allowed only for channels the owner selected. Do not invent CPC, ROAS, or live campaign IDs."
    : "No spendable budget was stated. Still write 3 ready-to-use Facebook/Instagram ad copy drafts for organic or future paid use when social is selected. Do not invent budgets, CPC, discounts, or that ads are live.";

  const res = await generateJson({
    system:
      "You are a senior growth marketer and copywriter. Write on-brand marketing assets for this specific business. Use only the business facts and persona provided. Address that persona's goals, pain points and objections in messaging; never invent statistics, benchmarks, customer counts, testimonials, reviews, awards, prices, discounts, scarcity, locations, or results. KPI targets must say how to set them from the business's own first measurements, not a number. Early-stage businesses must not sound established.",
    user: withResearch(
      ctx,
      "marketing",
      withBrief(
        ctx,
        `${languageInstruction(ctx)}
Return JSON with: positioning (1-2 sentences), messaging[4], channels[up to 5 of {channel, rationale, budgetPercent (plain number, all sum to 100)}] limited to these channels: ${strategy.channels.map((c) => c.channel).join(", ")}, kpis[4 of {metric, target}], contentPillars[4 of {pillar, description, sampleTopics[3]}], instagramCaptions[4 of {headline (<=6 words), caption (with emoji), cta}], facebookAds[3 of {objective, primaryText, headline, description, cta}].
Content pillars MUST be derived from this offer, audience, problem/need and differentiator — never reuse generic industry blog topics (e.g. "Behind the scenes", "Customer favorites", "Seasonal specials"). Each pillar name should mention this offer or audience in plain language.
Brand: ${brand.name} — "${brand.slogan}"
Voice: ${brand.voice.join(", ")}
Business: ${input.idea}
Offering: ${brief.offering}
Problem: ${brief.problem ?? "not provided"}
Need: ${brief.need ?? "not provided"}
Differentiator: ${brief.differentiator ?? "not provided"}
Positioning: ${brief.positioning ?? "not provided"}
Industry label (context only, do not copy stock topics): ${industry.label}
Audience: ${input.audience}
Location: ${input.location || "not provided"}
Stage: ${brief.stage ?? "not provided"}
${personaBrief(persona)}
${budgetNote}
${hasChannel(brief, "social") ? "Include facebookAds with concrete primaryText and headline for this offer." : "Do not invent social channels the owner did not select; leave instagramCaptions and facebookAds empty."}`,
      ),
    ),
    task: "creative",
    // Structured marketing JSON benefits from lower temperature (fewer invented metrics).
    temperature: 0.55,
    maxTokens: 3200,
    timeoutMs: 90_000,
    schema: marketingLlmSchema,
  });

  // Defense in depth: generateJson may already have validated; mocks and edge
  // payloads still go through the preprocess/normalize schema here.
  const validated = marketingLlmSchema.safeParse(res.data);
  const d = validated.success ? validated.data : null;
  // An answer with nothing usable in it is invalid output, not an AI-written plan.
  if (!d || !hasMarketingContent(d)) {
    console.warn(`[marketing] llm output rejected: ${res.note ?? "no-usable-content"}`);
    return withLlmTelemetry(
      {
        data: {
          strategy,
          instagram: buildInstagramPosts(ctx, brand, brief, socialCaptions),
          facebookAds: buildFacebookAds(ctx, brand, brief, persona, detAds),
        },
        source: "deterministic",
        note: fallbackNote(res.note),
      },
      res,
    );
  }
  const mergedStrategy: MarketingStrategy = {
    positioning: nonEmpty(d.positioning, strategy.positioning),
    messaging: ensureArray(d.messaging, strategy.messaging),
    channels: ownerChannels(d.channels ?? [], strategy.channels),
    // A numeric target with no measurement behind it would be an invented benchmark.
    kpis: ensureArray(
      d.kpis?.map((k) => ({ metric: nonEmpty(k.metric, ""), target: /\d/.test(k.target ?? "") ? MEASURE : nonEmpty(k.target, MEASURE) })).filter((k) => k.metric),
      strategy.kpis,
    ),
    contentPillars: ensureArray(
      d.contentPillars?.map((p) => ({ pillar: nonEmpty(p.pillar, ""), description: nonEmpty(p.description, ""), sampleTopics: ensureArray(p.sampleTopics, []) })).filter((p) => p.pillar),
      strategy.contentPillars,
    ),
    // Calendar themes follow the (possibly LLM-refined) pillars so weeks stay offer-specific.
    calendar: deriveCalendar(
      ensureArray(
        d.contentPillars?.map((p) => ({ pillar: nonEmpty(p.pillar, ""), description: nonEmpty(p.description, ""), sampleTopics: ensureArray(p.sampleTopics, []) })).filter((p) => p.pillar),
        strategy.contentPillars,
      ),
      brief,
    ),
  };

  const captions = hasChannel(brief, "social")
    ? ensureArray(
        d.instagramCaptions?.map((c) => ({ headline: nonEmpty(c.headline, ""), caption: nonEmpty(c.caption, ""), cta: nonEmpty(c.cta, "Learn more") })).filter((c) => c.headline && c.caption),
        detCaptions,
      )
    : [];
  const ads = hasChannel(brief, "social")
    ? ensureArray(
        d.facebookAds
          ?.map((a) => ({
            objective: nonEmpty(a.objective, "Awareness"),
            primaryText: nonEmpty(a.primaryText, ""),
            headline: nonEmpty(a.headline, ""),
            description: nonEmpty(a.description, ""),
            cta: nonEmpty(a.cta, "Learn More"),
          }))
          .filter((a) => a.primaryText && a.headline),
        detAds,
      )
    : [];

  return withLlmTelemetry(
    {
      data: {
        strategy: mergedStrategy,
        instagram: buildInstagramPosts(ctx, brand, brief, captions),
        facebookAds: buildFacebookAds(ctx, brand, brief, persona, ads),
      },
      source: "llm",
    },
    res,
  );
}
