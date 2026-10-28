import { describe, expect, it } from "vitest";
import { assessStrategyActionability, isActionableStrategy } from "@/lib/strategy/actionability";
import type { ExecutiveStrategy } from "@/lib/types";

function exec(overrides: Partial<ExecutiveStrategy> = {}): ExecutiveStrategy {
  return {
    summary: "Win first local clothing customers with clear seasonal drops and honest pricing.",
    problem: "",
    solution: "",
    valueProposition: "",
    businessModel: "",
    revenueStreams: [],
    segments: [],
    differentiation: [],
    entryStrategy: "Photograph 12 core SKUs and post three outfit ideas weekly.",
    assumptions: [],
    risks: [],
    missingInformation: [],
    priorities: [
      {
        window: "0-30",
        action: "Photograph everyday and seasonal hero pieces",
        priority: "high",
        outcome: "Usable product visuals",
        dependsOn: "",
        resources: "Owner time",
        metric: "12 product photos published",
        assumption: "",
      },
      {
        window: "0-30",
        action: "Invite 20 local shoppers to a soft opening feedback hour",
        priority: "high",
        outcome: "Early demand signal",
        dependsOn: "",
        resources: "Owner time",
        metric: "20 conversations logged",
        assumption: "",
      },
      {
        window: "31-60",
        action: "Promote best-selling categories on Instagram with clear CTAs",
        priority: "medium",
        outcome: "Store visits and enquiries",
        dependsOn: "Photos ready",
        resources: "Owner time",
        metric: "Enquiry count per week",
        assumption: "",
      },
    ],
    ...overrides,
  };
}

describe("assessStrategyActionability", () => {
  it("accepts a concise decision-oriented strategy", () => {
    expect(assessStrategyActionability(exec())).toEqual([]);
    expect(isActionableStrategy(exec())).toBe(true);
  });

  it("rejects empty priorities and generic awareness filler", () => {
    const weak = exec({
      summary: "We will increase brand awareness.",
      priorities: [],
      entryStrategy: "Leverage synergies to maximize potential.",
    });
    expect(assessStrategyActionability(weak)).toEqual(
      expect.arrayContaining(["noPriorities", "genericFiller"]),
    );
  });
});
