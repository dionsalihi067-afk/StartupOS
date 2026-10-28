import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { business, publishedWebsite, type schema } from "@/lib/db/schema";
import { parseBusinessPackage } from "@/lib/package-schema";
import { applyBrandEdit, type BrandEdit } from "@/lib/brand-edit";
import type { BusinessInput, BusinessPackage } from "@/lib/types";
import type { GeneratedSectionId } from "@/lib/dependencies";
import {
  applyRegenerationMeta,
  applySectionPatches,
  type SectionOutcome,
  type SectionPatch,
} from "@/lib/regenerate-core";
import {
  buildPublishableWebsite,
  publicationFingerprint,
  publishableWebsiteSchema,
  publicSlugCandidates,
  publicSlugSchema,
  withPreparedPublication,
  type PublishableWebsite,
} from "@/lib/website/publish";
import { checkWebsite, hasBlockingIssues } from "@/lib/website/quality";
import type { BusinessDetail, BusinessErrorCode, BusinessSummary, ImportResult } from "./types";

/**
 * Data access for businesses. Every function takes the owner's user id and
 * scopes the query by it, so a business owned by someone else behaves exactly
 * like one that does not exist.
 */

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
type Row = typeof business.$inferSelect;

/**
 * Route `maxDuration` for generate/regenerate is 300s. Active runs also call
 * {@link touchGeneratingBusiness} (throttled) so `updated_at` advances while work
 * continues — local/dev runs may exceed the route budget without being recovered as
 * abandoned. The stale threshold stays above the route limit plus grace for clock
 * skew and a late completion write when heartbeats stop (crash / kill).
 * Active runs younger than this are never recovered; terminal rows are never touched.
 */
export const GENERATION_ROUTE_MAX_MS = 300 * 1000;
/**
 * Soft stop before the platform kills the request (`maxDuration`). Leaves headroom
 * for a final fail/persist write. Not a durable worker — work still runs in the
 * request; this only fails honestly instead of dying mid-write.
 */
export const GENERATION_SOFT_DEADLINE_MS = GENERATION_ROUTE_MAX_MS - 45 * 1000;
/** Grace after the route limit before a still-`generating` row is treated as abandoned. */
export const STALE_GENERATION_GRACE_MS = 180 * 1000;
export const STALE_GENERATION_MS = GENERATION_ROUTE_MAX_MS + STALE_GENERATION_GRACE_MS;
/** Minimum gap between generation heartbeats (must stay well below {@link STALE_GENERATION_MS}). */
export const GENERATION_HEARTBEAT_MIN_INTERVAL_MS = 60 * 1000;

const summaryColumns = {
  id: business.id,
  status: business.status,
  name: business.name,
  slogan: business.slogan,
  input: business.input,
  iconUrl: business.iconUrl,
  launchDone: business.launchDone,
  launchTotal: business.launchTotal,
  errorCode: business.errorCode,
  createdAt: business.createdAt,
  updatedAt: business.updatedAt,
  version: business.version,
};

type SummaryRow = Pick<Row, keyof typeof summaryColumns>;

/** Increments the row's revision inside the UPDATE itself, so concurrent writers cannot reuse a number. */
const nextVersion = sql`${business.version} + 1`;

export function newBusinessId(): string {
  return `biz_${randomUUID().replace(/-/g, "")}`;
}

