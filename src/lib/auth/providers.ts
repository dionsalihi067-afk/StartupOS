import "server-only";
import { isEmailDeliveryConfigured } from "@/lib/email/delivery";

/** True when both Google OAuth server credentials are present (never expose secrets). */
export function isGoogleAuthConfigured(source: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(source.GOOGLE_CLIENT_ID?.trim() && source.GOOGLE_CLIENT_SECRET?.trim());
}

export function googleOAuthCredentials(source: NodeJS.ProcessEnv = process.env): {
  clientId: string;
  clientSecret: string;
} | null {
  const clientId = source.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = source.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/**
 * Public capability flags for `/api/status`. Configuration presence only —
 * not a live probe of Resend or Google.
 */
export function authCapabilityFlags(source: NodeJS.ProcessEnv = process.env): {
  passwordRecovery: boolean;
  googleSignIn: boolean;
} {
  return {
    passwordRecovery: isEmailDeliveryConfigured(source),
    googleSignIn: isGoogleAuthConfigured(source),
  };
}
