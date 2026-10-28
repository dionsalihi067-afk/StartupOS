import { sql } from "drizzle-orm";
import { boolean, check, customType, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { BusinessInput, BusinessPackage } from "@/lib/types";

/*
 * Authentication tables follow the Better Auth core schema (property names must
 * match Better Auth's field names; column names are snake_case).
 */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  ...timestamps,
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/**
 * `generating` → the record exists and generation is running.
 * `ready`      → `package` holds a validated BusinessPackage.
 * `failed`     → generation did not produce a usable package (`error_code` says why).
 */
export const BUSINESS_STATUSES = ["generating", "ready", "failed"] as const;
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number];

export const business = pgTable(
  "business",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status", { enum: BUSINESS_STATUSES }).notNull(),
    /** Brand name; null until generation completes. */
    name: text("name"),
    slogan: text("slogan"),
    input: jsonb("input").$type<BusinessInput>().notNull(),
    package: jsonb("package").$type<BusinessPackage>(),
    /** Denormalised for lightweight list queries. */
    iconUrl: text("icon_url"),
    launchDone: integer("launch_done").notNull().default(0),
    launchTotal: integer("launch_total").notNull().default(0),
    errorCode: text("error_code"),
    /** Original browser-local project id when imported from localStorage. */
    legacyId: text("legacy_id"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index("business_user_updated_idx").on(t.userId, t.updatedAt.desc()),
    // Export orders by (created_at, id) after filtering (user_id, status); stale-generation
    // recovery also filters on (user_id, status), so this index serves both patterns.
    index("business_user_status_created_idx").on(t.userId, t.status, t.createdAt.desc(), t.id.desc()),
    uniqueIndex("business_user_legacy_idx").on(t.userId, t.legacyId),
    check("business_status_check", sql`${t.status} in ('generating', 'ready', 'failed')`),
    check("business_ready_has_package", sql`${t.status} <> 'ready' or ${t.package} is not null`),
  ],
);

/**
 * One public website per business. `live` rows are served at `/s/<public_slug>`.
 * The `site` column is the validated publishable snapshot visitors see; the
 * owner's draft package may change without affecting it until they republish.
 */
export const PUBLICATION_STATUSES = ["live", "unpublished"] as const;
export type PublicationRowStatus = (typeof PUBLICATION_STATUSES)[number];

export const publishedWebsite = pgTable(
  "published_website",
  {
    businessId: text("business_id")
      .primaryKey()
      .references(() => business.id, { onDelete: "cascade" }),
    publicSlug: text("public_slug").notNull(),
    status: text("status", { enum: PUBLICATION_STATUSES }).notNull(),
    fingerprint: text("fingerprint").notNull(),
    /** Validated publishable website snapshot (see `PublishableWebsite`). */
    site: jsonb("site").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("published_website_slug_uidx").on(t.publicSlug),
    index("published_website_status_idx").on(t.status),
    check("published_website_status_check", sql`${t.status} in ('live', 'unpublished')`),
  ],
);

/**
 * Fixed-window counters for expensive per-user operations, keyed `<policy>:<userId>`.
 * Lives in Postgres so every app instance shares the same counts.
 */
export const requestQuota = pgTable("request_quota", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
});

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * Images (generated logos and icons, and photos the owner uploads for the website), stored
 * in Postgres so they survive deploys, rebuilds and server restarts. Served by
 * `/api/assets/<id>`; ids are random and unguessable because published websites reference
 * them publicly.
 */
export const ASSET_KINDS = ["logo", "icon", "photo"] as const;
export const ASSET_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const generatedAsset = pgTable(
  "generated_asset",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ASSET_KINDS }).notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    bytes: bytea("bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("generated_asset_business_idx").on(t.businessId),
    check("generated_asset_kind_check", sql`${t.kind} in ('logo', 'icon', 'photo')`),
    // Generated logos and icons stay PNG; only owner photos may be JPEG or WebP.
    check(
      "generated_asset_content_type_check",
      sql`${t.contentType} = 'image/png' or (${t.kind} = 'photo' and ${t.contentType} in ('image/jpeg', 'image/webp'))`,
    ),
  ],
);

export const schema = { user, session, account, verification, business, publishedWebsite, requestQuota, generatedAsset };
