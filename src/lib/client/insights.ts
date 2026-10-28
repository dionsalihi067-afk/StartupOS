import type { BusinessInput, BusinessPackage, ResearchStatus } from "@/lib/types";
import type { BusinessSummary } from "@/lib/businesses/types";
import { detectIndustry, detectInputIndustry } from "@/lib/engine/industry";
import { GENERATED_SECTIONS, type GeneratedSectionId } from "@/lib/dependencies";
import { SECTION_AGENT_LABELS } from "@/lib/regenerate-core";
import { FLEXIBLE_BUDGET } from "@/lib/discovery";
import type { BadgeTone } from "@/components/ui/primitives";
import type { Translator } from "@/i18n/translator";

/**
 * Pure, read-only derivations over a stored BusinessPackage. Everything here
 * is computed from fields that already exist in the package — no values are
 * invented. Interface labels come from the translator; generated content
 * (names, checklist items, copy) is passed through unchanged.
 */

export type SectionKey = "overview" | "strategy" | "brand" | "website" | "marketing" | "competitors" | "pricing" | "growth" | "launch";

export function sectionHref(key: SectionKey, projectId?: string): string {
  if (key === "overview") return projectId ? `/dashboard/projects/${projectId}` : "/dashboard";
  return `/dashboard/${key}`;
}

/**
 * Same deterministic classifier the generator used, labelled in the interface language.
 * Pass the full input when available; summaries only carry the idea text.
 */
export function businessCategory(source: BusinessInput | string, t: Translator): string {
  const industry = typeof source === "string" ? detectIndustry(source) : detectInputIndustry(source);
  return t.optional(`industries.${industry.key}`) ?? industry.label;
}

/** Fallback notes that retrying cannot change: missing configuration or a genuinely empty search. */
const NOT_RETRYABLE = new Set([
  "search-not-configured",
  "image-gen-not-configured",
  "research",
  "no-results",
  "research-no-results",
  "research-no-competitors",
]);

/**
 * Generated sections whose last run fell back to a template or failed for a
 * reason a retry may fix, in generation order.
 */
export function incompleteSections(pkg: BusinessPackage): GeneratedSectionId[] {
  const retryable = (note: string | undefined) => !note || (!NOT_RETRYABLE.has(note) && !note.startsWith("partial:"));
  const bad = new Set(pkg.meta.agentLog.filter((l) => l.status !== "ok" && retryable(l.note)).map((l) => l.agent));
  return GENERATED_SECTIONS.filter((s) => bad.has(SECTION_AGENT_LABELS[s]));
}

/**
 * The AI provider refused requests in the last run for a reason waiting will not fix
 * (invalid key, no access, spending limit or exhausted quota), as opposed to a rate
 * limit, timeout or invalid answer.
 */
export function aiProviderRefused(pkg: BusinessPackage): boolean {
  return pkg.meta.agentLog.some((l) => isProviderRefusal(l.note));
}

/**
 * How a scoped regeneration went from the owner's point of view. A section the
 * server saved with template content (status "fallback") is not reported as updated,
 * and the run is only complete when every section was actually written again.
 */
export function regenerationSummary(result: {
  outcomes: readonly { section: GeneratedSectionId; status: string; message?: string }[];
  succeeded: readonly GeneratedSectionId[];
  failed: readonly GeneratedSectionId[];
}): { updated: GeneratedSectionId[]; templateOnly: GeneratedSectionId[]; failed: GeneratedSectionId[]; providerRefused: boolean; complete: boolean } {
  const templated = result.outcomes.filter((o) => o.status === "fallback");
  const templateOnly = templated.map((o) => o.section);
  const updated = result.succeeded.filter((s) => !templateOnly.includes(s));
  return {
    updated,
    templateOnly,
    failed: [...result.failed],
    providerRefused: result.outcomes.some((o) => o.status !== "ok" && isProviderRefusal(o.message)),
    complete: result.failed.length === 0 && templateOnly.length === 0,
  };
}

/** Whether a step note records a provider refusal (see {@link aiProviderRefused}). */
export function isProviderRefusal(note: string | undefined): boolean {
  return (note ?? "")
    .split(/,\s*/)
    .some((n) => /^llm-unavailable:http-(?:401|403|429:(?!.*rate_limit))/.test(n) || /^image-rejected-(?:401|403|429)$/.test(n));
}

/** A business's display name; records still generating have no brand name yet. */
export function businessName(business: { name: string | null }, t: Translator): string {
  return business.name || t("businessStatus.untitled");
}

type ProgressSource = BusinessPackage | { launchDone: number; launchTotal: number };

/** "ai" when the named agent's output came from the language model, otherwise "template". */
export function agentProvenance(pkg: BusinessPackage, agentLabel: string): "ai" | "template" {
  return pkg.meta.agentLog.find((l) => l.agent === agentLabel)?.source === "llm" ? "ai" : "template";
}

