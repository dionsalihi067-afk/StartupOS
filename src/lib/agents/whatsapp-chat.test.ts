import { describe, expect, it } from "vitest";
import { replyToWhatsAppText } from "@/lib/agents/whatsapp-chat";
import { makePackage } from "@/test/db";
import type { Brand, WhatsAppFlow } from "@/lib/types";

const brand = { name: "Kafe Drita" } as Brand;

const flow: WhatsAppFlow = {
  name: "Chat",
  goal: "Help",
  nodes: [
    {
      id: "start",
      speaker: "bot",
      message: "Hi",
      options: [
        { label: "About our services", next: "services" },
        { label: "Pricing questions", next: "pricing" },
      ],
    },
    { id: "pricing", speaker: "bot", message: "Pricing depends on what you need — we do not invent tiers." },
    { id: "services", speaker: "bot", message: "We focus on specialty coffee." },
    { id: "human", speaker: "bot", message: "A person will follow up." },
  ],
};

describe("replyToWhatsAppText", () => {
  it("matches a visible option by wording", () => {
    const reply = replyToWhatsAppText({
      text: "I have pricing questions",
      flow,
      brand,
      current: flow.nodes[0],
    });
    expect(reply.nextNodeId).toBe("pricing");
  });

  it("answers price intent without inventing numbers", () => {
    const reply = replyToWhatsAppText({ text: "How much does it cost?", flow, brand, current: flow.nodes[0] });
    expect(reply.message.toLowerCase()).not.toMatch(/€\d|\$\d|all\s*\d/i);
    expect(reply.message).toMatch(/pricing|price|invent/i);
  });

  it("does not invent facts for unrelated free text", () => {
    const reply = replyToWhatsAppText({ text: "Are you open on Sundays at 6am?", flow, brand });
    expect(reply.message).not.toMatch(/\bopen\b.*\b6\b/i);
    expect(reply.message).toMatch(/will not invent|do not invent|buttons|pricing|services|offer/i);
  });

  it("uses package offer and skips platform competitors", () => {
    const pkg = makePackage({
      input: {
        idea: "Seasonal clothing collections for local shoppers",
        audience: "Local shoppers",
        location: "Fushë Kosovë, Kosovo",
        budget: "",
        style: "Modern / Minimal",
      },
      competitors: {
        available: true,
        status: "ok",
        provider: "tavily",
        queries: [],
        marketOverview: "",
        competitors: [
          {
            name: "Find Local Businesses",
            description: "findglocal directory listings",
            website: "https://www.findglocal.com/x",
            type: "direct",
            category: "directory",
            strengths: [],
            weaknesses: [],
            sources: [],
          },
          {
            name: "Moda Italia Store",
            description: "Local clothing boutique",
            website: "https://example.com/moda",
            type: "direct",
            category: "clothing",
            strengths: [],
            weaknesses: [],
            sources: [],
          },
        ],
        swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
        differentiation: [],
        opportunityGaps: [],
        sources: [],
      },
    });

    const about = replyToWhatsAppText({ text: "What does this business sell?", flow, brand, pkg });
    expect(about.message).toMatch(/Seasonal clothing collections/i);

    const rivals = replyToWhatsAppText({ text: "Who are the competitors?", flow, brand, pkg });
    expect(rivals.message).toMatch(/Moda Italia/i);
    expect(rivals.message).not.toMatch(/Find Local Businesses/i);
  });
});
