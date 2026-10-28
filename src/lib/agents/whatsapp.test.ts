import { describe, expect, it } from "vitest";
import { createContext } from "@/lib/agents/context";
import { runWhatsAppAgent } from "@/lib/agents/whatsapp";
import { makePackage } from "@/test/db";
import { sampleInput } from "@/test/research";

describe("WhatsApp agent language", () => {
  it("writes Albanian flow copy when discovery language is sq", () => {
    const ctx = createContext(sampleInput({ brand: { language: "sq" } }));
    const out = runWhatsAppAgent(ctx, makePackage().brand);
    expect(out.source).toBe("deterministic");
    expect(out.data.nodes[0]!.message).toMatch(/Përshëndetje/);
    expect(out.data.nodes[0]!.message).not.toMatch(/^Hi —/);
  });

  it("writes English flow copy when discovery language is en", () => {
    const ctx = createContext(sampleInput({ brand: { language: "en" } }));
    const out = runWhatsAppAgent(ctx, makePackage().brand);
    expect(out.data.nodes[0]!.message).toMatch(/^Hi —/);
  });

  it("uses Albanian-first chrome for language=both", () => {
    const ctx = createContext(sampleInput({ brand: { language: "both" } }));
    const out = runWhatsAppAgent(ctx, makePackage().brand);
    expect(out.data.nodes[0]!.message).toMatch(/Përshëndetje/);
  });
});
