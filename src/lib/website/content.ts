import { z } from "zod";
import { readPricing } from "@/lib/research/competitors/signals";
import { clip, parseWebsiteSpec, type WebsitePageSpec, type WebsiteSectionSpec, type WebsiteSpec } from "@/lib/website/model";

/**
 * Model-written website copy. The model only rewrites text inside the
 * structure the deterministic builder chose: it cannot add pages, sections,
 * links, prices, offers or benefits. Any text that makes unsupported claims or
 * carries prices, links or contact details is discarded.
 */

const str = z.string().trim();
const pair = z.object({ title: str.optional(), description: str.optional() });

export const websiteContentLlmSchema = z
  .object({
    hero: z.object({ heading: str.optional(), subheading: str.optional() }).optional(),
    features: z.array(pair).optional(),
    offer: z.array(z.object({ description: str.optional() })).optional(),
    about: str.optional(),
    faq: z.array(z.object({ question: str.optional(), answer: str.optional() })).optional(),
    cta: z.object({ heading: str.optional() }).optional(),
    pages: z.array(z.object({ slug: str.optional(), seoTitle: str.optional(), seoDescription: str.optional() })).optional(),
  })
  .passthrough();
export type WebsiteContentLlm = z.infer<typeof websiteContentLlmSchema>;

const UNSUPPORTED_CLAIM =
  /\b\d+\s*\+?\s*(?:years?|vjet\w*|customers?|clients?|klient\w*|users?|përdorues\w*|reviews?|stars?|yje|employees?|locations?)\b|\d\s*%|★|\b(?:awards?|award-winning|certified|certification|accredited|accreditation|licensed|insured|iso\s?\d|guaranteed?|guarantees|warranty|number one|top-rated|best in|trusted by|rated|testimonials?|reviews?|case\s+stud(?:y|ies)|5-star|five-star|official\s+partner|as\s+seen\s+in)\b|#\s?1\b|çmim\w* të fituar|certifikuar|garanci\w*|garantojmë|më i miri|më e mira|nr\.?\s*1\b|numri një|\bsince\s+(?:19|20)\d{2}\b/i;
const CONTACT_OR_MARKUP =
  /https?:|www\.|@|<\s*[a-z/!]|javascript:|\+?\d[\d\s().-]{6,}\d|(?:rruga|street|avenue|blvd)\b|\b(?:open(?:ing)?\s+hours?|hours?\s*:|mon(?:day)?\s*[-–—]\s*fri|e\s*[-–—]\s*hën)\b|\b\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\b/i;

/** True when text makes no unsupported business claims and contains no prices, links, contact details or markup. */
export function isSafeCopy(text: string): boolean {
  return !UNSUPPORTED_CLAIM.test(text) && !CONTACT_OR_MARKUP.test(text) && readPricing(text).status === "unavailable";
}

const accept = (value: string | undefined, max: number): string | undefined =>
  value && value.trim() && isSafeCopy(value) ? clip(value, max) : undefined;

function mergeSection(section: WebsiteSectionSpec, content: WebsiteContentLlm, homeCta: boolean): WebsiteSectionSpec {
  switch (section.type) {
    case "hero": {
      const subheading = accept(content.hero?.subheading, 320) ?? section.subheading;
      return { ...section, heading: accept(content.hero?.heading, 140) ?? section.heading, ...(subheading ? { subheading } : {}) };
    }
    case "features":
      return {
        ...section,
        items: section.items.map((item, i) => {
          const llm = content.features?.[i];
          const description = accept(llm?.description, 400) ?? item.description;
          return { title: accept(llm?.title, 120) ?? item.title, ...(description ? { description } : {}) };
        }),
      };
    case "offer":
      return {
        ...section,
        items: section.items.map((item, i) => {
          const description = item.description ?? accept(content.offer?.[i]?.description, 400);
          return { ...item, ...(description ? { description } : {}) };
        }),
      };
    case "about":
      return { ...section, body: accept(content.about, 1200) ?? section.body };
    case "faq":
      return {
        ...section,
        items: section.items.map((item, i) => {
          const llm = content.faq?.[i];
          const question = accept(llm?.question, 200);
          const answer = accept(llm?.answer, 600);
          return question && answer ? { question, answer } : item;
        }),
      };
    case "cta":
      return homeCta ? { ...section, heading: accept(content.cta?.heading, 140) ?? section.heading } : section;
    default:
      return section;
  }
}

function mergePage(page: WebsitePageSpec, content: WebsiteContentLlm): WebsitePageSpec {
  const seo = content.pages?.find((p) => p.slug === page.slug);
  return {
    ...page,
    seo: {
      ...page.seo,
      title: accept(seo?.seoTitle, 70) ?? page.seo.title,
      description: accept(seo?.seoDescription, 170) ?? page.seo.description,
    },
    sections: page.sections.map((s) => mergeSection(s, content, page.slug === "/")),
  };
}

/** Applies model copy onto the deterministic spec; returns the deterministic spec if the result is not a valid spec. */
export function mergeWebsiteContent(base: WebsiteSpec, content: WebsiteContentLlm): WebsiteSpec {
  return parseWebsiteSpec({ ...base, pages: base.pages.map((p) => mergePage(p, content)) }) ?? base;
}

