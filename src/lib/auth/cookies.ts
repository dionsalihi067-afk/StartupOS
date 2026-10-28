/**
 * Session cookie attributes we require from Better Auth.
 * These match Better Auth 1.7 defaults and are locked in `getAuth()` so upgrades
 * cannot silently weaken them. `Secure` / `__Secure-` prefix remain tied to HTTPS
 * base URL / production via Better Auth's own secure-cookie logic.
 */
export const SESSION_COOKIE_ATTRIBUTES = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
} as const;

export type SessionCookieAttributes = typeof SESSION_COOKIE_ATTRIBUTES;
