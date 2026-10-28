import { randomBytes } from "node:crypto";
import { and, eq, lt, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { business, generatedAsset, publishedWebsite, type schema } from "@/lib/db/schema";
import type { AssetStore } from "@/lib/agents/context";

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Served images are capped; generated logos are far smaller. */
export const MAX_ASSET_BYTES = 8_000_000;
const ASSET_ID = /^ast_[0-9a-f]{32}$/;

export function isAssetId(value: unknown): value is string {
  return typeof value === "string" && ASSET_ID.test(value);
}

export function assetUrl(id: string): string {
  return `/api/assets/${id}`;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPng(bytes: Buffer): boolean {
  return bytes.length > PNG_SIGNATURE.length && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}

/** Owner photos are capped below the general asset limit; a website hero photo needs far less. */
export const MAX_PHOTO_BYTES = 4_000_000;

/** The image type from the file's own bytes; the request's declared type is never trusted. */
export function sniffImageType(bytes: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (isPng(bytes)) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export type PhotoUploadResult = { ok: true; url: string } | { ok: false; reason: "unsupportedType" | "tooLarge" | "notFound" };

/**
 * Stores a photo the owner uploaded for their business website. Only PNG, JPEG or WebP
 * (detected from the bytes) up to {@link MAX_PHOTO_BYTES}; the business must be the user's.
 * The photo is private until a live published website references it.
 */
export async function saveOwnerPhoto(db: Db, userId: string, businessId: string, bytes: Buffer): Promise<PhotoUploadResult> {
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, reason: "tooLarge" };
  const contentType = sniffImageType(bytes);
  if (!contentType) return { ok: false, reason: "unsupportedType" };
  const owned = await db
    .select({ id: business.id })
    .from(business)
    .where(and(eq(business.id, businessId), eq(business.userId, userId)))
    .limit(1);
  if (owned.length === 0) return { ok: false, reason: "notFound" };
  const id = `ast_${randomBytes(16).toString("hex")}`;
  await db.insert(generatedAsset).values({ id, userId, businessId, kind: "photo", contentType, byteSize: bytes.length, bytes });
  return { ok: true, url: assetUrl(id) };
}

/** True when `url` is an asset of this user's business (so a brief can never point at someone else's image). */
export async function ownsAssetUrl(db: Db, userId: string, businessId: string, url: string): Promise<boolean> {
  const id = url.startsWith("/api/assets/") ? url.slice("/api/assets/".length) : "";
  if (!isAssetId(id)) return false;
  const rows = await db
    .select({ id: generatedAsset.id })
    .from(generatedAsset)
    .where(and(eq(generatedAsset.id, id), eq(generatedAsset.userId, userId), eq(generatedAsset.businessId, businessId)))
    .limit(1);
  return rows.length > 0;
}

/** Assets this new are never pruned: a generation in progress may have stored them before saving its package. */
export const ASSET_PRUNE_GRACE_MS = 15 * 60_000;

/**
 * Stores one generated image for a business the user owns and returns its URL.
 * Throws if the business is not the user's or the image is not an allowed PNG.
 */
export async function saveGeneratedAsset(
  db: Db,
  userId: string,
  businessId: string,
  asset: { kind: "logo" | "icon"; contentType: string; bytes: Buffer },
): Promise<string> {
  if (asset.contentType !== "image/png" || !isPng(asset.bytes) || asset.bytes.length > MAX_ASSET_BYTES) {
    throw new Error("asset-rejected");
  }
  const owned = await db
    .select({ id: business.id })
    .from(business)
    .where(and(eq(business.id, businessId), eq(business.userId, userId)))
    .limit(1);
  if (owned.length === 0) throw new Error("asset-business-not-found");

  const id = `ast_${randomBytes(16).toString("hex")}`;
  await db.insert(generatedAsset).values({
    id,
    userId,
    businessId,
    kind: asset.kind,
    contentType: asset.contentType,
    byteSize: asset.bytes.length,
    bytes: asset.bytes,
  });
  return assetUrl(id);
}

/** An `AssetStore` bound to one user's business, for the generation pipeline. */
export function businessAssetStore(db: Db, userId: string, businessId: string): AssetStore {
  return (asset) => saveGeneratedAsset(db, userId, businessId, asset);
}

const referencedBy = (column: SQL | AnyColumn, id: SQL | AnyColumn) => sql`position(${id} in ${column}::text) > 0`;

/**
 * Returns an image for a viewer allowed to see it: the business owner, or anyone when the
 * business's live published website references it. Everything else reads as not found.
 */
export async function getGeneratedAsset(
  db: Db,
  id: unknown,
  viewerUserId: string | null,
): Promise<{ contentType: string; bytes: Buffer; audience: "owner" | "public" } | null> {
  if (!isAssetId(id)) return null;
  const rows = await db
    .select({
      contentType: generatedAsset.contentType,
      bytes: generatedAsset.bytes,
      userId: generatedAsset.userId,
      published: sql<boolean>`exists (
        select 1 from ${publishedWebsite}
        where ${publishedWebsite.businessId} = ${generatedAsset.businessId}
          and ${publishedWebsite.status} = 'live'
          and ${referencedBy(publishedWebsite.site, generatedAsset.id)}
      )`,
    })
    .from(generatedAsset)
    .where(eq(generatedAsset.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const audience = viewerUserId !== null && row.userId === viewerUserId ? "owner" : row.published ? "public" : null;
  if (!audience) return null;
  return { contentType: row.contentType, bytes: Buffer.from(row.bytes), audience };
}

/**
 * Deletes a business's images that nothing points at any more (e.g. a logo replaced by
 * regeneration). An image is kept while any stored package or published snapshot mentions
 * it, and while it is younger than the grace period. Returns how many were deleted.
 */
export async function pruneUnreferencedAssets(db: Db, userId: string, businessId: string, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - ASSET_PRUNE_GRACE_MS);
  const deleted = await db
    .delete(generatedAsset)
    .where(
      and(
        eq(generatedAsset.userId, userId),
        eq(generatedAsset.businessId, businessId),
        lt(generatedAsset.createdAt, cutoff),
        sql`not exists (select 1 from ${business} where ${business.package} is not null and ${referencedBy(business.package, generatedAsset.id)})`,
        sql`not exists (select 1 from ${publishedWebsite} where ${referencedBy(publishedWebsite.site, generatedAsset.id)})`,
      ),
    )
    .returning({ id: generatedAsset.id });
  return deleted.length;
}
