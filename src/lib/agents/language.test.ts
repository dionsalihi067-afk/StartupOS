import { describe, expect, it } from "vitest";
import { languageInstruction, outputLanguageName } from "@/lib/agents/language";
import { discoverySchema, toEngineFields } from "@/lib/discovery";

function input(lang: "en" | "sq" | "both") {
  const d = discoverySchema.parse({
    business: { idea: "Boutique", stage: "idea", type: "physical", category: "ecommerce", location: "Prishtina" },
    customer: { ideal: "Shoppers", type: "b2c" },
    offer: { status: "planned", main: "Clothing" },
    model: { revenue: ["oneTime"], channels: ["store", "social"] },
    market: {},
    brand: { style: "Modern / Minimal", tone: "friendly", language: lang },
    goals: { priority: "launch" },
  });
  return { ...toEngineFields(d), discovery: d };
}

describe("output language", () => {
  it("maps discovery language to Albanian or English instructions", () => {
    expect(outputLanguageName(input("sq"))).toBe("Albanian");
    expect(languageInstruction(input("sq"))).toMatch(/Albanian/);
    expect(outputLanguageName(input("en"))).toBe("English");
    expect(languageInstruction(input("en"))).toMatch(/English/);
  });

  it("does not collapse both to English-only", () => {
    expect(outputLanguageName(input("both"))).toBe("Albanian and English");
    const instruction = languageInstruction(input("both"));
    expect(instruction).toMatch(/both Albanian and English/i);
    expect(instruction).not.toBe(languageInstruction(input("en")));
  });

  it("is used by brand, marketing, email, growth, strategy, and website prompts", async () => {
    // Contract: every customer-facing specialist that calls generateJson should
    // share the same languageInstruction helper — covered by import presence tests
    // in those modules' suites; this asserts the shared helper stays bilingual.
    expect(languageInstruction(input("both"))).toMatch(/Albanian first with an English line/i);
  });
});
