"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export type AuthErrorKey =
  | "invalidCredentials"
  | "emailTaken"
  | "invalidEmail"
  | "passwordTooShort"
  | "passwordTooLong"
  | "wrongPassword"
  | "tooManyAttempts"
  | "unavailable"
  | "invalidToken"
  | "resetDisabled"
  | "generic";

/** Maps a Better Auth error to a translation key; provider messages are never shown. */
export function authErrorKey(error: { code?: string; status?: number; message?: string } | null | undefined): AuthErrorKey {
  if (!error) return "generic";
  // Server/network failures (e.g. database unreachable) are not credential
  // problems; say so instead of implying the password was wrong.
  if (error.status === 0 || (typeof error.status === "number" && error.status >= 500)) return "unavailable";
  if (error.status === 429) return "tooManyAttempts";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "invalidCredentials";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "emailTaken";
    case "INVALID_EMAIL":
      return "invalidEmail";
    case "PASSWORD_TOO_SHORT":
      return "passwordTooShort";
    case "PASSWORD_TOO_LONG":
      return "passwordTooLong";
    case "INVALID_PASSWORD":
      return "wrongPassword";
    case "INVALID_TOKEN":
      return "invalidToken";
    case "RESET_PASSWORD_DISABLED":
      return "resetDisabled";
    default:
      return "generic";
  }
}
