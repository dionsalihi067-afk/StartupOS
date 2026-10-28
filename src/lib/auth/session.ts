import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { getAuth } from "./index";

/** The only user fields that leave the server. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  /** Present on the Better Auth user row; not used for access control. */
  emailVerified: boolean;
}

/**
 * Resolves the signed-in user from the session cookie, verified against the database.
 * Deduplicated per React request via `cache` so layout + page + loaders share one lookup.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  // Read request headers before anything that can throw, so routes using this are always rendered per request.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const { id, name, email, image, emailVerified } = session.user;
  return { id, name, email, image: image ?? null, emailVerified: Boolean(emailVerified) };
});