export function launchProgress(source: ProgressSource) {
  const total = "launch" in source ? source.launch.checklist.length : source.launchTotal;
  const done = "launch" in source ? source.launch.checklist.filter((c) => c.done).length : source.launchDone;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

export function researchState(status: ResearchStatus, t: Translator): { label: string; tone: BadgeTone } {
  switch (status) {
    case "ok":
      return { label: t("status.available"), tone: "success" };
    case "search-not-configured":
      return { label: t("status.notConfigured"), tone: "neutral" };
    case "no-results":
      return { label: t("status.noResults"), tone: "warning" };
    default:
      return { label: t("status.failed"), tone: "warning" };
  }
}

export function logoState(pkg: BusinessPackage, t: Translator): { label: string; tone: BadgeTone } {
  if (pkg.brand.logo.status === "generated") return { label: t("status.generated"), tone: "success" };
  if (pkg.brand.logo.status === "unavailable") return { label: t("status.notConfigured"), tone: "neutral" };
  return { label: t("status.failed"), tone: "warning" };
}

export interface NextAction {
  title: string;
  reason: string;
  href: string;
  section?: SectionKey;
}

/** Maps a generated (English) checklist item to the section it concerns. */
function sectionForChecklistItem(item: string): SectionKey {
  const s = item.toLowerCase();
  if (s.includes("brand")) return "brand";
  if (s.includes("website")) return "website";
  if (/(email|content|ad campaign|social|whatsapp)/.test(s)) return "marketing";
  if (/(offer|pricing|payment)/.test(s)) return "pricing";
  return "launch";
}

export function nextActions(pkg: BusinessPackage, t: Translator, limit = 4): NextAction[] {
  const out: NextAction[] = [];

  if (pkg.brand.logo.status === "unavailable") {
    out.push({
      title: t("nextActions.setupLogo.title"),
      reason: t("nextActions.setupLogo.reason"),
      href: "/dashboard/settings#integrations",
    });
  } else if (pkg.brand.logo.status === "error") {
    out.push({
      title: t("nextActions.logoFailed.title"),
      reason: t("nextActions.logoFailed.reason"),
      href: "/dashboard/generate",
    });
  }

  if (pkg.competitors.status === "search-not-configured") {
    out.push({
      title: t("nextActions.connectSearch.title"),
      reason: t("nextActions.connectSearch.reason"),
      href: "/dashboard/settings#integrations",
    });
  } else if (pkg.competitors.status !== "ok") {
    out.push({
      title: t("nextActions.reviewResearch.title"),
      reason: t("nextActions.reviewResearch.reason"),
      href: sectionHref("competitors"),
      section: "competitors",
    });
  }

  for (const item of pkg.launch.checklist) {
    if (out.length >= limit) break;
    if (item.done) continue;
    const section = sectionForChecklistItem(item.item);
    out.push({ title: item.item, reason: t("nextActions.checklistReason"), href: sectionHref(section), section });
  }

  return out.slice(0, limit);
}

export function businessStatus(source: ProgressSource, t: Translator): { label: string; tone: BadgeTone } {
  const lp = launchProgress(source);
  if (lp.total > 0 && lp.done === lp.total) return { label: t("status.launchReady"), tone: "success" };
  if (lp.done > 0) return { label: t("status.inProgress"), tone: "accent" };
  return { label: t("status.planning"), tone: "neutral" };
}

/** Status badge for a saved business, including records still generating or that failed. */
export function summaryStatus(summary: BusinessSummary, t: Translator): { label: string; tone: BadgeTone } {
  if (summary.status === "generating") return { label: t("businessStatus.generating"), tone: "warning" };
  if (summary.status === "failed") return { label: t("businessStatus.failed"), tone: "danger" };
  return businessStatus(summary, t);
}

/**
 * Positioning shown on Overview: owner discovery text when present, otherwise
 * the marketing strategy line labelled as AI. Never invents copy when both are empty.
 */
export function overviewPositioning(pkg: BusinessPackage): { text: string; source: "owner" | "ai" } | null {
  const owner = pkg.input.discovery?.market.positioning?.trim();
  if (owner) return { text: owner, source: "owner" };
  const ai = pkg.marketing.strategy.positioning?.trim();
  if (ai) return { text: ai, source: "ai" };
  return null;
}

/** Joins optional market fragments; empty parts stay empty instead of fabricating a place. */
export function overviewJoined(parts: Array<string | undefined | null>, empty = "—"): string {
  const joined = parts.map((p) => p?.trim()).filter(Boolean).join(" · ");
  return joined || empty;
}

/** Budget display from the saved package input; flexible/unknown stays labelled, never invented. */
export function overviewBudgetLabel(budget: string | undefined, t: Translator): string {
  if (!budget?.trim() || budget === FLEXIBLE_BUDGET) return t("discovery.review.notDecided");
  return budget;
}