type SectionOf<T extends WebsiteSectionSpec["type"]> = Extract<WebsiteSectionSpec, { type: T }>;

function sectionOf<T extends WebsiteSectionSpec["type"]>(spec: WebsiteSpec, type: T, homeOnly = false): SectionOf<T> | undefined {
  const pages = [...spec.pages].sort((a, b) => Number(b.slug === "/") - Number(a.slug === "/"));
  for (const page of homeOnly ? pages.slice(0, 1).filter((p) => p.slug === "/") : pages) {
    const found = page.sections.find((s): s is SectionOf<T> => s.type === type);
    if (found) return found;
  }
  return undefined;
}

/** `current` when it was rewritten from `before` and the deterministic source text is unchanged in `after`. */
const carried = (current: string | undefined, before: string | undefined, after: string | undefined): string | undefined =>
  current !== undefined && current !== before && before === after ? current : undefined;

/**
 * Recovers model-written copy from `current` (built on the deterministic `previousBase`) so it can be
 * re-applied onto the rebuilt `nextBase` with {@link mergeWebsiteContent}. Text is only carried where
 * the deterministic source it rewrote is identical in `nextBase`, so a rewrite never lands on a
 * different benefit, offer item, question or page.
 */
export function rewrittenCopy(current: WebsiteSpec, previousBase: WebsiteSpec, nextBase: WebsiteSpec): WebsiteContentLlm {
  const content: WebsiteContentLlm = {};

  const [hc, hb, ha] = [sectionOf(current, "hero", true), sectionOf(previousBase, "hero", true), sectionOf(nextBase, "hero", true)];
  const heading = carried(hc?.heading, hb?.heading, ha?.heading);
  const subheading = carried(hc?.subheading, hb?.subheading, ha?.subheading);
  if (heading || subheading) content.hero = { heading, subheading };

  const [fc, fb, fa] = [sectionOf(current, "features"), sectionOf(previousBase, "features"), sectionOf(nextBase, "features")];
  if (fc && fb && fa) {
    const items = fa.items.map((item, i) => {
      const [c, b] = [fc.items[i], fb.items[i]];
      if (!c || !b || b.title !== item.title || b.description !== item.description) return {};
      return { title: carried(c.title, b.title, item.title), description: carried(c.description, b.description, item.description) };
    });
    if (items.some((i) => i.title || i.description)) content.features = items;
  }

  const [oc, ob, oa] = [sectionOf(current, "offer"), sectionOf(previousBase, "offer"), sectionOf(nextBase, "offer")];
  if (oc && ob && oa) {
    const items = oa.items.map((item) => {
      const c = oc.items.find((i) => i.title === item.title);
      const b = ob.items.find((i) => i.title === item.title);
      return { description: b ? carried(c?.description, b.description, item.description) : undefined };
    });
    if (items.some((i) => i.description)) content.offer = items;
  }

  const about = carried(sectionOf(current, "about")?.body, sectionOf(previousBase, "about")?.body, sectionOf(nextBase, "about")?.body);
  if (about) content.about = about;

  const [qc, qb, qa] = [sectionOf(current, "faq"), sectionOf(previousBase, "faq"), sectionOf(nextBase, "faq")];
  if (qc && qb && qa) {
    const items = qa.items.map((item, i) => {
      const [c, b] = [qc.items[i], qb.items[i]];
      const same = b && b.question === item.question && b.answer === item.answer;
      return same && c && (c.question !== b.question || c.answer !== b.answer) ? { question: c.question, answer: c.answer } : {};
    });
    if (items.some((i) => i.question)) content.faq = items;
  }

  const cta = carried(sectionOf(current, "cta", true)?.heading, sectionOf(previousBase, "cta", true)?.heading, sectionOf(nextBase, "cta", true)?.heading);
  if (cta) content.cta = { heading: cta };

  const pages = nextBase.pages.flatMap((page) => {
    const c = current.pages.find((p) => p.slug === page.slug);
    const b = previousBase.pages.find((p) => p.slug === page.slug);
    if (!c || !b) return [];
    const seoTitle = carried(c.seo.title, b.seo.title, page.seo.title);
    const seoDescription = carried(c.seo.description, b.seo.description, page.seo.description);
    return seoTitle || seoDescription ? [{ slug: page.slug, seoTitle, seoDescription }] : [];
  });
  if (pages.length) content.pages = pages;

  return content;
}

/** Compact description of the chosen structure for the prompt. */
export function describeStructure(spec: WebsiteSpec): string {
  const lines = spec.pages.map((p) => `- ${p.slug} (${p.label}): ${p.sections.map((s) => s.type).join(", ")}`);
  const sections = spec.pages.flatMap((p) => p.sections);
  const features = sections.find((s) => s.type === "features");
  const offer = sections.find((s) => s.type === "offer");
  const faq = sections.find((s) => s.type === "faq");
  if (features?.type === "features") lines.push(`Benefits (rewrite only these, same order): ${features.items.map((i) => `${i.title}: ${i.description ?? ""}`).join(" | ")}`);
  if (offer?.type === "offer") lines.push(`Offer items (describe only these, same order): ${offer.items.map((i) => i.title).join(" | ")}`);
  if (faq?.type === "faq") lines.push(`FAQ (rewrite only these, same order): ${faq.items.map((i) => i.question).join(" | ")}`);
  return lines.join("\n");
}