function toSummary(row: SummaryRow, now = Date.now()): BusinessSummary {
  const stale = row.status === "generating" && now - row.updatedAt.getTime() > STALE_GENERATION_MS;
  return {
    id: row.id,
    status: stale ? "failed" : row.status,
    name: row.name,
    slogan: row.slogan,
    idea: row.input.idea,
    location: row.input.location,
    iconUrl: row.iconUrl,
    launchDone: row.launchDone,
    launchTotal: row.launchTotal,
    errorCode: stale ? "interrupted" : (row.errorCode as BusinessErrorCode | null),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

function derivedColumns(pkg: BusinessPackage) {
  const logo = pkg.brand.logo;
  return {
    name: pkg.brand.name,
    slogan: pkg.brand.slogan,
    iconUrl: logo.generated ? logo.iconUrl || logo.imageUrl || null : null,
    launchDone: pkg.launch.checklist.filter((c) => c.done).length,
    launchTotal: pkg.launch.checklist.length,
  };
}

export const BUSINESS_PAGE_SIZE = 50;

export interface BusinessPage {
  businesses: BusinessSummary[];
  /** Opaque cursor for the next page; null on the last page. */
  nextCursor: string | null;
}

/** Keyset position (updated_at, id); timestamps keep microsecond precision so no row is skipped or repeated. */
interface ListPosition {
  updatedAt: string;
  id: string;
}

export function encodeListCursor(position: ListPosition): string {
  return Buffer.from(`${position.updatedAt}|${position.id}`, "utf8").toString("base64url");
}

export function decodeListCursor(cursor: string): ListPosition | null {
  if (cursor.length > 200) return null;
  const [updatedAt, id, ...rest] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  if (rest.length > 0 || !updatedAt || !id || !/^biz_[0-9a-f]{32}$/.test(id)) return null;
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:[+-]\d{2}(?::?\d{2})?|Z)?$/.test(updatedAt)) return null;
  return { updatedAt, id };
}

/**
 * One page of the user's businesses, most recently updated first. Keyset
 * pagination on (updated_at, id) uses the (user_id, updated_at desc) index and
 * stays fast however many businesses an account has.
 */
export async function listBusinesses(
  db: Db,
  userId: string,
  options: { cursor?: string | null; limit?: number } = {},
): Promise<BusinessPage> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? BUSINESS_PAGE_SIZE), 1), BUSINESS_PAGE_SIZE);
  const after = options.cursor ? decodeListCursor(options.cursor) : null;
  if (!options.cursor) await recoverStaleGenerations(db, userId);
  const rows = await db
    .select({ ...summaryColumns, position: sql<string>`${business.updatedAt}::text` })
    .from(business)
    .where(
      and(
        eq(business.userId, userId),
        after ? sql`(${business.updatedAt}, ${business.id}) < (${after.updatedAt}::timestamptz, ${after.id})` : undefined,
      ),
    )
    .orderBy(desc(business.updatedAt), desc(business.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    businesses: page.map((r) => toSummary(r)),
    nextCursor: rows.length > limit && last ? encodeListCursor({ updatedAt: last.position, id: last.id }) : null,
  };
}

export async function getBusiness(db: Db, userId: string, id: string): Promise<BusinessDetail | null> {
  await recoverStaleGenerations(db, userId);
  const [row] = await db
    .select()
    .from(business)
    .where(and(eq(business.id, id), eq(business.userId, userId)))
    .limit(1);
  if (!row) return null;

  const summary = toSummary(row);
  if (row.status !== "ready") return { ...summary, package: null };

  const pkg = parseBusinessPackage(row.package);
  if (!pkg) {
    console.error(`[businesses] stored package failed validation (business ${row.id})`);
    return { ...summary, status: "failed", errorCode: "invalidData", package: null };
  }
  return { ...summary, package: { ...pkg, id: row.id } };
}

/** Resolves an old browser-local project id to the imported business for this user. */
export async function findByLegacyId(db: Db, userId: string, legacyId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: business.id })
    .from(business)
    .where(and(eq(business.userId, userId), eq(business.legacyId, legacyId)))
    .limit(1);
  return row?.id ?? null;
}

export async function createGeneratingBusiness(db: Db, userId: string, input: BusinessInput): Promise<string> {
  const id = newBusinessId();
  await db.insert(business).values({ id, userId, status: "generating", input });
  return id;
}

/**
 * Bumps `updated_at` for an in-flight generation so list/detail stale recovery does not
 * mark an active run as `interrupted`. Does not change version or status. Returns false
 * when the row is missing, not owned, or no longer `generating`.
 */
export async function touchGeneratingBusiness(db: Db, userId: string, id: string): Promise<boolean> {
  const updated = await db
    .update(business)
    .set({ updatedAt: new Date() })
    .where(and(eq(business.id, id), eq(business.userId, userId), eq(business.status, "generating")))
    .returning({ id: business.id });
  return updated.length > 0;
}

