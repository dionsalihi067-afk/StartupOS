import "server-only";
import { redirect } from "next/navigation";
import type { Locale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/auth/session";
import { logFailure } from "@/lib/api";
import { safeNextPath } from "@/lib/routing";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Shared setup for the login and register pages: resolves a safe `next`
 * destination and sends already signed-in users straight to it.
 */
export async function prepareAuthPage(locale: Locale, searchParams: SearchParams) {
  const params = await searchParams;
  const next = safeNextPath(first(params.next));
  let signedIn = false;
  try {
    signedIn = Boolean(await getCurrentUser());
  } catch (err) {
    logFailure("auth", err);
  }
  if (signedIn) redirect(`/${locale}${next}`);
  return { next, expired: first(params.expired) === "1" };
}
