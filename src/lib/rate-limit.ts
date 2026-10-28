import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { requestQuota, type schema } from "@/lib/db/schema";

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const HOUR_MS = 60 * 60 * 1000;
const MAX_CONFIGURABLE_LIMIT = 10_000;

/**
 * Per-user limits for operations that spend paid model or search capacity.
 * Each limit can be tuned with its env var (a whole number from 1 to 10,000);
 * missing or invalid values fall back to the default, so a limit can never be switched off.
 */
export const RATE_LIMIT_POLICIES = {
  generate: { env: "RATE_LIMIT_GENERATE_PER_HOUR", defaultLimit: 10, windowMs: HOUR_MS },
  regenerate: { env: "RATE_LIMIT_REGENERATE_PER_HOUR", defaultLimit: 30, windowMs: HOUR_MS },
  research: { env: "RATE_LIMIT_RESEARCH_PER_HOUR", defaultLimit: 20, windowMs: HOUR_MS },
  /** Owner photo uploads: bounds database storage written per user. */
  upload: { env: "RATE_LIMIT_UPLOAD_PER_HOUR", defaultLimit: 30, windowMs: HOUR_MS },
} as const;

export type RateLimitPolicy = keyof typeof RATE_LIMIT_POLICIES;

export type RateLimitDecision = { allowed: true; remaining: number } | { allowed: false; retryAfterSeconds: number };

const warnedInvalid = new Set<string>();

export function rateLimitFor(policy: RateLimitPolicy, env: Record<string, string | undefined> = process.env): number {
  const { env: name, defaultLimit } = RATE_LIMIT_POLICIES[policy];
  const raw = env[name]?.trim();
  if (!raw) return defaultLimit;
  const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (value >= 1 && value <= MAX_CONFIGURABLE_LIMIT) return value;
  if (!warnedInvalid.has(name)) {
    warnedInvalid.add(name);
    console.warn(`[rate-limit] ${name} must be a whole number from 1 to ${MAX_CONFIGURABLE_LIMIT}; using ${defaultLimit}`);
  }
  return defaultLimit;
}

/**
 * Counts one attempt for `userId` against `policy` in a fixed window and decides whether it may proceed.
 * The upsert is a single atomic statement, so concurrent requests on any instance share one counter.
 * Database errors propagate: callers must treat them as "not allowed" (fail closed).
 */
export async function consumeRateLimit(
  db: Db,
  policy: RateLimitPolicy,
  userId: string,
  now = new Date(),
): Promise<RateLimitDecision> {
  const { windowMs } = RATE_LIMIT_POLICIES[policy];
  const limit = rateLimitFor(policy);
  const nowParam = sql`${now.toISOString()}::timestamptz`;
  const expired = sql`${requestQuota.windowStart} <= ${new Date(now.getTime() - windowMs).toISOString()}::timestamptz`;

  const [row] = await db
    .insert(requestQuota)
    .values({ key: `${policy}:${userId}`, count: 1, windowStart: now })
    .onConflictDoUpdate({
      target: requestQuota.key,
      set: {
        count: sql`case when ${expired} then 1 else ${requestQuota.count} + 1 end`,
        windowStart: sql`case when ${expired} then ${nowParam} else ${requestQuota.windowStart} end`,
      },
    })
    .returning({ count: requestQuota.count, windowStart: requestQuota.windowStart });

  if (!row) throw new Error("rate limit counter was not updated");
  if (row.count <= limit) return { allowed: true, remaining: limit - row.count };
  const resetAt = new Date(row.windowStart).getTime() + windowMs;
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000)) };
}