/**
 * Throttles {@link touchGeneratingBusiness} so agent progress events do not write every
 * tick. `pulse(true)` always touches; a failed touch means the row was settled elsewhere
 * (e.g. recovered as stale) and the worker should stop.
 */
export function createGeneratingHeartbeat(
  touch: () => Promise<boolean>,
  minIntervalMs = GENERATION_HEARTBEAT_MIN_INTERVAL_MS,
): { pulse: (force?: boolean) => Promise<boolean> } {
  let last = 0;
  return {
    async pulse(force = false) {
      const now = Date.now();
      if (!force && last > 0 && now - last < minIntervalMs) return true;
      const ok = await touch();
      if (ok) last = now;
      return ok;
    },
  };
}

/** Stores a generated package. Returns the stored package, or null if it failed validation. */
export async function completeGeneration(
  db: Db,
  userId: string,
  id: string,
  generated: BusinessPackage,
): Promise<BusinessPackage | null> {
  const pkg = parseBusinessPackage({ ...generated, id });
  if (!pkg) {
    await failGeneration(db, userId, id, "invalidData");
    return null;
  }
  const updated = await db
    .update(business)
    .set({ status: "ready", package: pkg, errorCode: null, version: nextVersion, ...derivedColumns(pkg) })
    .where(and(eq(business.id, id), eq(business.userId, userId), eq(business.status, "generating")))
    .returning({ id: business.id });
  // Zero rows: deleted, not owned, or already settled (e.g. recovered as stale) — never report success.
  return updated.length ? pkg : null;
}

/** Marks a still-generating business failed. Settled businesses are never touched; returns whether a row changed. */
export async function failGeneration(db: Db, userId: string, id: string, code: BusinessErrorCode): Promise<boolean> {
  const updated = await db
    .update(business)
    .set({ status: "failed", errorCode: code, version: nextVersion })
    .where(and(eq(business.id, id), eq(business.userId, userId), eq(business.status, "generating")))
    .returning({ id: business.id });
  return updated.length > 0;
}

/**
 * Persists the stale-generation rule for this user: `generating` rows untouched for longer than
 * {@link STALE_GENERATION_MS} become `failed`/`interrupted`. Idempotent, and a worker that finishes
 * afterwards cannot revive the row because completion requires `status = 'generating'`.
 */
export async function recoverStaleGenerations(db: Db, userId: string, now = Date.now()): Promise<number> {
  const updated = await db
    .update(business)
    .set({ status: "failed", errorCode: "interrupted", version: nextVersion })
    .where(
      and(
        eq(business.userId, userId),
        eq(business.status, "generating"),
        lt(business.updatedAt, new Date(now - STALE_GENERATION_MS)),
      ),
    )
    .returning({ id: business.id });
  return updated.length;
}

export type PackageUpdate =
  | { ok: true; summary: BusinessSummary; package: BusinessPackage }
  | { ok: false; reason: "notFound" | "notReady" | "invalidIndex" | "invalidValue" };

/**
 * Applies one change to a stored package. The row is locked for the
 * read-modify-write so concurrent edits from two tabs apply one after the other
 * instead of the later write discarding the earlier one. `change` returns the
 * new package, or a failure reason; it must only touch the field being edited.
 */
async function updatePackage(
  db: Db,
  userId: string,
  id: string,
  change: (current: BusinessPackage) => BusinessPackage | "invalidIndex" | "invalidValue",
): Promise<PackageUpdate> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(business)
      .where(and(eq(business.id, id), eq(business.userId, userId)))
      .for("update")
      .limit(1);
    if (!row) return { ok: false, reason: "notFound" } as const;
    if (row.status !== "ready") return { ok: false, reason: "notReady" } as const;

    const current = parseBusinessPackage(row.package);
    if (!current) return { ok: false, reason: "notReady" } as const;
    const changed = change({ ...current, id: row.id });
    if (typeof changed === "string") return { ok: false, reason: changed } as const;
    const next = parseBusinessPackage(changed);
    if (!next) return { ok: false, reason: "invalidValue" } as const;

    const [saved] = await tx
      .update(business)
      .set({ package: next, version: row.version + 1, ...derivedColumns(next) })
      .where(and(eq(business.id, id), eq(business.userId, userId)))
      .returning(summaryColumns);
    return { ok: true, summary: toSummary(saved!), package: next } as const;
  });
}

