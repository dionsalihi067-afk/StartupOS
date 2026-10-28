import "server-only";
import { logFailure } from "@/lib/api";
import { runResearch } from "@/lib/research/engine";
import type { ResearchRunResult } from "@/lib/research/model";
import type { ResearchSearchProvider } from "@/lib/research/provider";
import { getResearchProvider } from "@/lib/research/web-provider";
import type { BusinessInput } from "@/lib/types";

/**
 * The single research run behind one generation or regeneration request.
 * Input comes from the server-side business record, and the provider, queries
 * and limits come from server configuration. Research enriches generation and
 * never blocks it: provider failures are already reported by `runResearch` as
 * a failed result, and an unexpected error is logged and reported the same way.
 */
export async function researchForGeneration(
  input: BusinessInput,
  provider: ResearchSearchProvider | null = getResearchProvider(),
): Promise<ResearchRunResult> {
  const startedAt = new Date().toISOString();
  try {
    return await runResearch(input, provider);
  } catch (err) {
    logFailure("research", err);
    return {
      status: "failed",
      error: "invalidSnapshot",
      startedAt,
      completedAt: new Date().toISOString(),
      provider: provider?.name ?? null,
      queries: [],
    };
  }
}
