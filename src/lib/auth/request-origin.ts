import "server-only";
import { authTrustedOrigins } from "@/lib/auth/trusted-origins";

/** Better Auth session cookie names (plaintext and `__Secure-` HTTPS variant). */
export const SESSION_COOKIE_NAMES = ["better-auth.session_token", "__Secure-better-auth.session_token"] as const;

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Canonical https/http origins the app accepts for cookie-authenticated mutations.
 * Built from the same sources Better Auth trusts (base URL, APP_ORIGIN, optional extras).
 * Wildcards are intentionally not supported here — only absolute parsed origins.
 */
export function trustedMutationOrigins(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const extras = (env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return authTrustedOrigins(env.BETTER_AUTH_URL, env.APP_ORIGIN, ...extras);
}

/** Exact origin match after URL parsing — never substring or suffix trust. */
export function isTrustedMutationOrigin(
  candidate: string,
  trusted: readonly string[],
): boolean {
  let origin: string;
  try {
    origin = new URL(candidate).origin;
  } catch {
    return false;
  }
  if (origin === "null") return false;
  return trusted.includes(origin);
}

function hasSessionCookie(req: Request): boolean {
  const cookie = req.headers.get("cookie");
  if (!cookie) return false;
  return SESSION_COOKIE_NAMES.some((name) => {
    const re = new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=`);
    return re.test(cookie);
  });
}

function requestOriginCandidate(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (origin === "null") {
    // Same-origin opaque origins (sandboxed iframe) with Fetch Metadata.
    if (req.headers.get("sec-fetch-site") === "same-origin") {
      try {
        return new URL(req.url).origin;
      } catch {
        return null;
      }
    }
    return null;
  }
  if (origin) return origin;
  const referer = req.headers.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function requestUrlOrigin(req: Request): string | null {
  try {
    return new URL(req.url).origin;
  } catch {
    return null;
  }
}

/**
 * Rejects cross-site state-changing requests that carry a session cookie.
 * Safe methods and cookie-less requests are left alone (auth still enforced separately).
 *
 * A request is allowed when the browser Origin/Referer matches either:
 * - the origin of this request URL (true same-origin — covers Next.js falling
 *   back to another local port when BETTER_AUTH_URL still points at :3000), or
 * - an origin from BETTER_AUTH_URL / APP_ORIGIN / BETTER_AUTH_TRUSTED_ORIGINS.
 *
 * Returns a 403 Response when denied, otherwise null.
 */
export function denyUntrustedMutationOrigin(req: Request): Response | null {
  const method = req.method.toUpperCase();
  if (!UNSAFE_METHODS.has(method)) return null;
  if (!hasSessionCookie(req)) return null;

  const candidate = requestOriginCandidate(req);
  if (!candidate) {
    return Response.json(
      { error: "forbidden" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const requestOrigin = requestUrlOrigin(req);
  if (requestOrigin && isTrustedMutationOrigin(candidate, [requestOrigin])) {
    return null;
  }

  const trusted = trustedMutationOrigins();
  if (!isTrustedMutationOrigin(candidate, trusted)) {
    return Response.json(
      { error: "forbidden" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  return null;
}
