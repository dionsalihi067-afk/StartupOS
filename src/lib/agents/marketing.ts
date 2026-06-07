import type {
  Brand,
  CustomerPersona,
  FacebookAd,
  InstagramPost,
  LinkedInPost,
  MarketingStrategy,
} from "@/lib/types";
import { nonEmpty, ensureArray, pickN, uid } from "@/lib/utils";
import { generateJson } from "@/lib/ai/client";
import { marketingLlmSchema } from "@/lib/schemas";
import type { AgentOutput, GenerationContext } from "@/lib/agents/context";
import { instagramCreative, facebookAdCreative } from "@/lib/engine/creatives";

export interface MarketingCore {
  strategy: MarketingStrategy;
  instagram: InstagramPost[];
  facebookAds: FacebookAd[];
  linkedin: LinkedInPost[];
  contentIdeas: string[];
}

function hashtagsFor(brand: Brand, ctx: GenerationContext): string[] {
  const loc = ctx.input.location.split(",")[0]!.replace(/\s+/g, "");
  const base = brand.name.replace(/[^a-zA-Z0-9]/g, "");
  return [
    `#${base}`,
    `#${loc}`,
    `#${ctx.industry.label.replace(/[^a-zA-Z]/g, "")}`,
    "#SmallBusiness",
    "#ShopLocal",
  ].filter(Boolean);
}

function deterministicStrategy(ctx: GenerationContext, brand: Brand, persona: CustomerPersona): MarketingStrategy {
  const { input, industry, rng } = ctx;
  const channels = industry.channels.slice(0, 4);
  const budgets = [40, 25, 20, 15];
  return {
    positioning: `For ${input.audience.toLowerCase()} in ${input.location} who are tired of ${industry.painPoints[0]?.toLowerCase() ?? "the status quo"}, ${brand.name} is the ${input.style.split(" / ")[0]!.toLowerCase()} ${industry.label.toLowerCase()} brand that delivers ${industry.valueProps[0]?.toLowerCase() ?? "a better experience"} — without the usual trade-offs.`,
    channels: channels.map((channel, i) => ({
      channel,
      rationale: `Where ${persona.name} and similar customers already spend attention; strong fit for ${industry.label.toLowerCase()}.`,
      budgetPercent: budgets[i] ?? 10,
    })),
    messaging: [
      brand.slogan,
      `${industry.valueProps[0] ?? "Quality you can trust"} — every single time.`,
      `Made for ${input.audience.toLowerCase()}.`,
      `Proudly serving ${input.location}.`,
    ],
    kpis: [
      { metric: "Cost per acquisition (CPA)", target: "Below category average" },
      { metric: "Conversion rate", target: "3–5% on landing page" },
      { metric: "Engagement rate", target: "5%+ on social" },
      { metric: "Repeat / retention rate", target: "40%+ within 90 days" },
    ],
    contentPillars: industry.contentTopics.slice(0, 4).map((topic) => ({
      pillar: topic,
      description: `Content that builds trust and showcases ${brand.name}'s ${input.style.split(" / ")[0]!.toLowerCase()} approach.`,
      sampleTopics: pickN(rng, industry.contentTopics, 3),
    })),
    calendar: [1, 2, 3, 4].map((week) => ({
      week,
      theme: industry.contentTopics[(week - 1) % industry.contentTopics.length] ?? "Brand stories",
      deliverables: ["3 Instagram posts", "1 email", "2 stories", "1 ad refresh"],
    })),
  };
}

function buildInstagramPosts(ctx: GenerationContext, brand: Brand, captions: { headline: string; caption: string; cta: string }[]): InstagramPost[] {
  const formats: InstagramPost["format"][] = ["single", "carousel", "reel"];
  const tags = hashtagsFor(brand, ctx);
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
      subtext: ctx.industry.valueProps[i % ctx.industry.valueProps.length],
      cta: c.cta,
      badge: i === 0 ? "New" : undefined,
      headingFont: brand.typography.headingFont,
      variant: i,
    }),
  }));
}

