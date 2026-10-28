import type { BusinessInput } from "@/lib/types";
import { effectiveGoal, websiteBriefOf } from "@/lib/website/brief";
import type { WebsiteSectionSpec, WebsiteSpec } from "@/lib/website/model";

/**
 * Automated website checks. Errors block publishing (enforced on the server);
 * warnings tell the owner what would make the site more useful to visitors.
 */

export type WebsiteCheckId =
  | "placeholderText"
  | "missingHomeHero"
  | "noContactChannel"
  | "goalUnavailable"
  | "missingAddress"
  | "missingHours"
  | "thinOffer"
  | "shortSeoTitle"
  | "shortSeoDescription"
  | "duplicateSeoTitle"
  | "duplicateSeoDescription";

export interface WebsiteCheck {
  id: WebsiteCheckId;
  severity: "error" | "warning";
  /** Page the issue was found on, when it is page-specific. */
  page?: string;
}

const PLACEHOLDER = /lorem ipsum|\{\{|\}\}|\[(?:your|insert|add|placeholder|business|name)\b[^\]]*\]|\b(?:TODO|TBD|FIXME|XXX)\b|\bexample\.(?:com|org|net)\b|\bplaceholder\b/i;

function sectionTexts(section: WebsiteSectionSpec): string[] {
  switch (section.type) {
    case "hero":
      return [section.heading, section.subheading ?? "", section.primaryCta?.label ?? "", section.secondaryCta?.label ?? ""];
    case "features":
    case "offer":
      return [section.heading, section.intro ?? "", ...section.items.flatMap((i) => [i.title, i.description ?? "", i.price ?? ""])];
    case "pricing":
      return [section.heading, section.intro ?? "", section.note ?? "", ...section.tiers.flatMap((t) => [t.name, t.description ?? "", ...t.features])];
    case "about":
      return [section.heading, section.body];
    case "faq":
      return [section.heading, ...section.items.flatMap((i) => [i.question, i.answer])];
    case "contact":
      return [section.heading, section.intro ?? "", ...section.details.flatMap((d) => [d.label, d.value]), ...(section.hours ?? []).flatMap((h) => [h.days, h.time])];
    case "cta":
      return [section.heading, section.subheading ?? "", section.cta.label];
  }
}

export function checkWebsite(spec: WebsiteSpec, input: BusinessInput): WebsiteCheck[] {
  const checks: WebsiteCheck[] = [];
  const brief = websiteBriefOf(input);
  const sections = spec.pages.flatMap((p) => p.sections);

  for (const page of spec.pages) {
    const texts = [page.label, page.seo.title, page.seo.description, ...page.sections.flatMap(sectionTexts)];
    if (texts.some((t) => PLACEHOLDER.test(t))) checks.push({ id: "placeholderText", severity: "error", page: page.slug });
  }
  if (PLACEHOLDER.test(spec.siteName) || PLACEHOLDER.test(spec.tagline ?? "")) checks.push({ id: "placeholderText", severity: "error" });

  const home = spec.pages.find((p) => p.slug === "/");
  if (!home?.sections.some((s) => s.type === "hero")) {
    checks.push({ id: "missingHomeHero", severity: "error", page: "/" });
  }

  if (sections.some((s) => s.type === "contact" && s.channelsPending)) checks.push({ id: "noContactChannel", severity: "warning" });
  if (effectiveGoal(brief) !== brief.goal) checks.push({ id: "goalUnavailable", severity: "warning" });

  const physical = brief.archetype === "restaurant" || brief.archetype === "hospitality" || brief.archetype === "shop";
  if (physical && input.discovery?.business.type !== "online" && !brief.address) checks.push({ id: "missingAddress", severity: "warning" });
  if ((brief.archetype === "restaurant" || brief.archetype === "shop") && brief.address && brief.hours.length === 0) {
    checks.push({ id: "missingHours", severity: "warning" });
  }

  const offer = sections.find((s): s is Extract<WebsiteSectionSpec, { type: "offer" }> => s.type === "offer");
  if (offer && offer.items.every((i) => !i.description)) checks.push({ id: "thinOffer", severity: "warning" });

  const titles = new Map<string, number>();
  const descriptions = new Map<string, number>();
  for (const page of spec.pages) {
    if (page.seo.title.length < 15) checks.push({ id: "shortSeoTitle", severity: "warning", page: page.slug });
    if (page.seo.description.length < 50) checks.push({ id: "shortSeoDescription", severity: "warning", page: page.slug });
    titles.set(page.seo.title, (titles.get(page.seo.title) ?? 0) + 1);
    descriptions.set(page.seo.description, (descriptions.get(page.seo.description) ?? 0) + 1);
  }
  if ([...titles.values()].some((n) => n > 1)) checks.push({ id: "duplicateSeoTitle", severity: "warning" });
  if ([...descriptions.values()].some((n) => n > 1)) checks.push({ id: "duplicateSeoDescription", severity: "warning" });

  return checks;
}

export const hasBlockingIssues = (checks: readonly WebsiteCheck[]) => checks.some((c) => c.severity === "error");