/** Sets one launch checklist item. */
export async function setChecklistItem(
  db: Db,
  userId: string,
  id: string,
  index: number,
  done: boolean,
): Promise<PackageUpdate> {
  return updatePackage(db, userId, id, (current) => {
    if (!Number.isInteger(index) || index < 0 || index >= current.launch.checklist.length) return "invalidIndex";
    const checklist = current.launch.checklist.map((c, i) => (i === index ? { ...c, done } : c));
    return { ...current, launch: { ...current.launch, checklist } };
  });
}

export async function updateBrand(db: Db, userId: string, id: string, edit: BrandEdit): Promise<PackageUpdate> {
  return updatePackage(db, userId, id, (current) => applyBrandEdit(current, edit));
}

export type ScopedRegenerationSave =
  | {
      ok: true;
      summary: BusinessSummary;
      package: BusinessPackage;
      outcomes: SectionOutcome[];
      succeeded: GeneratedSectionId[];
      failed: GeneratedSectionId[];
    }
  | { ok: false; reason: "notFound" | "notReady" | "invalidValue" };

/**
 * Persists successful scoped-regeneration patches onto the latest locked
 * package. Unrelated fields and `package.input` are preserved. Call only after
 * agents have already produced `patches` in memory.
 */
export async function saveScopedRegeneration(
  db: Db,
  userId: string,
  id: string,
  patches: readonly SectionPatch[],
  outcomes: readonly SectionOutcome[],
): Promise<ScopedRegenerationSave> {
  const succeeded = outcomes.filter((o) => o.status !== "error").map((o) => o.section);
  const failed = outcomes.filter((o) => o.status === "error").map((o) => o.section);

  if (patches.length === 0) {
    const detail = await getBusiness(db, userId, id);
    if (!detail) return { ok: false, reason: "notFound" };
    if (detail.status !== "ready" || !detail.package) return { ok: false, reason: "notReady" };
    return {
      ok: true,
      summary: {
        id: detail.id,
        status: detail.status,
        name: detail.name,
        slogan: detail.slogan,
        idea: detail.idea,
        location: detail.location,
        iconUrl: detail.iconUrl,
        launchDone: detail.launchDone,
        launchTotal: detail.launchTotal,
        errorCode: detail.errorCode,
        createdAt: detail.createdAt,
        updatedAt: detail.updatedAt,
        version: detail.version,
      },
      package: detail.package,
      outcomes: [...outcomes],
      succeeded,
      failed,
    };
  }

  const result = await updatePackage(db, userId, id, (latest) => {
    const merged = applyRegenerationMeta(applySectionPatches(latest, patches), outcomes);
    // Keep saved source context — regeneration must not rewrite input.
    return { ...merged, input: latest.input, id: latest.id, createdAt: latest.createdAt };
  });

  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason === "notFound" || result.reason === "notReady" ? result.reason : "invalidValue",
    };
  }

  return {
    ok: true,
    summary: result.summary,
    package: result.package,
    outcomes: [...outcomes],
    succeeded,
    failed,
  };
}

export type WebsitePublicationSave =
  | { ok: true; summary: BusinessSummary; package: BusinessPackage; site: PublishableWebsite; changed: boolean }
  | { ok: false; reason: "notFound" | "notReady" | "invalidWebsite" | "needsFixes" };

/**
 * Marks the stored website as prepared for publishing. Only
 * `website.publication` is written; content is never generated or repaired, and
 * repeating it for an unchanged website writes nothing.
 */
