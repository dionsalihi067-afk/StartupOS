import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/client", () => ({
  isLlmConfigured: () => false,
  generateJson: vi.fn(async () => ({ data: null, source: "none", note: "llm-unavailable" })),
}));

import { createContext } from "@/lib/agents/context";
import { runBrandAgent } from "@/lib/agents/brand";
import { runEmailAgent } from "@/lib/agents/email";
import { ALL_INDUSTRY_PROFILES } from "@/lib/engine/industry";
import { isSafeCopy } from "@/lib/website/content";
import { makePackage } from "@/test/db";
import { sampleInput } from "@/test/research";

/** Credentials, guarantees, track record and operational promises the owner has not stated. */
const UNSTATED_FACT =
  /\b(?:licensed|insured|certified|guarantee\w*|proven|track record|expert\w*|verified|inspected|tested|award\w*|ethically|locally sourced|free (?:&|and)? ?(?:easy )?returns|fast shipping|live tracking|secure by design|every (?:single )?time|choosing us|exclusive offer|welcome gift|limited|don't wait)\b/i;

describe("template copy makes no unstated claims", () => {
  it.each(ALL_INDUSTRY_PROFILES.map((p) => [p.key, p] as const))("%s value propositions", (_key, profile) => {
    for (const prop of profile.valueProps) {
      expect(isSafeCopy(prop), prop).toBe(true);
      expect(prop, prop).not.toMatch(UNSTATED_FACT);
    }
  });

  it("the fallback brand slogan and description make no guarantees", async () => {
    for (const idea of ["Plumbing and home repairs", "Online clothing store", "Coffee shop", "Project management software for agencies"]) {
      for (let seed = 0; seed < 12; seed++) {
        const ctx = createContext(sampleInput({ business: { idea: `${idea} ${seed}`, offering: idea }, brand: { language: "en" } }));
        ctx.useLlm = false;
        const out = await runBrandAgent(ctx);
        expect(out.data.slogan, idea).not.toMatch(UNSTATED_FACT);
        expect(out.data.description, idea).not.toMatch(UNSTATED_FACT);
      }
    }
  });

  it("the fallback email sequence invents no offers, scarcity or social proof", async () => {
    const pkg = makePackage();
    for (const idea of ["Plumbing and home repairs", "Online clothing store", "Project management software for agencies"]) {
      const ctx = createContext(sampleInput({ business: { idea, offering: idea }, brand: { language: "en" } }));
      ctx.useLlm = false;
      const out = await runEmailAgent(ctx, pkg.brand);
      for (const message of out.data.sequence) {
        expect(message.bodyText, idea).not.toMatch(UNSTATED_FACT);
        expect(message.preview, idea).not.toMatch(UNSTATED_FACT);
      }
    }
  });
});
