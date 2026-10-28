import { z } from "zod";
import type { Website } from "@/lib/types";
import { slugify } from "@/lib/utils";
import {
  checkSiteIntegrity,
  parseWebsiteSpec,
  SLUG_PATTERN,
  WEBSITE_LANGUAGES,
  websitePageSchema,
  websiteSiteFields,
  websiteThemeSchema,
} from "@/lib/website/model";

/**
 * Publishable website: the validated specification assembled with the
 * metadata every page needs to be served. Built deterministically from the
 * stored specification. Public visitors receive a persisted snapshot of this
 * object; the owner's draft may change without affecting the live site until
 * they republish.
 */

const seo = websitePageSchema.shape.seo.shape;

const pageMetadataSchema = z.object({
  title: seo.title,
  description: seo.description,
  canonicalPath: seo.canonicalPath,
  locale: z.enum(WEBSITE_LANGUAGES),
  siteName: websiteSiteFields.siteName,
  icon: websiteThemeSchema.shape.logoUrl,
  openGraph: z.object({
    type: z.literal("website"),
    title: seo.title,
    description: seo.description,
    siteName: websiteSiteFields.siteName,
  }),
});
export type PublishedPageMetadata = z.infer<typeof pageMetadataSchema>;

const publishablePageSchema = websitePageSchema.extend({ metadata: pageMetadataSchema });
export type PublishablePage = z.infer<typeof publishablePageSchema>;

export const publishableWebsiteSchema = z
  .object({ ...websiteSiteFields, pages: z.array(publishablePageSchema).min(1).max(6) })
  .superRefine((site, ctx) => {
    checkSiteIntegrity(site, ctx);
    for (const page of site.pages) {
      const m = page.metadata;
      const consistent =
        m.title === page.seo.title &&
        m.description === page.seo.description &&
        m.canonicalPath === page.slug &&
        m.locale === site.language &&
        m.siteName === site.siteName &&
        m.icon === site.theme.logoUrl &&
        m.openGraph.title === m.title &&
        m.openGraph.description === m.description &&
        m.openGraph.siteName === site.siteName;
      if (!consistent) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `page ${page.slug} metadata does not match its content` });
    }
  });
export type PublishableWebsite = z.infer<typeof publishableWebsiteSchema>;

export type PublishBuild = { ok: true; site: PublishableWebsite } | { ok: false; reason: "invalidWebsite" };

/** Assembles the publishable website from a stored specification. Deterministic; no model calls, no searches. */
export function buildPublishableWebsite(spec: unknown): PublishBuild {
  const valid = parseWebsiteSpec(spec);
  if (!valid) return { ok: false, reason: "invalidWebsite" };
  const { pages, ...site } = valid;
  const parsed = publishableWebsiteSchema.safeParse({
    ...site,
    pages: pages.map((page) => ({
      ...page,
      metadata: {
        title: page.seo.title,
        description: page.seo.description,
        canonicalPath: page.slug,
        locale: valid.language,
        siteName: valid.siteName,
        ...(valid.theme.logoUrl ? { icon: valid.theme.logoUrl } : {}),
        openGraph: { type: "website", title: page.seo.title, description: page.seo.description, siteName: valid.siteName },
      },
    })),
  });
  return parsed.success ? { ok: true, site: parsed.data } : { ok: false, reason: "invalidWebsite" };
}

export type PageResolution = { ok: true; page: PublishablePage } | { ok: false; reason: "notFound" };

/** Resolves a requested path ("/", "/about", "about/") to one of the site's pages. */
export function resolvePublishedPage(site: PublishableWebsite, path: unknown): PageResolution {
  if (typeof path !== "string" || path.length > 200) return { ok: false, reason: "notFound" };
  const trimmed = path.trim();
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const slug = withSlash.length > 1 && withSlash.endsWith("/") ? withSlash.slice(0, -1) : withSlash;
  if (!SLUG_PATTERN.test(slug)) return { ok: false, reason: "notFound" };
  const page = site.pages.find((p) => p.slug === slug);
  return page ? { ok: true, page } : { ok: false, reason: "notFound" };
}

/* ------------------------------ Public slugs ------------------------------ */

/** Lowercase hyphenated public site identifiers (`kafeja`, `drita-coffee`). */
export const PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const publicSlugSchema = z.string().regex(PUBLIC_SLUG_PATTERN).min(2).max(64);

const RESERVED_PUBLIC_SLUGS = new Set([
  "api",
  "s",
  "en",
  "sq",
  "dashboard",
  "login",
  "register",
  "settings",
  "admin",
  "www",
  "app",
  "static",
  "assets",
  "favicon",
  "robots",
  "sitemap",
  "health",
  "status",
  "auth",
  "null",
  "undefined",
]);

