import type {
  Brand,
  CompetitorAnalysis,
  CustomerPersona,
  PricingStrategy,
  WebsitePage,
  WebsiteSection,
} from "@/lib/types";
import { nonEmpty, ensureArray } from "@/lib/utils";
import { generateJson } from "@/lib/ai/client";
import { websiteCopyLlmSchema } from "@/lib/schemas";
import type { AgentOutput, GenerationContext } from "@/lib/agents/context";

export interface WebsiteCore {
  pages: WebsitePage[];
  navItems: { label: string; href: string }[];
  footerColumns: { title: string; links: { label: string; href: string }[] }[];
}

interface CopyKit {
  heroHeading: string;
  heroSub: string;
  heroCta: string;
  valueProps: { title: string; description: string }[];
  about: string;
  services: { title: string; description: string }[];
  faq: { q: string; a: string }[];
}

function deterministicCopy(ctx: GenerationContext, brand: Brand): CopyKit {
  const { input, industry } = ctx;
  return {
    heroHeading: `${industry.valueProps[0] ?? "Something better"}, for ${input.audience.toLowerCase()}`,
    heroSub: `${brand.name} brings a ${input.style.split(" / ")[0]!.toLowerCase()} approach to ${industry.label.toLowerCase()} in ${input.location}. ${brand.slogan}`,
    heroCta: "Get started",
    valueProps: industry.valueProps.slice(0, 3).map((v) => ({
      title: v,
      description: `We make ${v.toLowerCase()} the standard, not the exception — so you always know what to expect.`,
    })),
    about: `${brand.description} ${brand.mission} Founded in ${input.location}, we exist to prove that ${industry.label.toLowerCase()} can be done with genuine care and uncompromising quality.`,
    services: industry.services,
    faq: [
      { q: `What makes ${brand.name} different?`, a: `${industry.valueProps[0] ?? "Quality"} combined with a ${input.style.split(" / ")[0]!.toLowerCase()} experience built specifically for ${input.audience.toLowerCase()}.` },
      { q: "Where are you located?", a: `We proudly serve ${input.location} and the surrounding area.` },
      { q: "How do I get started?", a: `It's easy — reach out through our contact page or book directly, and we'll take care of the rest.` },
      { q: "What does it cost?", a: `We offer transparent, tiered pricing to fit different needs. See our pricing section for details.` },
    ],
  };
}

