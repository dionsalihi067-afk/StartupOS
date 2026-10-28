"use client";

import type { Locale } from "@/i18n/config";
import { authClient } from "@/lib/auth/client";
import { clearBusinessCache } from "@/lib/client/businesses";

/** Ends the session and leaves the app with a full page load, so no account data stays in memory. */
export async function signOut(locale: Locale) {
  try {
    await authClient.signOut();
  } finally {
    clearBusinessCache();
    window.location.assign(`/${locale}`);
  }
}

export function initials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? `${parts[0]![0]}${parts[parts.length - 1]![0]}` : (parts[0] ?? email).slice(0, 1);
  return letters.toUpperCase();
}
