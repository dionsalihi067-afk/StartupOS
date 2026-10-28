import { z } from "zod";

/**
 * Server configuration required for accounts and persistence. Errors list
 * variable names only, never values.
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().optional(),
  /** Optional public origin for absolute published website URLs (e.g. https://app.example.com). */
  APP_ORIGIN: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Names of required variables that are unset and of any set variable with an invalid value.
 * Production also requires BETTER_AUTH_URL so auth origins and public links never depend on the request host.
 */
export function missingServerEnv(source: NodeJS.ProcessEnv = process.env): string[] {
  const result = serverEnvSchema.safeParse({
    DATABASE_URL: source.DATABASE_URL || undefined,
    BETTER_AUTH_SECRET: source.BETTER_AUTH_SECRET || undefined,
    BETTER_AUTH_URL: source.BETTER_AUTH_URL || undefined,
    APP_ORIGIN: source.APP_ORIGIN || undefined,
  });
  const names = result.success ? [] : result.error.issues.map((i) => String(i.path[0]));
  if (source.NODE_ENV === "production" && !source.BETTER_AUTH_URL) names.push("BETTER_AUTH_URL");
  return [...new Set(names)];
}

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const missing = missingServerEnv();
  if (missing.length) {
    throw new Error(`Missing or invalid server configuration: ${missing.join(", ")}. See .env.example.`);
  }
  cached = serverEnvSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || undefined,
    APP_ORIGIN: process.env.APP_ORIGIN || undefined,
  });
  return cached;
}

/** Configured public origin for absolute URLs, or null when none is set (local/dev). */
export function getAppOrigin(): string | null {
  try {
    const env = getServerEnv();
    return env.APP_ORIGIN ?? env.BETTER_AUTH_URL ?? null;
  } catch {
    return process.env.APP_ORIGIN || process.env.BETTER_AUTH_URL || null;
  }
}
