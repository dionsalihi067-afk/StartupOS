import type { ExecutiveStrategy } from "@/lib/types";

/**
 * Deterministic checks that a strategy contains decisions and next steps,
 * not only descriptive filler. Does not prove commercial effectiveness.
 */

const GENERIC =
  /\b(?:increase brand awareness|boost visibility|leverage synergies|maximize potential|take it to the next level|world[- ]class|best[- ]in[- ]class)\b/i;

export type StrategyActionabilityIssue =
  | "missingObjective"
  | "noPriorities"
  | "genericFiller"
  | "noMeasurableStep";

export function assessStrategyActionability(executive: ExecutiveStrategy): StrategyActionabilityIssue[] {
  const issues: StrategyActionabilityIssue[] = [];
  const summary = executive.summary?.trim() ?? "";
  if (summary.length < 40) issues.push("missingObjective");

  if (!executive.priorities?.length) {
    issues.push("noPriorities");
  } else {
    const actionable = executive.priorities.filter((p) => p.action.trim().length >= 8);
    if (actionable.length < 3) issues.push("noPriorities");
    const measurable = executive.priorities.some((p) => (p.metric ?? "").trim().length >= 4);
    if (!measurable) issues.push("noMeasurableStep");
  }

  const blob = [
    summary,
    executive.entryStrategy,
    executive.valueProposition,
    ...(executive.priorities ?? []).map((p) => `${p.action} ${p.outcome}`),
  ].join(" ");
  if (GENERIC.test(blob) && (executive.priorities?.length ?? 0) < 4) {
    issues.push("genericFiller");
  }

  return issues;
}

export function isActionableStrategy(executive: ExecutiveStrategy): boolean {
  return assessStrategyActionability(executive).length === 0;
}