function buildPages(ctx: GenerationContext, brand: Brand, persona: CustomerPersona, competitors: CompetitorAnalysis, pricing: PricingStrategy, copy: CopyKit): WebsitePage[] {
  const { input } = ctx;

  const home: WebsiteSection[] = [
    { id: "hero", type: "hero", heading: copy.heroHeading, subheading: copy.heroSub, primaryCta: copy.heroCta, secondaryCta: "Learn more" },
    { id: "stats", type: "stats", heading: "Trusted by people like you", items: [
      { title: "100%", description: "Customer-first" },
      { title: "5★", description: "Quality standard" },
      { title: input.location.split(",")[0]!, description: "Proudly local" },
      { title: "24/7", description: "Here when you need us" },
    ] },
    { id: "features", type: "features", heading: "Why choose us", subheading: "The things that set us apart.", items: copy.valueProps.map((v) => ({ title: v.title, description: v.description })) },
    { id: "services", type: "services", heading: "What we offer", subheading: "Solutions designed around your needs.", items: copy.services },
    { id: "social-proof", type: "social-proof", heading: "Loved by our customers", items: [
      { title: persona.name, description: `"${brand.name} completely changed my experience. ${persona.quote.replace(/"/g, "")}"` },
      { title: "Verified customer", description: `"Honestly the best ${ctx.industry.label.toLowerCase()} experience I've had in ${input.location}."` },
      { title: "Happy client", description: `"${copy.valueProps[0]?.title ?? "Great quality"} — exactly as promised. Highly recommend."` },
    ] },
    { id: "cta", type: "cta", heading: `Ready to experience ${brand.name}?`, subheading: brand.slogan, primaryCta: copy.heroCta, secondaryCta: "Contact us" },
  ];

  const about: WebsiteSection[] = [
    { id: "about-hero", type: "hero", heading: `About ${brand.name}`, subheading: brand.mission },
    { id: "about-story", type: "about", heading: "Our story", body: copy.about },
    { id: "about-values", type: "features", heading: "What we stand for", items: brand.values.map((v) => ({ title: v, description: "" })) },
    { id: "about-cta", type: "cta", heading: "Join us on the journey", subheading: brand.vision, primaryCta: "Get started" },
  ];

  const services: WebsiteSection[] = [
    { id: "services-hero", type: "hero", heading: "Our services", subheading: `Everything ${brand.name} offers, tailored to you.` },
    { id: "services-list", type: "services", heading: "What we do", items: copy.services },
    { id: "services-pricing", type: "pricing", heading: "Simple, transparent pricing", subheading: pricing.model, items: pricing.tiers.map((t) => ({ title: `${t.name} — ${t.price}${t.cadence}`, description: t.tagline })) },
    { id: "services-faq", type: "faq", heading: "Frequently asked questions", items: copy.faq.map((f) => ({ title: f.q, description: f.a })) },
  ];

  const contact: WebsiteSection[] = [
    { id: "contact-hero", type: "hero", heading: "Get in touch", subheading: `We'd love to hear from you. Reach out and a real person will respond.` },
    { id: "contact-info", type: "contact", heading: "Contact details", items: [
      { title: "Location", description: input.location },
      { title: "Email", description: `hello@${brand.name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com` },
      { title: "Hours", description: "Mon–Sat, 9am–6pm" },
      { title: "Response time", description: "Within one business day" },
    ] },
    { id: "contact-cta", type: "cta", heading: "Prefer to start now?", subheading: "Skip the wait and get going today.", primaryCta: "Get started" },
  ];

  const pricing_page: WebsiteSection[] = [
    { id: "pricing-hero", type: "hero", heading: "Simple, transparent pricing", subheading: pricing.rationale },
    { id: "pricing-tiers", type: "pricing", heading: "Choose your plan", subheading: pricing.model, items: pricing.tiers.map((t) => ({ title: `${t.name} — ${t.price}${t.cadence}`, description: `${t.tagline} · ${t.features.slice(0, 3).join(", ")}` })) },
    { id: "pricing-faq", type: "faq", heading: "Pricing questions", items: copy.faq.filter((f) => /cost|price|pay/i.test(f.q)).concat([{ q: "Can I change plans later?", a: "Absolutely — upgrade, downgrade or cancel anytime." }]).map((f) => ({ title: f.q, description: f.a })) },
    { id: "pricing-cta", type: "cta", heading: `Ready to get started with ${brand.name}?`, subheading: brand.slogan, primaryCta: copy.heroCta },
  ];

  const faq_page: WebsiteSection[] = [
    { id: "faq-hero", type: "hero", heading: "Frequently asked questions", subheading: `Everything you need to know about ${brand.name}.` },
    { id: "faq-list", type: "faq", heading: "Questions & answers", items: copy.faq.map((f) => ({ title: f.q, description: f.a })) },
    { id: "faq-cta", type: "cta", heading: "Still have questions?", subheading: "Reach out — a real person will help.", primaryCta: "Contact us" },
  ];

  // Dedicated high-converting landing page (Landing Page Agent deliverable).
  const landing: WebsiteSection[] = [
    { id: "lp-hero", type: "hero", heading: copy.heroHeading, subheading: copy.heroSub, primaryCta: copy.heroCta, secondaryCta: "See pricing" },
    { id: "lp-benefits", type: "features", heading: "Why you'll love it", subheading: "The benefits that matter most.", items: copy.valueProps.map((v) => ({ title: v.title, description: v.description })) },
    { id: "lp-features", type: "services", heading: "What's included", subheading: `Everything ${brand.name} delivers.`, items: copy.services },
    { id: "lp-testimonials", type: "testimonials", heading: "What customers say", items: [
      { title: persona.name, description: `"${brand.name} delivered exactly what I needed. ${persona.quote.replace(/"/g, "")}"` },
      { title: "Verified customer", description: `"The best ${ctx.industry.label.toLowerCase()} experience I've had in ${input.location}."` },
      { title: "Happy client", description: `"${copy.valueProps[0]?.title ?? "Great quality"} — exactly as promised. Highly recommend."` },
    ] },
    { id: "lp-cta", type: "cta", heading: `Start with ${brand.name} today`, subheading: brand.slogan, primaryCta: copy.heroCta, secondaryCta: "Talk to us" },
  ];

  return [
    { slug: "/", title: `${brand.name} — ${brand.slogan}`, metaDescription: copy.heroSub.slice(0, 155), sections: home },
    { slug: "/landing", title: `${copy.heroHeading} — ${brand.name}`, metaDescription: copy.heroSub.slice(0, 155), sections: landing },
    { slug: "/about", title: `About — ${brand.name}`, metaDescription: brand.mission.slice(0, 155), sections: about },
    { slug: "/services", title: `Services — ${brand.name}`, metaDescription: `Explore everything ${brand.name} offers.`.slice(0, 155), sections: services },
    { slug: "/pricing", title: `Pricing — ${brand.name}`, metaDescription: `Simple, transparent pricing from ${brand.name}.`.slice(0, 155), sections: pricing_page },
    { slug: "/faq", title: `FAQ — ${brand.name}`, metaDescription: `Answers to common questions about ${brand.name}.`.slice(0, 155), sections: faq_page },
    { slug: "/contact", title: `Contact — ${brand.name}`, metaDescription: `Get in touch with ${brand.name} in ${input.location}.`.slice(0, 155), sections: contact },
  ];
}