function buildLinkedInPosts(ctx: GenerationContext, brand: Brand, posts: { hook: string; body: string; cta: string }[]): LinkedInPost[] {
  const tags = linkedinTags(brand, ctx);
  return posts.map((p) => ({
    id: uid("li"),
    hook: p.hook,
    body: p.body,
    hashtags: tags,
    cta: p.cta,
  }));
}

function linkedinTags(brand: Brand, ctx: GenerationContext): string[] {
  const ind = ctx.industry.label.replace(/[^a-zA-Z]/g, "");
  const loc = ctx.input.location.split(",")[0]!.replace(/\s+/g, "");
  return [`#${ind}`, `#${loc}`, "#SmallBusiness", "#Entrepreneurship", "#Founders"];
}

function buildFacebookAds(ctx: GenerationContext, brand: Brand, ads: { objective: string; primaryText: string; headline: string; description: string; cta: string }[]): FacebookAd[] {
  return ads.map((a, i) => ({
    id: uid("fb"),
    objective: a.objective,
    primaryText: a.primaryText,
    headline: a.headline,
    description: a.description,
    cta: a.cta,
    audience: `${ctx.input.audience} • ${ctx.input.location} • interests in ${ctx.industry.label.toLowerCase()}`,
    estimatedCpc: ["$0.45–$0.90", "$0.60–$1.20", "$0.35–$0.75"][i % 3]!,
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
  const strategy = deterministicStrategy(ctx, brand, persona);
  const { input, industry } = ctx;
  const aud = input.audience.toLowerCase();
  const city = input.location.split(",")[0]!;
  const vp = (i: number) => industry.valueProps[i % industry.valueProps.length] ?? "a better experience";

  const detCaptions = [
    { headline: `${industry.valueProps[0] ?? "Something better"} is here`, caption: `Meet ${brand.name}. ${brand.slogan} We built this for ${aud} who deserve better. Tap to learn more.`, cta: "Learn more" },
    { headline: `Why ${city} chooses us`, caption: `${brand.description.split(".")[0]}. Here's what makes ${brand.name} different — swipe to see. 👉`, cta: "Discover" },
    { headline: "Behind the brand", caption: `Every detail at ${brand.name} is intentional. ${vp(1)}. Follow along for the journey.`, cta: "Follow us" },
    { headline: "Your new favorite", caption: `Don't just take our word for it. Join the ${aud} already loving ${brand.name}. 💛`, cta: "Get started" },
    { headline: `The ${vp(0).toLowerCase()} difference`, caption: `We obsess over ${vp(0).toLowerCase()} so you don't have to settle. This is ${industry.label.toLowerCase()} done right. ✨`, cta: "See more" },
    { headline: "A day with us", caption: `Ever wonder what goes on behind the scenes at ${brand.name}? Here's a peek. 🎬 ${brand.slogan}`, cta: "Watch" },
    { headline: "Real results", caption: `${industry.goals[0] ?? "Your goals"}? We're here for it. See how ${brand.name} helps ${aud} every day.`, cta: "Learn how" },
    { headline: "Tips from the team", caption: `Quick tip for ${aud}: ${vp(2).toLowerCase()} matters more than you think. Save this for later. 📌`, cta: "Save post" },
    { headline: `Proudly serving ${city}`, caption: `We're local, and we love it. ${brand.name} is built for ${city} — by people who care. 📍`, cta: "Visit us" },
    { headline: "Ready when you are", caption: `No pressure, just great ${industry.label.toLowerCase()}. Whenever you're ready, ${brand.name} is here. ${brand.slogan}`, cta: "Get started" },
  ];

  const detAds = [
    { objective: "Awareness", primaryText: `Tired of ${industry.painPoints[0]?.toLowerCase() ?? "settling"}? ${brand.name} is the ${input.style.split(" / ")[0]!.toLowerCase()} choice for ${aud} in ${input.location}.`, headline: brand.slogan, description: vp(0), cta: "Learn More" },
    { objective: "Conversion", primaryText: `Ready for better? ${brand.name} delivers ${vp(1).toLowerCase()}. Limited spots — get started today.`, headline: `Try ${brand.name} today`, description: "Join hundreds of happy customers.", cta: "Sign Up" },
    { objective: "Retargeting", primaryText: `Still thinking it over? See why ${city} loves ${brand.name}. Your first step is easy.`, headline: "Still curious?", description: "Come back and see what's new.", cta: "Shop Now" },
    { objective: "Lead generation", primaryText: `Want ${vp(2).toLowerCase()} without the hassle? Tell us what you need and we'll take it from there.`, headline: `${brand.name} for ${city}`, description: "Get a quick, no-obligation start.", cta: "Sign Up" },
    { objective: "Traffic", primaryText: `${brand.slogan} Discover everything ${brand.name} offers ${aud} — built around ${vp(0).toLowerCase()}.`, headline: "See what's possible", description: "Explore the full experience.", cta: "Learn More" },
  ];

  const detLinkedIn = [
    { hook: `Most ${industry.label.toLowerCase()} brands get one thing wrong.`, body: `They treat ${aud} like a transaction. We started ${brand.name} to do the opposite — leading with ${vp(0).toLowerCase()} and genuine care. Here's what that looks like in practice.`, cta: "Follow for more" },
    { hook: `What ${city} taught us about ${industry.label.toLowerCase()}.`, body: `Building ${brand.name} here meant listening closely to ${aud}. The biggest lesson: ${vp(1).toLowerCase()} wins loyalty, not gimmicks.`, cta: "Read more" },
    { hook: `${industry.painPoints[0] ?? "The status quo"} is costing people more than they realize.`, body: `We see it every day. That's exactly the gap ${brand.name} was built to close — with ${vp(2).toLowerCase()} at the center.`, cta: "Learn how" },
    { hook: `Behind the scenes at ${brand.name}.`, body: `${brand.story.split(".")[0]}. Transparency matters to us, so here's an honest look at how we work and why.`, cta: "Connect with us" },
    { hook: `A note to ${aud}.`, body: `You deserve ${industry.label.toLowerCase()} that actually delivers. ${brand.slogan} If that resonates, we'd love to connect.`, cta: "Say hello" },
  ];

  const detContentIdeas = buildContentIdeas(ctx, brand);

  if (!ctx.useLlm) {
    return {
      data: {
        strategy,
        instagram: buildInstagramPosts(ctx, brand, detCaptions),
        facebookAds: buildFacebookAds(ctx, brand, detAds),
        linkedin: buildLinkedInPosts(ctx, brand, detLinkedIn),
        contentIdeas: detContentIdeas,
      },
      source: "deterministic",
    };
  }

  const res = await generateJson<unknown>({
    system: "You are a senior growth marketer and copywriter. Write scroll-stopping, on-brand marketing assets specific to THIS business. No clichés, no lorem ipsum, no generic filler.",
    user: `Return JSON with: positioning (1-2 sentences), messaging[4], channels[4 of {channel, rationale, budgetPercent (number, sum=100)}], kpis[4 of {metric, target}], contentPillars[4 of {pillar, description, sampleTopics[3]}], instagramCaptions[10 of {headline (<=6 words), caption (with emoji), cta}], facebookAds[5 of {objective, primaryText, headline, description, cta}], linkedinPosts[5 of {hook (1 line), body (2-3 sentences, professional tone), cta}], contentIdeas[10 short, specific content ideas across formats].
Brand: ${brand.name} — "${brand.slogan}"
Voice: ${brand.voice.join(", ")}
Business: ${input.idea}
Industry: ${industry.label}
Audience: ${input.audience}
Location: ${input.location}`,
    temperature: 0.85,
    maxTokens: 3200,
  });

  const parsed = marketingLlmSchema.safeParse(res.data);
  if (!res.data || !parsed.success) {
    return {
      data: {
        strategy,
        instagram: buildInstagramPosts(ctx, brand, detCaptions),
        facebookAds: buildFacebookAds(ctx, brand, detAds),
        linkedin: buildLinkedInPosts(ctx, brand, detLinkedIn),
        contentIdeas: detContentIdeas,
      },
      source: "deterministic",
      note: res.note,
    };
  }

  const d = parsed.data;
  const mergedStrategy: MarketingStrategy = {
    positioning: nonEmpty(d.positioning, strategy.positioning),
    messaging: ensureArray(d.messaging, strategy.messaging),
    channels: ensureArray(
      d.channels?.map((c) => ({ channel: nonEmpty(c.channel, ""), rationale: nonEmpty(c.rationale, ""), budgetPercent: typeof c.budgetPercent === "number" ? c.budgetPercent : 0 })).filter((c) => c.channel),
      strategy.channels,
    ),
    kpis: ensureArray(d.kpis?.map((k) => ({ metric: nonEmpty(k.metric, ""), target: nonEmpty(k.target, "") })).filter((k) => k.metric), strategy.kpis),
    contentPillars: ensureArray(
      d.contentPillars?.map((p) => ({ pillar: nonEmpty(p.pillar, ""), description: nonEmpty(p.description, ""), sampleTopics: ensureArray(p.sampleTopics, []) })).filter((p) => p.pillar),
      strategy.contentPillars,
    ),
    calendar: strategy.calendar,
  };

  const captions = ensureArray(
    d.instagramCaptions?.map((c) => ({ headline: nonEmpty(c.headline, ""), caption: nonEmpty(c.caption, ""), cta: nonEmpty(c.cta, "Learn more") })).filter((c) => c.headline && c.caption),
    detCaptions,
  );
  const ads = ensureArray(
    d.facebookAds?.map((a) => ({ objective: nonEmpty(a.objective, "Conversion"), primaryText: nonEmpty(a.primaryText, ""), headline: nonEmpty(a.headline, ""), description: nonEmpty(a.description, ""), cta: nonEmpty(a.cta, "Learn More") })).filter((a) => a.primaryText && a.headline),
    detAds,
  );
  const linkedinPosts = ensureArray(
    d.linkedinPosts?.map((p) => ({ hook: nonEmpty(p.hook, ""), body: nonEmpty(p.body, ""), cta: nonEmpty(p.cta, "Connect with us") })).filter((p) => p.hook && p.body),
    detLinkedIn,
  );
  const contentIdeas = ensureArray(d.contentIdeas, detContentIdeas).slice(0, 10);

  return {
    data: {
      strategy: mergedStrategy,
      instagram: buildInstagramPosts(ctx, brand, captions),
      facebookAds: buildFacebookAds(ctx, brand, ads),
      linkedin: buildLinkedInPosts(ctx, brand, linkedinPosts),
      contentIdeas,
    },
    source: "llm",
  };
}

/** Deterministic, business-specific content ideas across formats. */
function buildContentIdeas(ctx: GenerationContext, brand: Brand): string[] {
  const { industry, input } = ctx;
  const t = industry.contentTopics;
  const city = input.location.split(",")[0]!;
  const ideas = [
    `Reel: "${t[0] ?? "Behind the scenes"}" at ${brand.name}`,
    `Carousel: 5 things ${input.audience.toLowerCase()} should know about ${industry.label.toLowerCase()}`,
    `Before & after showcasing ${industry.valueProps[0]?.toLowerCase() ?? "real results"}`,
    `Customer spotlight: a real story from ${city}`,
    `Myth vs. fact: ${industry.painPoints[0]?.toLowerCase() ?? "common misconceptions"}`,
    `Quick tip: how to ${industry.goals[0]?.toLowerCase() ?? "get started"}`,
    `Meet the team behind ${brand.name}`,
    `"${t[1] ?? "How it works"}" explainer post`,
    `Poll: what matters most to you — quality, speed, or value?`,
    `Q&A: answering the top questions from ${input.audience.toLowerCase()}`,
  ];
  return ideas.slice(0, 10);
}
