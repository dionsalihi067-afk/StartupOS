import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/client", () => ({ generateJson: vi.fn(), isLlmConfigured: () => true }));

import { generateJson } from "@/lib/ai/client";
import { createContext } from "@/lib/agents/context";
import { runGrowthAgent } from "@/lib/agents/growth";
import { computeFinancials } from "@/lib/finance/model";
import { makePackage } from "@/test/db";

const pkg = makePackage();

function context() {
  const ctx = createContext(pkg.input);
  ctx.useLlm = true;
  const assumptions = {
    startupCosts: [{ item: "Stock", amount: 3000, essential: true }],
    monthlyFixedCosts: [{ item: "Tools", amount: 450 }],
    revenueStreams: [{ name: "Serum", unit: "order", price: 25, variableCost: 10, monthlyUnits: { conservative: 10, base: 30, optimistic: 60 } }],
    notes: [],
  };
  ctx.strategy = {
    source: "llm",
    profile: ctx.profile,
    executive: { summary: "", problem: "", solution: "", valueProposition: "", businessModel: "", revenueStreams: [], segments: [], differentiation: [], entryStrategy: "", assumptions: [], risks: [], missingInformation: [], priorities: [] },
    financials: { status: "estimated", basis: "ai-estimate", currency: "EUR", assumptions, results: computeFinancials(assumptions, 8000), limitations: ["aiEstimate"] },
  };
  return ctx;
}

describe("growth agent with a language model", () => {
  it("accepts common formatting and replaces invented numeric targets with a baseline", async () => {
    vi.mocked(generateJson).mockResolvedValue({
      source: "llm",
      data: {
        phases: [
          { window: "0-30 days", title: "Foundation", targets: [{ metric: "Sign-ups", value: "Achieve 100 user sign-ups" }, { metric: "Feedback", value: "Interview early users" }] },
          { window: "31–60", title: "Traction", targets: [{ metric: "Monthly sales", value: 30 }] },
          { window: "61-90", title: "Scale", targets: [{ metric: "Conversion", value: "4% of visitors" }] },
        ],
      },
    });
    const out = await runGrowthAgent(context(), pkg.brand);
    expect(out.source).toBe("llm");
    const [first, second, third] = out.data.phases;
    expect(first!.title).toBe("Foundation");
    expect(first!.targets).toEqual([
      { metric: "Sign-ups", value: "Measure baseline" },
      { metric: "Feedback", value: "Interview early users" },
    ]);
    expect(second!.targets).toEqual([{ metric: "Monthly sales", value: "30" }]);
    expect(third!.targets).toEqual([{ metric: "Conversion", value: "Measure baseline" }]);
  });

  it("accepts nulls, a plan keyed by window, 'Days 1-30' and a single milestone string", async () => {
    vi.mocked(generateJson).mockResolvedValue({
      source: "llm",
      data: {
        phases: {
          "Days 1-30": { title: "Foundation", objective: null, northStar: null, milestones: "Website live", targets: [{ metric: "Paying customers", value: null }] },
          "31 - 60": { title: "Traction", milestones: ["Referral program live", null] },
          "61-90": { title: null, milestones: [] },
        },
      },
    });
    const out = await runGrowthAgent(context(), pkg.brand);
    expect(out.source).toBe("llm");
    expect(out.note).toBeUndefined();
    const [first, second, third] = out.data.phases;
    expect(first!.title).toBe("Foundation");
    expect(first!.objective).not.toBe("");
    expect(first!.milestones).toEqual(["Website live"]);
    expect(first!.targets).toEqual([{ metric: "Paying customers", value: "Measure baseline" }]);
    expect(second!.title).toBe("Traction");
    expect(second!.milestones).toEqual(["Referral program live"]);
    expect(third!.title).toBe("Scale & Systemize");
  });

  it("does not read a window like '10-30' as the first month", async () => {
    vi.mocked(generateJson).mockResolvedValue({ source: "llm", data: { phases: [{ window: "10-30", title: "Wrong window" }] } });
    const out = await runGrowthAgent(context(), pkg.brand);
    expect(out.source).toBe("deterministic");
    expect(out.note).toBe("llm-invalid-output");
    expect(out.data.phases.map((p) => p.title)).not.toContain("Wrong window");
  });

  it("keeps a usable plan when single fields come back in another shape", async () => {
    vi.mocked(generateJson).mockResolvedValue({
      source: "llm",
      data: {
        growthPlan: {
          phases: [
            { window: "First 30 days", title: "Foundation", milestones: [{ milestone: "Website live" }], targets: ["Paying customers: Measure baseline"] },
            { window: "30-60", title: "Traction", northStar: { metric: "Repeat customers" }, targets: { "Monthly sales": "Grow from the baseline" } },
            { window: "Days 60 to 90", title: "Scale", targets: "Measure baseline" },
          ],
        },
      },
    });
    const out = await runGrowthAgent(context(), pkg.brand);
    expect(out.source).toBe("llm");
    expect(out.note).toBeUndefined();
    const [first, second, third] = out.data.phases;
    expect(first!.title).toBe("Foundation");
    expect(first!.milestones).toEqual(["Website live"]);
    expect(first!.targets).toEqual([{ metric: "Paying customers", value: "Measure baseline" }]);
    expect(second!.title).toBe("Traction");
    expect(second!.northStar).toBe("Repeat customers");
    expect(second!.targets).toEqual([{ metric: "Monthly sales", value: "Grow from the baseline" }]);
    expect(third!.title).toBe("Scale");
    expect(third!.targets.length).toBeGreaterThan(0);
  });

  it("drops an unreadable window but keeps the phases it can place", async () => {
    vi.mocked(generateJson).mockResolvedValue({
      source: "llm",
      data: { phases: [{ window: "0-30", title: "Foundation" }, { window: "10-30", title: "Wrong window" }, { window: "31-60", title: "Traction" }] },
    });
    const out = await runGrowthAgent(context(), pkg.brand);
    expect(out.source).toBe("llm");
    expect(out.data.phases.map((p) => p.title)).toEqual(["Foundation", "Traction", "Scale & Systemize"]);
  });

  it("still reports invalid output when the answer has no usable phase", async () => {
    vi.mocked(generateJson).mockResolvedValue({ source: "llm", data: { plan: "Grow fast" } });
    const out = await runGrowthAgent(context(), pkg.brand);
    expect(out.source).toBe("deterministic");
    expect(out.note).toBe("llm-invalid-output");
  });

  it("passes the provider's failure reason through instead of reporting invalid output", async () => {
    vi.mocked(generateJson).mockResolvedValue({ source: "none", data: null, note: "llm-unavailable:http-429:project_spend_limit_exceeded" });
    const out = await runGrowthAgent(context(), pkg.brand);
    expect(out.source).toBe("deterministic");
    expect(out.note).toBe("llm-unavailable:http-429:project_spend_limit_exceeded");
  });
});
