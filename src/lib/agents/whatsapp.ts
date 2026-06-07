import type { Brand, WhatsAppFlow, WhatsAppKit, WhatsAppNode } from "@/lib/types";
import type { AgentOutput, GenerationContext } from "@/lib/agents/context";

/**
 * WhatsApp Agent — builds FOUR real, distinct chatbot flows as navigable node
 * graphs (greeting, FAQ, lead qualification, appointment booking). Every option
 * routes to an existing node id within its flow, so each can be previewed
 * interactively and exported to a chatbot builder.
 */
export function runWhatsAppAgent(ctx: GenerationContext, brand: Brand): AgentOutput<WhatsAppKit> {
  const { input, industry } = ctx;
  const svc = industry.services;
  const city = input.location.split(",")[0]!;

  const greeting: WhatsAppFlow = {
    key: "greeting",
    name: "Greeting & Menu",
    goal: "Welcome every contact and route them to the right place.",
    nodes: [
      {
        id: "start",
        speaker: "bot",
        message: `👋 Hi! Welcome to ${brand.name}. ${brand.slogan} How can we help you today?`,
        options: [
          { label: "Tell me about you", next: "about" },
          { label: "Opening hours", next: "hours" },
          { label: "Where are you?", next: "location" },
          { label: "Talk to the team", next: "handoff" },
        ],
      },
      { id: "about", speaker: "bot", message: `${brand.description.split(".")[0]}. We help ${input.audience.toLowerCase()} with ${(svc[0]?.title ?? "our services").toLowerCase()} and more.`, options: [{ label: "Sounds great 👍", next: "end" }, { label: "Back to menu", next: "start" }] },
      { id: "hours", speaker: "bot", message: `We're open Mon–Sat, 9am–6pm. Messages here are answered within one business day. 🕒`, options: [{ label: "Thanks!", next: "end" }, { label: "Back to menu", next: "start" }] },
      { id: "location", speaker: "bot", message: `📍 We proudly serve ${input.location} and the surrounding area. Want directions or to book a visit?`, options: [{ label: "Back to menu", next: "start" }, { label: "That's all", next: "end" }] },
      { id: "handoff", speaker: "bot", message: `Of course — connecting you with the ${brand.name} team now. Feel free to share what you need so we can help faster. 💬`, next: "end" },
      { id: "end", speaker: "bot", message: `Thanks for messaging ${brand.name}! 💛 Talk soon.` },
    ],
  };

  const faq: WhatsAppFlow = {
    key: "faq",
    name: "FAQ",
    goal: "Instantly answer the most common questions.",
    nodes: [
      {
        id: "start",
        speaker: "bot",
        message: `Happy to help! What would you like to know about ${brand.name}?`,
        options: [
          { label: "What do you offer?", next: "services" },
          { label: "How much does it cost?", next: "pricing" },
          { label: `Why choose ${brand.name}?`, next: "why" },
          { label: "How do I get started?", next: "getstarted" },
        ],
      },
      { id: "services", speaker: "bot", message: `We offer ${svc.map((s) => s.title).join(", ")}. ${svc[0]?.description ?? ""}`, options: [{ label: "Another question", next: "start" }, { label: "I'm ready", next: "getstarted" }] },
      { id: "pricing", speaker: "bot", message: `Our pricing is transparent with options for every need — Starter, Growth and Premium. Most customers pick the middle tier for the best value. Want the full breakdown?`, options: [{ label: "Yes, send it", next: "getstarted" }, { label: "Another question", next: "start" }] },
      { id: "why", speaker: "bot", message: `Great question. ${industry.valueProps[0] ?? "Quality"} and ${(industry.valueProps[1] ?? "real care").toLowerCase()} — built specifically for ${input.audience.toLowerCase()} in ${city}.`, options: [{ label: "Another question", next: "start" }, { label: "Let's go", next: "getstarted" }] },
      { id: "getstarted", speaker: "bot", message: `Getting started is easy — just share your name and the best way to reach you, and we'll take it from there. ✅`, next: "end" },
      { id: "end", speaker: "bot", message: `Thanks for your questions! We're here whenever you need us. 💛` },
    ],
  };

  const qualification: WhatsAppFlow = {
    key: "qualification",
    name: "Lead Qualification",
    goal: "Understand the prospect's needs and capture a qualified lead.",
    nodes: [
      { id: "start", speaker: "bot", message: `Let's find the right fit for you. First — what's most important to you right now?`, options: [
        { label: industry.goals[0] ?? "Quality", next: "budget" },
        { label: industry.goals[1] ?? "Value", next: "budget" },
        { label: "Just exploring", next: "nurture" },
      ] },
      { id: "budget", speaker: "bot", message: `Got it. And roughly what timeframe are you working with?`, options: [
        { label: "As soon as possible", next: "recommend" },
        { label: "In the next few weeks", next: "recommend" },
        { label: "Still researching", next: "nurture" },
      ] },
      { id: "recommend", speaker: "bot", message: `Perfect — based on that, I'd recommend our most popular option. It's a strong fit for ${input.audience.toLowerCase()}. Can I grab your details so the team can tailor a plan?`, options: [{ label: "Yes, let's do it", next: "collect" }, { label: "Send info first", next: "nurture" }] },
      { id: "collect", speaker: "user", message: "[Customer shares name, contact + needs]", next: "confirm" },
      { id: "confirm", speaker: "bot", message: `Thank you! ✅ A ${brand.name} specialist will reach out shortly with a tailored recommendation.`, options: [{ label: "Great, thanks!", next: "end" }] },
      { id: "nurture", speaker: "bot", message: `No problem at all! 😊 I'll send a few helpful resources. Message us anytime when you're ready.`, options: [{ label: "Sounds good", next: "end" }] },
      { id: "end", speaker: "bot", message: `Thanks for chatting with ${brand.name}! 💛` },
    ],
  };

  const booking: WhatsAppFlow = {
    key: "booking",
    name: "Appointment Booking",
    goal: "Let customers book or request an appointment end-to-end.",
    nodes: [
      { id: "start", speaker: "bot", message: `Let's get you booked in! 📅 Which would you like?`, options: [
        { label: svc[0]?.title ?? "Standard appointment", next: "day" },
        { label: svc[1]?.title ?? "Consultation", next: "day" },
        { label: "Not sure — help me choose", next: "help" },
      ] },
      { id: "help", speaker: "bot", message: `No worries! Most first-timers start with a quick consultation so we can understand your needs. Shall I book that?`, options: [{ label: "Yes, book consultation", next: "day" }, { label: "Back", next: "start" }] },
      { id: "day", speaker: "bot", message: `Great choice. What day works best for you?`, options: [
        { label: "This week", next: "time" },
        { label: "Next week", next: "time" },
        { label: "Weekend", next: "time" },
      ] },
      { id: "time", speaker: "bot", message: `And what time of day suits you?`, options: [
        { label: "Morning", next: "collect" },
        { label: "Afternoon", next: "collect" },
        { label: "Evening", next: "collect" },
      ] },
      { id: "collect", speaker: "user", message: "[Customer shares name + phone/email]", next: "confirm" },
      { id: "confirm", speaker: "bot", message: `All set! ✅ We've noted your preferred slot and the ${brand.name} team will confirm your appointment shortly. You'll get a reminder before your visit.`, options: [{ label: "Perfect, thank you!", next: "end" }] },
      { id: "end", speaker: "bot", message: `See you soon at ${brand.name}! 💛` },
    ],
  };

  return {
    data: { flows: [greeting, faq, qualification, booking] },
    source: "deterministic",
  };
}

/** Re-export for callers that only need a single node graph type. */
export type { WhatsAppNode };