export async function saveWebsitePublication(db: Db, userId: string, id: string, now = new Date()): Promise<WebsitePublicationSave> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(business)
      .where(and(eq(business.id, id), eq(business.userId, userId)))
      .for("update")
      .limit(1);
    if (!row) return { ok: false, reason: "notFound" } as const;
    if (row.status !== "ready") return { ok: false, reason: "notReady" } as const;

    const current = parseBusinessPackage(row.package);
    if (!current) return { ok: false, reason: "notReady" } as const;
    const built = buildPublishableWebsite(current.website.spec);
    if (!built.ok) return { ok: false, reason: "invalidWebsite" } as const;
    if (hasBlockingIssues(checkWebsite(built.site, current.input))) return { ok: false, reason: "needsFixes" } as const;

    const fingerprint = publicationFingerprint(built.site);
    if (current.website.publication?.fingerprint === fingerprint) {
      return { ok: true, summary: toSummary(row), package: { ...current, id: row.id }, site: built.site, changed: false } as const;
    }

    const next = parseBusinessPackage({
      ...current,
      id: row.id,
      website: {
        ...current.website,
        publication: withPreparedPublication(current.website.publication, now.toISOString(), fingerprint),
      },
    });
    if (!next) return { ok: false, reason: "invalidWebsite" } as const;

    const [saved] = await tx
      .update(business)
      .set({ package: next, version: row.version + 1 })
      .where(and(eq(business.id, id), eq(business.userId, userId)))
      .returning(summaryColumns);
    return { ok: true, summary: toSummary(saved!), package: next, site: built.site, changed: true } as const;
  });
}

export type WebsitePublishLive =
  | {
      ok: true;
      summary: BusinessSummary;
      package: BusinessPackage;
      site: PublishableWebsite;
      publicSlug: string;
      changed: boolean;
    }
  | { ok: false; reason: "notFound" | "notReady" | "invalidWebsite" | "needsFixes" | "slugUnavailable" };

/**
 * Makes the owned business's current website publicly available at `/s/<slug>`.
 * Persists a validated snapshot so later draft edits do not affect visitors
 * until the owner republishes. Reuses an existing public slug when present.
 */
