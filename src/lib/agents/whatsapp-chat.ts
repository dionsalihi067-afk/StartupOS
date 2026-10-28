import type { Brand, BusinessPackage, Competitor, WhatsAppFlow, WhatsAppNode } from "@/lib/types";
import { confirmedCompetitors } from "@/lib/research/competitors/revalidate";

/**
 * Deterministic free-text replies for the in-app WhatsApp conversation preview.
 * Uses flow nodes plus optional workspace package context. Never invents
 * prices, hours, locations, or availability. Not a live WhatsApp Business API.
 */

export type ChatReply = {
  /** Bot message shown to the user. */
  message: string;
  /** Optional flow node to advance into when an option was matched. */
  nextNodeId?: string;
};

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

function tokens(text: string): string[] {
  return fold(text).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2);
}

function overlap(a: string[], b: string[]): number {
  const set = new Set(b);
  return a.reduce((n, t) => n + (set.has(t) ? 1 : 0), 0);
}

const PRICE = /\b(?:price|pricing|cost|costs|how much|sa kushton|cmim|çmim)\b/i;
const HUMAN = /\b(?:human|person|agent|staff|call me|speak|njeri|operator)\b/i;
const ABOUT = /\b(?:about|what do you|what is|what does|services|products|offer|ofer|sherbim|shërbim|shet|sell)\b/i;
const COMPETITOR = /\b(?:competitor|competitors|konkurrent|rival|competition)\b/i;
const MARKETING = /\b(?:post|posts|marketing|instagram|facebook|reklam|ads?|campaign)\b/i;
const GROWTH = /\b(?:sales|shitjet|grow|growth|rris|customers|klient)\b/i;

function offeringOf(pkg?: BusinessPackage): string {
  if (!pkg) return "";
  const d = pkg.input.discovery;
  return (d?.offer.main?.trim() || d?.business.offering?.trim() || pkg.input.idea).trim();
}

function pricedTiers(pkg?: BusinessPackage): string[] {
  if (!pkg?.pricing?.tiers) return [];
  return pkg.pricing.tiers
    .map((t) => `${t.name}: ${t.price}`)
    .filter((line) => /\d/.test(line) && !/to be validated|unpriced|on request/i.test(line));
}

function acceptedCompetitors(pkg?: BusinessPackage): Competitor[] {
  if (!pkg?.competitors?.available) return [];
  return confirmedCompetitors(pkg.competitors.competitors);
}

/**
 * Replies to free-text using the current flow node options, brand, and optional
 * package context from the workspace.
 */
export function replyToWhatsAppText(args: {
  text: string;
  flow: WhatsAppFlow;
  brand: Brand;
  current?: WhatsAppNode | null;
  /** When provided, answers can use offer, pricing, competitors, and marketing facts. */
  pkg?: BusinessPackage;
}): ChatReply {
  const { text, flow, brand, current, pkg } = args;
  const trimmed = text.trim();
  if (!trimmed) {
    return { message: `Please type a short question, or choose one of the options below.` };
  }

  const options = current?.options ?? [];
  if (options.length > 0) {
    const q = tokens(trimmed);
    let best: { next: string; label: string; score: number } | null = null;
    for (const o of options) {
      const score = overlap(q, tokens(o.label));
      if (score > 0 && (!best || score > best.score)) best = { next: o.next, label: o.label, score };
    }
    if (best && best.score >= 1) {
      return { message: `Got it — "${best.label}".`, nextNodeId: best.next };
    }
  }

  if (PRICE.test(trimmed)) {
    const known = pricedTiers(pkg);
    if (known.length) {
      return {
        message: `Known price points from your plan: ${known.slice(0, 3).join("; ")}. Treat these as planning figures until you confirm them.`,
      };
    }
    const pricing = flow.nodes.find((n) => n.id === "pricing");
    if (pricing) return { message: pricing.message, nextNodeId: pricing.id };
    return {
      message: `We do not publish invented prices in chat. Share what you need from ${brand.name} and a person can explain pricing.`,
    };
  }

  if (COMPETITOR.test(trimmed)) {
    const list = acceptedCompetitors(pkg);
    if (list.length) {
      const names = list
        .slice(0, 3)
        .map((c) => c.name)
        .join(", ");
      return {
        message: `From saved research, relevant competitors include: ${names}. Directory or map listings are not treated as confirmed rivals.`,
      };
    }
    if (pkg?.competitors && !pkg.competitors.available) {
      return { message: `Competitor research is not available for this workspace yet, so I will not invent rival names.` };
    }
    return {
      message: `No reliably validated competitors are saved for ${brand.name} yet. Re-run research or add rivals manually — I will not invent them.`,
    };
  }

  if (MARKETING.test(trimmed)) {
    const posts = pkg?.marketing?.instagram ?? [];
    if (posts.length) {
      const sample = posts[0]!;
      return {
        message: `A ready social draft: “${sample.headline}” — ${sample.caption.slice(0, 160)}${sample.caption.length > 160 ? "…" : ""} CTA: ${sample.cta}. Open Marketing for the full set.`,
      };
    }
    return { message: `No social drafts are saved yet for ${brand.name}. Generate or open the Marketing section first.` };
  }

  if (GROWTH.test(trimmed)) {
    const first = pkg?.strategy?.executive?.priorities?.find((p) => p.priority === "high") ?? pkg?.strategy?.executive?.priorities?.[0];
    if (first?.action) {
      return {
        message: `A concrete next step from your strategy: ${first.action}${first.metric ? ` (measure: ${first.metric})` : ""}.`,
      };
    }
    return {
      message: `I do not have a prioritized growth action saved yet. Open Strategy for decisions grounded in this business — I will not invent guaranteed sales.`,
    };
  }

  if (HUMAN.test(trimmed)) {
    const human = flow.nodes.find((n) => n.id === "human");
    if (human) return { message: human.message, nextNodeId: human.id };
    return { message: `We can connect you with a person. Leave a short note about what you need.` };
  }

  if (ABOUT.test(trimmed)) {
    const offer = offeringOf(pkg);
    if (offer) {
      return {
        message: `${brand.name} focuses on ${offer}${pkg?.input.location ? ` for customers in ${pkg.input.location}` : ""}.`,
      };
    }
    const services = flow.nodes.find((n) => n.id === "services");
    if (services) return { message: services.message, nextNodeId: services.id };
  }

  const optionHint =
    options.length > 0
      ? ` You can also choose: ${options.map((o) => o.label).join(" · ")}.`
      : ` Ask about the offer, pricing, competitors, posts, or growth next steps.`;

  return {
    message: `${brand.name} can help with questions about the offer, pricing process, competitors, marketing drafts, or talking to a person. We will not invent hours, stock, or prices that were not provided.${optionHint}`,
  };
}