export function isReservedPublicSlug(slug: string): boolean {
  return RESERVED_PUBLIC_SLUGS.has(slug);
}

/** Deterministic base slug from the site name; never empty, never a reserved word alone. */
export function publicSlugBase(siteName: string): string {
  const base = slugify(siteName).slice(0, 48);
  if (base.length >= 2 && !isReservedPublicSlug(base)) return base;
  return base.length >= 1 && !isReservedPublicSlug(`site-${base}`) ? `site-${base}` : "site";
}

/** Candidate slugs: base, then base-2, base-3, … */
export function publicSlugCandidates(siteName: string, preferred?: string | null): string[] {
  const out: string[] = [];
  const push = (raw: string) => {
    const parsed = publicSlugSchema.safeParse(raw);
    if (parsed.success && !isReservedPublicSlug(parsed.data) && !out.includes(parsed.data)) out.push(parsed.data);
  };
  if (preferred) push(preferred);
  const base = publicSlugBase(siteName);
  push(base);
  for (let n = 2; n <= 50; n++) push(`${base}-${n}`.slice(0, 64));
  return out;
}

/** Path of a published site on this application (`/s/<slug>` or `/s/<slug>/about`). */
export function publicSitePath(publicSlug: string, pageSlug = "/"): string {
  const slug = publicSlugSchema.parse(publicSlug);
  if (pageSlug === "/") return `/s/${slug}`;
  const page = pageSlug.startsWith("/") ? pageSlug.slice(1) : pageSlug;
  return `/s/${slug}/${page}`;
}

/** Absolute public URL when an origin is configured; otherwise the path only. */
export function publicSiteUrl(publicSlug: string, pageSlug = "/", origin?: string | null): string {
  const path = publicSitePath(publicSlug, pageSlug);
  if (!origin) return path;
  const base = origin.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) return path;
  return `${base}${path}`;
}

/* ------------------------------ Publish state ------------------------------ */

export const websitePublicationSchema = z.object({
  /** When the owner last prepared the draft for publishing. */
  preparedAt: z.string().datetime(),
  /** Fingerprint of the draft that was prepared. */
  fingerprint: z.string().regex(/^[0-9a-f]{14}$/),
  /** Stable public identifier; retained across unpublish/republish. */
  publicSlug: publicSlugSchema.optional(),
  /** When the site was last made live (or last republished). */
  publishedAt: z.string().datetime().optional(),
  /** Fingerprint of the version currently (or last) served publicly. */
  publishedFingerprint: z.string().regex(/^[0-9a-f]{14}$/).optional(),
  /** True while the public route serves this business's published snapshot. */
  live: z.boolean().optional(),
});
export type WebsitePublication = z.infer<typeof websitePublicationSchema>;

/** Stable 53-bit content fingerprint (change detection only, not a security hash). */
export function publicationFingerprint(site: PublishableWebsite): string {
  const input = JSON.stringify(site);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/**
 * unavailable — no valid stored specification
 * draft       — valid, never prepared
 * prepared    — prepared and unchanged; not live
 * published   — live, and the draft matches the live snapshot
 * outdated    — draft differs from the prepared and/or live snapshot
 * unpublished — had a public slug, currently not live
 */
export type PublicationStatus = "unavailable" | "draft" | "prepared" | "published" | "outdated" | "unpublished";

export function publicationStatus(website: Website): PublicationStatus {
  const built = buildPublishableWebsite(website.spec);
  if (!built.ok) return "unavailable";
  const pub = website.publication;
  if (!pub) return "draft";
  const current = publicationFingerprint(built.site);
  if (pub.live && pub.publishedFingerprint) {
    return pub.publishedFingerprint === current ? "published" : "outdated";
  }
  if (pub.publicSlug && pub.publishedAt && !pub.live) return "unpublished";
  return pub.fingerprint === current ? "prepared" : "outdated";
}

/** Merges prepare fields into an existing publication record without dropping public identity. */
export function withPreparedPublication(
  previous: WebsitePublication | undefined,
  preparedAt: string,
  fingerprint: string,
): WebsitePublication {
  return {
    ...(previous?.publicSlug ? { publicSlug: previous.publicSlug } : {}),
    ...(previous?.publishedAt ? { publishedAt: previous.publishedAt } : {}),
    ...(previous?.publishedFingerprint ? { publishedFingerprint: previous.publishedFingerprint } : {}),
    ...(previous?.live ? { live: true } : {}),
    preparedAt,
    fingerprint,
  };
}