export async function publishWebsiteLive(db: Db, userId: string, id: string, now = new Date()): Promise<WebsitePublishLive> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(business)
      .where(and(eq(business.id, id), eq(business.userId, userId)))
      .for("update")
      .limit(1);
    if (!row) return { ok: false, reason: "notFound" } as const;
    if (row.status !== "ready") return { ok: false, reason: "notReady" } as const;

    const current = parseBusinessPackage(row.package);
    if (!current) return { ok: false, reason: "notReady" } as const;
    const built = buildPublishableWebsite(current.website.spec);
    if (!built.ok) return { ok: false, reason: "invalidWebsite" } as const;
    if (hasBlockingIssues(checkWebsite(built.site, current.input))) return { ok: false, reason: "needsFixes" } as const;

    const fingerprint = publicationFingerprint(built.site);
    const [existing] = await tx.select().from(publishedWebsite).where(eq(publishedWebsite.businessId, id)).for("update").limit(1);

    let publicSlug = existing?.publicSlug ?? current.website.publication?.publicSlug;
    if (!publicSlug) {
      // Only the ≤51 candidate slugs can ever be chosen, so only those rows matter.
      // (Previously this loaded every published slug in the database, inside a lock.)
      const candidates = publicSlugCandidates(built.site.siteName);
      // Serialize slug allocation for this base slug until commit. Without this, two
      // concurrent publishes can both observe the base slug as free; the loser's INSERT
      // then aborts its whole transaction on the unique index, so an in-transaction
      // retry query could never succeed (PostgreSQL rejects it as aborted).
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`publish-slug:${candidates[0] ?? "site"}`}))`);
      const taken = new Set(
        (
          await tx
            .select({ slug: publishedWebsite.publicSlug })
            .from(publishedWebsite)
            .where(inArray(publishedWebsite.publicSlug, candidates))
        ).map((r) => r.slug),
      );
      publicSlug = candidates.find((c) => !taken.has(c));
      if (!publicSlug) return { ok: false, reason: "slugUnavailable" } as const;
    } else {
      const parsed = publicSlugSchema.safeParse(publicSlug);
      if (!parsed.success) return { ok: false, reason: "slugUnavailable" } as const;
      publicSlug = parsed.data;
    }

    const unchanged =
      existing?.status === "live" &&
      existing.fingerprint === fingerprint &&
      existing.publicSlug === publicSlug &&
      current.website.publication?.live === true &&
      current.website.publication.publishedFingerprint === fingerprint;

    if (unchanged && existing) {
      return {
        ok: true,
        summary: toSummary(row),
        package: { ...current, id: row.id },
        site: built.site,
        publicSlug,
        changed: false,
      } as const;
    }

    try {
      await tx
        .insert(publishedWebsite)
        .values({
          businessId: id,
          publicSlug,
          status: "live",
          fingerprint,
          site: built.site,
          publishedAt: now,
        })
        .onConflictDoUpdate({
          target: publishedWebsite.businessId,
          set: {
            publicSlug,
            status: "live",
            fingerprint,
            site: built.site,
            publishedAt: now,
            updatedAt: now,
          },
        });
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "23505") {
        // Unique slug taken by another business — try the next candidates once.
        // Bounded to the candidate list, like the initial slug selection.
        const candidates = publicSlugCandidates(built.site.siteName, existing?.publicSlug);
        const taken = new Set(
          (
            await tx
              .select({ slug: publishedWebsite.publicSlug })
              .from(publishedWebsite)
              .where(inArray(publishedWebsite.publicSlug, candidates))
          ).map((r) => r.slug),
        );
        const nextSlug = candidates.find((c) => !taken.has(c));
        if (!nextSlug) return { ok: false, reason: "slugUnavailable" } as const;
        publicSlug = nextSlug;
        await tx
          .insert(publishedWebsite)
          .values({
            businessId: id,
            publicSlug,
            status: "live",
            fingerprint,
            site: built.site,
            publishedAt: now,
          })
          .onConflictDoUpdate({
            target: publishedWebsite.businessId,
            set: {
              publicSlug,
              status: "live",
              fingerprint,
              site: built.site,
              publishedAt: now,
              updatedAt: now,
            },
          });
      } else {
        throw err;
      }
    }

    const publishedAt = now.toISOString();
    const next = parseBusinessPackage({
      ...current,
      id: row.id,
      website: {
        ...current.website,
        publication: {
          preparedAt: current.website.publication?.preparedAt ?? publishedAt,
          fingerprint,
          publicSlug,
          publishedAt,
          publishedFingerprint: fingerprint,
          live: true,
        },
      },
    });
    if (!next) return { ok: false, reason: "invalidWebsite" } as const;

    const [saved] = await tx
      .update(business)
      .set({ package: next, version: row.version + 1 })
      .where(and(eq(business.id, id), eq(business.userId, userId)))
      .returning(summaryColumns);
    return { ok: true, summary: toSummary(saved!), package: next, site: built.site, publicSlug, changed: true } as const;
  });
}

export type WebsiteUnpublish =
  | { ok: true; summary: BusinessSummary; package: BusinessPackage; changed: boolean }
  | { ok: false; reason: "notFound" | "notReady" | "notPublished" };

/** Removes public availability while preserving the workspace package and public slug. */
export async function unpublishWebsite(db: Db, userId: string, id: string, now = new Date()): Promise<WebsiteUnpublish> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(business)
      .where(and(eq(business.id, id), eq(business.userId, userId)))
      .for("update")
      .limit(1);
    if (!row) return { ok: false, reason: "notFound" } as const;
    if (row.status !== "ready") return { ok: false, reason: "notReady" } as const;

    const current = parseBusinessPackage(row.package);
    if (!current) return { ok: false, reason: "notReady" } as const;

    const [existing] = await tx.select().from(publishedWebsite).where(eq(publishedWebsite.businessId, id)).for("update").limit(1);
    if (existing?.status !== "live" && current.website.publication?.live !== true) {
      return { ok: false, reason: "notPublished" } as const;
    }

    let changed = false;
    if (existing?.status === "live") {
      await tx.update(publishedWebsite).set({ status: "unpublished", updatedAt: now }).where(eq(publishedWebsite.businessId, id));
      changed = true;
    }

    const pub = current.website.publication;
    if (pub?.live === true) {
      const next = parseBusinessPackage({
        ...current,
        id: row.id,
        website: {
          ...current.website,
          publication: {
            preparedAt: pub.preparedAt,
            fingerprint: pub.fingerprint,
            publicSlug: pub.publicSlug ?? existing?.publicSlug,
            publishedAt: pub.publishedAt ?? existing?.publishedAt.toISOString(),
            publishedFingerprint: pub.publishedFingerprint ?? existing?.fingerprint,
            live: false,
          },
        },
      });
      if (!next) return { ok: false, reason: "notReady" } as const;
      const [saved] = await tx
        .update(business)
        .set({ package: next, version: row.version + 1 })
        .where(and(eq(business.id, id), eq(business.userId, userId)))
        .returning(summaryColumns);
      return { ok: true, summary: toSummary(saved!), package: next, changed: true } as const;
    }

    return { ok: true, summary: toSummary(row), package: { ...current, id: row.id }, changed } as const;
  });
}

export type PublicWebsiteLookup =
  | { ok: true; publicSlug: string; site: PublishableWebsite; fingerprint: string; publishedAt: string }
  | { ok: false; reason: "notFound" };

/**
 * Resolves a live published website by its public slug. No authentication.
 * Returns only the validated publishable snapshot — never the business package.
 */
export async function getLivePublishedWebsite(db: Db, publicSlug: unknown): Promise<PublicWebsiteLookup> {
  const slug = publicSlugSchema.safeParse(typeof publicSlug === "string" ? publicSlug.toLowerCase() : publicSlug);
  if (!slug.success) return { ok: false, reason: "notFound" };

  const [row] = await db
    .select({
      publicSlug: publishedWebsite.publicSlug,
      site: publishedWebsite.site,
      fingerprint: publishedWebsite.fingerprint,
      publishedAt: publishedWebsite.publishedAt,
      status: publishedWebsite.status,
    })
    .from(publishedWebsite)
    .where(and(eq(publishedWebsite.publicSlug, slug.data), eq(publishedWebsite.status, "live")))
    .limit(1);
  if (!row) return { ok: false, reason: "notFound" };

  const site = publishableWebsiteSchema.safeParse(row.site);
  if (!site.success) {
    console.error(`[publish] live snapshot failed validation (slug ${slug.data})`);
    return { ok: false, reason: "notFound" };
  }
  return {
    ok: true,
    publicSlug: row.publicSlug,
    site: site.data,
    fingerprint: row.fingerprint,
    publishedAt: row.publishedAt.toISOString(),
  };
}

/**
 * Replaces the owner-supplied business context (`input`) only. Generated
 * package output (brand, website, marketing, …) is left untouched — scoped
 * regeneration is a separate explicit operation.
 */
export async function updateBusinessContext(
  db: Db,
  userId: string,
  id: string,
  input: BusinessInput,
): Promise<PackageUpdate> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(business)
      .where(and(eq(business.id, id), eq(business.userId, userId)))
      .for("update")
      .limit(1);
    if (!row) return { ok: false, reason: "notFound" } as const;
    if (row.status !== "ready") return { ok: false, reason: "notReady" } as const;

    const current = parseBusinessPackage(row.package);
    if (!current) return { ok: false, reason: "notReady" } as const;

    // Website setup answers are edited separately; a context edit that does not carry them keeps them.
    const merged: BusinessInput = input.website || !current.input.website ? input : { ...input, website: current.input.website };
    const next = parseBusinessPackage({ ...current, id: row.id, input: merged });
    if (!next) return { ok: false, reason: "invalidValue" } as const;

    const [saved] = await tx
      .update(business)
      .set({ input: merged, package: next, version: row.version + 1 })
      .where(and(eq(business.id, id), eq(business.userId, userId)))
      .returning(summaryColumns);
    return { ok: true, summary: toSummary(saved!), package: next } as const;
  });
}

/**
 * Stores Website setup answers and the website rebuilt from them in one locked
 * write. `rebuild` receives the latest package and must return it with the new
 * `input.website`; both the `input` column and `package.input` are updated.
 */
export async function saveWebsiteBrief(
  db: Db,
  userId: string,
  id: string,
  rebuild: (current: BusinessPackage) => BusinessPackage,
): Promise<PackageUpdate> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(business)
      .where(and(eq(business.id, id), eq(business.userId, userId)))
      .for("update")
      .limit(1);
    if (!row) return { ok: false, reason: "notFound" } as const;
    if (row.status !== "ready") return { ok: false, reason: "notReady" } as const;

    const current = parseBusinessPackage(row.package);
    if (!current) return { ok: false, reason: "notReady" } as const;
    const rebuilt = rebuild({ ...current, id: row.id });
    const next = parseBusinessPackage({ ...rebuilt, id: row.id, createdAt: current.createdAt });
    if (!next) return { ok: false, reason: "invalidValue" } as const;

    const [saved] = await tx
      .update(business)
      .set({ input: next.input, package: next, version: row.version + 1, ...derivedColumns(next) })
      .where(and(eq(business.id, id), eq(business.userId, userId)))
      .returning(summaryColumns);
    return { ok: true, summary: toSummary(saved!), package: next } as const;
  });
}

export async function deleteBusiness(db: Db, userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(business)
    .where(and(eq(business.id, id), eq(business.userId, userId)))
    .returning({ id: business.id });
  return deleted.length > 0;
}

/** Full packages for the owner's data export. */
const EXPORT_BATCH = 20;

/**
 * Every ready business owned by the user, read in small keyset batches so an
 * export never holds all packages in memory at once.
 */
export async function* exportBusinesses(db: Db, userId: string): AsyncGenerator<BusinessPackage> {
  let after: { createdAt: string; id: string } | null = null;
  for (;;) {
    const rows: { id: string; createdAt: string; package: unknown }[] = await db
      .select({ id: business.id, createdAt: sql<string>`${business.createdAt}::text`, package: business.package })
      .from(business)
      .where(
        and(
          eq(business.userId, userId),
          eq(business.status, "ready"),
          after ? sql`(${business.createdAt}, ${business.id}) < (${after.createdAt}::timestamptz, ${after.id})` : undefined,
        ),
      )
      .orderBy(desc(business.createdAt), desc(business.id))
      .limit(EXPORT_BATCH);
    for (const r of rows) {
      const pkg = parseBusinessPackage(r.package);
      if (pkg) yield { ...pkg, id: r.id };
    }
    if (rows.length < EXPORT_BATCH) return;
    const last = rows[rows.length - 1]!;
    after = { createdAt: last.createdAt, id: last.id };
  }
}

/**
 * Imports one browser-local project. Idempotent per (user, legacy id): a second
 * import of the same project returns the existing business instead of a copy.
 */
export async function importLegacyProject(db: Db, userId: string, raw: unknown): Promise<ImportResult> {
  const legacyId =
    raw && typeof raw === "object" && typeof (raw as { id?: unknown }).id === "string"
      ? (raw as { id: string }).id.slice(0, 200)
      : "";
  if (!legacyId) return { legacyId, status: "invalid", businessId: null };

  const existing = await findByLegacyId(db, userId, legacyId);
  if (existing) return { legacyId, status: "duplicate", businessId: existing };

  const parsed = parseBusinessPackage(raw);
  if (!parsed) return { legacyId, status: "invalid", businessId: null };

  const id = newBusinessId();
  // Publication is a server-owned live snapshot. Never trust imported live/slug
  // flags — public access only exists after an explicit publish of this account.
  const { publication: _drop, ...websiteWithoutPublication } = parsed.website;
  void _drop;
  const pkg: BusinessPackage = { ...parsed, id, website: websiteWithoutPublication };
  const created = Number.isNaN(Date.parse(parsed.createdAt)) ? new Date() : new Date(parsed.createdAt);

  const inserted = await db
    .insert(business)
    .values({
      id,
      userId,
      status: "ready",
      input: pkg.input,
      package: pkg,
      legacyId,
      createdAt: created,
      ...derivedColumns(pkg),
    })
    .onConflictDoNothing({ target: [business.userId, business.legacyId] })
    .returning({ id: business.id });

  if (inserted.length) return { legacyId, status: "imported", businessId: id };
  const raced = await findByLegacyId(db, userId, legacyId);
  return raced ? { legacyId, status: "duplicate", businessId: raced } : { legacyId, status: "failed", businessId: null };
}
