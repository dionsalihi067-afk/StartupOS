import type { Brand, WhatsAppFlow, WhatsAppNode } from "@/lib/types";
import type { AgentOutput, GenerationContext } from "@/lib/agents/context";
import { midSentence } from "@/lib/utils";
import { audiencePhrase, copyBrief } from "@/lib/agents/copy-brief";

/**
 * WhatsApp Agent — builds a real, branching chatbot flow as a graph of nodes.
 * Copy is grounded in the owner's offer and audience; it never invents price
 * tiers, popularity, testimonials, or that the visitor already asked to buy.
 * In-app chatbot preview only — not WhatsApp Business API.
 */

function flowLanguage(ctx: GenerationContext): "en" | "sq" {
  const lang = ctx.input.discovery?.brand.language;
  // both → Albanian-first shell (same policy as website chrome); bilingual LLM paths use languageInstruction elsewhere.
  if (lang === "en") return "en";
  return "sq";
}

export function runWhatsAppAgent(ctx: GenerationContext, brand: Brand): AgentOutput<WhatsAppFlow> {
  const brief = copyBrief(ctx);
  const offering = brief.offering;
  const lang = flowLanguage(ctx);
  const aud = midSentence(audiencePhrase(brief) || (lang === "sq" ? "njerëz si ju" : "people like you"));
  const place = brief.location ? ` (${brief.location})` : "";
  const industrySvc = ctx.industry.services;
  const offerLabel =
    brief.modelKind === "saas" || brief.modelKind === "product"
      ? lang === "sq"
        ? "produktet"
        : "products"
      : lang === "sq"
        ? "shërbimet"
        : "services";
  const primaryLabel = industrySvc[0]?.title && !brief.offering ? industrySvc[0].title : offering.slice(0, 40);
  const secondaryLabel = industrySvc[1]?.title ?? (lang === "sq" ? "Diçka tjetër" : "Something else");

  const pricingMessage =
    lang === "sq"
      ? brief.earlyStage
        ? `Nuk kemi ende një listë fikse çmimesh për ${offering}. Na thoni çfarë ju duhet dhe do t'ju shpjegojmë si funksionon çmimi — pa zbritje të shpikura këtu.`
        : `Çmimi për ${offering} varet nga ajo që ju duhet. Përshkruani shkurt dhe do t'ju tregojmë hapin e radhës — pa shpikur nivele ose oferta në chat.`
      : brief.earlyStage
        ? `We have not published a fixed price list yet for ${offering}. Tell us what you need and we will explain how pricing works — we will not invent discounts here.`
        : `Pricing for ${offering} depends on what you need. Share a short description and we will point you to the right next step — we do not invent tiers or promotions in chat.`;

  const nodes: WhatsAppNode[] =
    lang === "sq"
      ? [
          {
            id: "start",
            speaker: "bot",
            message: `Përshëndetje — këtu është ${brand.name}${place}. Fokusi ynë është ${offering}. Si mund t'ju ndihmojmë?`,
            options: [
              { label: `Rreth ${offerLabel}`, next: "services" },
              { label: "Pyetje për çmimin", next: "pricing" },
              { label: "Bëj një pyetje", next: "qualify" },
              { label: "Fol me një person", next: "human" },
            ],
          },
          {
            id: "services",
            speaker: "bot",
            message: `${brand.name} ofron ${offering}. Cila është më e afërta me atë që ju duhet?`,
            options: [
              { label: primaryLabel, next: "service_detail" },
              { label: secondaryLabel, next: "service_detail" },
              { label: "Nuk jam i sigurt ende", next: "qualify" },
            ],
          },
          {
            id: "service_detail",
            speaker: "bot",
            message: `${offering}${brief.differentiator ? ` — ${brief.differentiator}` : industrySvc[0]?.description ? ` — ${industrySvc[0].description}` : "."} Dëshironi detaje, apo t'ju lidhim me dikë?`,
            options: [
              { label: "Dërgo detaje", next: "nurture" },
              { label: "Pyet për çmimin", next: "pricing" },
              { label: "Kthehu te menuja", next: "start" },
            ],
          },
          {
            id: "qualify",
            speaker: "bot",
            message: `Në rregull. Çfarë është më e rëndësishme për ju tani?`,
            options: [
              { label: brief.need?.slice(0, 40) || ctx.industry.goals[0] || "Informacion i qartë", next: "recommend" },
              { label: brief.problem ? `Ndihmë me: ${brief.problem.slice(0, 36)}` : ctx.industry.goals[1] || "Një zgjedhje e mirë", next: "recommend" },
              { label: "Vetëm po shfletoj", next: "nurture" },
            ],
          },
          {
            id: "recommend",
            speaker: "bot",
            message: `E kuptuam. Për ${aud}, hapi i radhës është të na tregoni çfarë ju duhet nga ${offering}. Pastaj ju orientojmë pa shpikur një paketë standarde.`,
            options: [
              { label: "Ndaj çfarë më duhet", next: "collect_contact" },
              { label: "Më dërgo info fillimisht", next: "nurture" },
            ],
          },
          {
            id: "pricing",
            speaker: "bot",
            message: pricingMessage,
            options: [
              { label: "Përshkruaj çfarë më duhet", next: "collect_contact" },
              { label: "Kthehu te menuja", next: "start" },
            ],
          },
          {
            id: "collect_contact",
            speaker: "user",
            message: "[Vizitori ndan emrin dhe të dhënat e kontaktit]",
            next: "confirm",
          },
          {
            id: "confirm",
            speaker: "bot",
            message: `Faleminderit. Dikush nga ${brand.name} do t'ju kontaktojë. Diçka tjetër?`,
            options: [
              { label: "Kjo është e gjitha", next: "end" },
              { label: "Pyetje tjetër", next: "start" },
            ],
          },
          {
            id: "nurture",
            speaker: "bot",
            message: `Pa nxitim. Kur të doni detaje për ${offering}, na shkruani — do t'ju përgjigjemi pa pretendime të tepruara.`,
            options: [{ label: "Në rregull", next: "end" }],
          },
          {
            id: "human",
            speaker: "bot",
            message: `Sigurisht. Lini një shënim të shkurtër për atë që ju duhet dhe një koleg do ta marrë.`,
            next: "collect_contact",
          },
          {
            id: "end",
            speaker: "bot",
            message: `Faleminderit që biseduat me ${brand.name}. Flasim së shpejti.`,
          },
        ]
      : [
          {
            id: "start",
            speaker: "bot",
            message: `Hi — this is ${brand.name}${place}. We focus on ${offering}. How can we help?`,
            options: [
              { label: `About our ${offerLabel}`, next: "services" },
              { label: "Pricing questions", next: "pricing" },
              { label: "Ask a question", next: "qualify" },
              { label: "Talk to a person", next: "human" },
            ],
          },
          {
            id: "services",
            speaker: "bot",
            message: `${brand.name} offers ${offering}. Which is closest to what you need?`,
            options: [
              { label: primaryLabel, next: "service_detail" },
              { label: secondaryLabel, next: "service_detail" },
              { label: "Not sure yet", next: "qualify" },
            ],
          },
          {
            id: "service_detail",
            speaker: "bot",
            message: `${offering}${brief.differentiator ? ` — ${brief.differentiator}` : industrySvc[0]?.description ? ` — ${industrySvc[0].description}` : "."} Want details, or shall we connect you with someone?`,
            options: [
              { label: "Send details", next: "nurture" },
              { label: "Ask about pricing", next: "pricing" },
              { label: "Back to menu", next: "start" },
            ],
          },
          {
            id: "qualify",
            speaker: "bot",
            message: `No problem. What matters most for you right now?`,
            options: [
              { label: brief.need?.slice(0, 40) || ctx.industry.goals[0] || "Clear information", next: "recommend" },
              { label: brief.problem ? `Help with: ${brief.problem.slice(0, 36)}` : ctx.industry.goals[1] || "A good fit", next: "recommend" },
              { label: "Just browsing", next: "nurture" },
            ],
          },
          {
            id: "recommend",
            speaker: "bot",
            message: `Got it. For ${aud}, a good next step is to tell us a bit more about what you need from ${offering}. We can then point you in the right direction without inventing a default package.`,
            options: [
              { label: "Share what I need", next: "collect_contact" },
              { label: "Send me info first", next: "nurture" },
            ],
          },
          {
            id: "pricing",
            speaker: "bot",
            message: pricingMessage,
            options: [
              { label: "Describe what I need", next: "collect_contact" },
              { label: "Back to menu", next: "start" },
            ],
          },
          {
            id: "collect_contact",
            speaker: "user",
            message: "[Visitor shares name and contact details]",
            next: "confirm",
          },
          {
            id: "confirm",
            speaker: "bot",
            message: `Thanks. Someone from ${brand.name} will follow up. Anything else?`,
            options: [
              { label: "That's all", next: "end" },
              { label: "Another question", next: "start" },
            ],
          },
          {
            id: "nurture",
            speaker: "bot",
            message: `No rush. When you want details on ${offering}, message us anytime — we will answer without spammy claims.`,
            options: [{ label: "Sounds good", next: "end" }],
          },
          {
            id: "human",
            speaker: "bot",
            message: `Sure. Leave a short note about what you need and a teammate will pick it up.`,
            next: "collect_contact",
          },
          {
            id: "end",
            speaker: "bot",
            message: `Thanks for chatting with ${brand.name}. Talk soon.`,
          },
        ];

  return {
    data: {
      name: lang === "sq" ? `Asistenti WhatsApp i ${brand.name}` : `${brand.name} WhatsApp assistant`,
      goal:
        lang === "sq"
          ? `Përgjigjet për ${offering} dhe mbledh kontaktin kur vizitori dëshiron ndjekje.`
          : `Answer questions about ${offering} and capture contact details when the visitor wants a follow-up.`,
      nodes,
    },
    source: "deterministic",
  };
}
