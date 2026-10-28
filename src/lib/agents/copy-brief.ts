import type { GenerationContext } from "@/lib/agents/context";
import { buildBusinessProfile, type BusinessModelKind, type BusinessProfile } from "@/lib/engine/profile";
import type { BusinessInput } from "@/lib/types";

/**
 * Deterministic, owner-grounded facts for marketing/email/WhatsApp/website drafts.
 * Never invents prices, testimonials, results, or a market when none was given.
 */

/** Schema requires a non-empty location string; this token means the market is unknown. */
const UNKNOWN_LOCATION = /^(unspecified|unknown|n\/?a|tbd|none)$/i;

/**
 * Returns a usable market location, or "" when the value is blank or an explicit unknown placeholder.
 * Does not treat "Remote / EU" (and similar owner-supplied markets) as unknown.
 */
export function knownMarketLocation(location: string | null | undefined): string {
  const trimmed = (location ?? "").trim();
  if (!trimmed || UNKNOWN_LOCATION.test(trimmed)) return "";
  return trimmed;
}

export interface CopyBrief {
  idea: string;
  audience: string;
  /** Full location string as stored; empty when unknown. */
  location: string;
  /** First segment of location when present. */
  city: string;
  /** What the business sells — discovery offer/offering, else the idea. */
  offering: string;
  problem: string | null;
  need: string | null;
  differentiator: string | null;
  positioning: string | null;
  stage: string | null;
  /** Idea or preparing — no customers/results language. */
  earlyStage: boolean;
  hasPaidBudget: boolean;
  channels: ReadonlySet<string>;
  modelKind: BusinessModelKind;
  sellsOnline: boolean | null;
  styleLead: string;
}

/** Shared brief from input (+ optional precomputed profile). Used by website without a GenerationContext. */
export function copyBriefFromInput(input: BusinessInput, profile?: BusinessProfile): CopyBrief {
  const d = input.discovery;
  const location = knownMarketLocation(input.location);
  const city = location.split(",")[0]?.trim() ?? "";
  const offering = (d?.offer.main?.trim() || d?.business.offering?.trim() || input.idea).trim();
  const stage = d?.business.stage ?? null;
  const channels = new Set(d?.model.channels ?? []);
  const p = profile ?? buildBusinessProfile(input);
  const amount = p.budget?.amount;

  return {
    idea: input.idea.trim(),
    audience: input.audience.trim(),
    location,
    city,
    offering,
    problem: d?.customer.problem?.trim() || null,
    need: d?.customer.need?.trim() || null,
    differentiator: d?.offer.differentiator?.trim() || d?.market.difference?.trim() || null,
    positioning: d?.market.positioning?.trim() || null,
    stage,
    earlyStage: !stage || stage === "idea" || stage === "preparing",
    hasPaidBudget: amount != null && amount > 0,
    channels,
    modelKind: p.modelKind,
    sellsOnline: p.sellsOnline,
    styleLead: input.style.split(" / ")[0]!.toLowerCase(),
  };
}

export function copyBrief(ctx: GenerationContext): CopyBrief {
  return copyBriefFromInput(ctx.input, ctx.profile);
}

export function hasChannel(brief: CopyBrief, channel: string): boolean {
  if (brief.channels.size === 0) {
    // Legacy packages without discovery: website + social is the engine default.
    return channel === "website" || channel === "social";
  }
  return brief.channels.has(channel);
}

/** Short phrase for mid-sentence use; empty when the audience field is blank. */
export function audiencePhrase(brief: CopyBrief): string {
  return brief.audience.replace(/\.$/, "");
}
