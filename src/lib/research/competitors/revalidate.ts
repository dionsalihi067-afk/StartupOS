import type { BusinessInput, Competitor, CompetitorAnalysis } from "@/lib/types";
import { isPlatformHost, rejectSearchArtifact } from "@/lib/research/competitors/validate";
import { offerTerms as offerTermsFromContext } from "@/lib/research/competitors/signals";
import type { ResearchContext } from "@/lib/research/model";

/**
 * Read-time classification for persisted competitor rows. Does not rewrite
 * stored packages; flags directory/map platforms that older runs may have kept
 * and filters them out of "confirmed" consumer lists.
 */

const PLATFORM =
  /\b(?:findglocal|mapquest|yellow\s*pages|find\s+local\s+businesses|directory|listings?\s+include|printable\s+directions|yelp|tripadvisor|google\s+maps|openstreetmap|bing\s+places)\b/i;

export type CompetitorDisplayStatus = "accepted" | "needsRevalidation" | "platformListing";

/** Offer tokens for live-search gates when a full ResearchContext is unavailable. */
export function offerTermsFromIdea(input: BusinessInput): string[] {
  const d = input.discovery;
  const ctx: ResearchContext = {
    idea: input.idea,
    revenueModels: d ? [...d.model.revenue] : [],
    ...(d?.offer.main?.trim() ? { offer: d.offer.main.trim() } : {}),
    ...(input.location.trim() ? { location: input.location.trim() } : {}),
    ...(input.audience.trim() ? { customer: input.audience.trim() } : {}),
  };
  return offerTermsFromContext(ctx);
}

export function classifyPersistedCompetitor(c: Competitor): CompetitorDisplayStatus {
  const blob = `${c.name} ${c.description} ${c.website ?? ""}`;
  if (PLATFORM.test(blob) || PLATFORM.test(c.website ?? "") || isPlatformHost(c.website ?? "")) {
    return "platformListing";
  }
  const gate = rejectSearchArtifact({
    title: c.name,
    url: c.website || "https://invalid.example",
    snippet: c.description,
  });
  if (!gate.ok && (gate.reason === "platform" || gate.reason === "article")) {
    return "platformListing";
  }
  if (!gate.ok) return "needsRevalidation";
  return "accepted";
}

export function competitorsNeedingRevalidation(competitors: Competitor[]): Competitor[] {
  return competitors.filter((c) => classifyPersistedCompetitor(c) !== "accepted");
}

/**
 * Confirmed rivals for downstream analysis and customer-facing lists.
 * Never rewrites the stored package — filters at read/consume time.
 */
export function confirmedCompetitors(competitors: Competitor[]): Competitor[] {
  return competitors.filter((c) => classifyPersistedCompetitor(c) === "accepted");
}

/** Safe view of competitor analysis for UI / WhatsApp / strategy consumers. */
export function confirmedCompetitorAnalysis(analysis: CompetitorAnalysis): CompetitorAnalysis {
  if (!analysis.available) return analysis;
  const confirmed = confirmedCompetitors(analysis.competitors);
  return {
    ...analysis,
    competitors: confirmed,
    // Keep available=true even when all rows are filtered so empty state is honest, not "research missing".
    available: analysis.available,
  };
}