export async function runWebsiteAgent(
  ctx: GenerationContext,
  brand: Brand,
  persona: CustomerPersona,
  competitors: CompetitorAnalysis,
  pricing: PricingStrategy,
): Promise<AgentOutput<WebsiteCore>> {
  let copy = deterministicCopy(ctx, brand);
  let source: "llm" | "deterministic" = "deterministic";
  let note: string | undefined;

  if (ctx.useLlm) {
    const res = await generateJson<unknown>({
      system: "You are a senior conversion copywriter. Write compelling, specific website copy. No clichés, no lorem ipsum.",
      user: `Return JSON: hero {heading (<=10 words), subheading (1-2 sentences), primaryCta}, valueProps[3 of {title (<=5 words), description}], about (2-3 sentences), services[3 of {title, description}], faq[4 of {q, a}].
Brand: ${brand.name} — "${brand.slogan}"
Voice: ${brand.voice.join(", ")}
Business: ${ctx.input.idea}
Audience: ${ctx.input.audience}
Location: ${ctx.input.location}`,
      temperature: 0.8,
      maxTokens: 1600,
    });
    const parsed = websiteCopyLlmSchema.safeParse(res.data);
    if (res.data && parsed.success) {
      const d = parsed.data;
      copy = {
        heroHeading: nonEmpty(d.hero?.heading, copy.heroHeading),
        heroSub: nonEmpty(d.hero?.subheading, copy.heroSub),
        heroCta: nonEmpty(d.hero?.primaryCta, copy.heroCta),
        valueProps: ensureArray(d.valueProps?.map((v) => ({ title: nonEmpty(v.title, ""), description: nonEmpty(v.description, "") })).filter((v) => v.title), copy.valueProps),
        about: nonEmpty(d.about, copy.about),
        services: ensureArray(d.services?.map((s) => ({ title: nonEmpty(s.title, ""), description: nonEmpty(s.description, "") })).filter((s) => s.title), copy.services),
        faq: ensureArray(d.faq?.map((f) => ({ q: nonEmpty(f.q, ""), a: nonEmpty(f.a, "") })).filter((f) => f.q), copy.faq),
      };
      source = "llm";
    } else {
      note = res.note;
    }
  }

  const pages = buildPages(ctx, brand, persona, competitors, pricing, copy);

  return {
    data: {
      pages,
      navItems: [
        { label: "Home", href: "/" },
        { label: "About", href: "/about" },
        { label: "Services", href: "/services" },
        { label: "Pricing", href: "/pricing" },
        { label: "FAQ", href: "/faq" },
        { label: "Contact", href: "/contact" },
      ],
      footerColumns: [
        { title: "Company", links: [{ label: "About", href: "/about" }, { label: "Services", href: "/services" }, { label: "Contact", href: "/contact" }] },
        { title: "Explore", links: [{ label: "Pricing", href: "/pricing" }, { label: "FAQ", href: "/faq" }, { label: "Landing page", href: "/landing" }] },
        { title: "Connect", links: [{ label: "Instagram", href: "#" }, { label: "Facebook", href: "#" }, { label: "Email", href: "#" }] },
      ],
    },
    source,
    note,
  };
}
