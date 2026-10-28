import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/lib/db";
import { schema } from "@/lib/db/schema";
import { getServerEnv } from "@/lib/env";
import { SESSION_COOKIE_ATTRIBUTES } from "@/lib/auth/cookies";
import { googleOAuthCredentials } from "@/lib/auth/providers";
import { authTrustedOrigins } from "@/lib/auth/trusted-origins";
import { isEmailDeliveryConfigured, sendTransactionalEmail } from "@/lib/email/delivery";
import { logFailure } from "@/lib/api";

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

function extraTrustedOrigins(): string[] {
  return (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function createAuth() {
  const env = getServerEnv();
  const google = googleOAuthCredentials();
  const emailReady = isEmailDeliveryConfigured();

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: authTrustedOrigins(env.BETTER_AUTH_URL, env.APP_ORIGIN, ...extraTrustedOrigins()),
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      // Only wire reset when delivery is configured so missing email never looks like success.
      ...(emailReady
        ? {
            sendResetPassword: async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
              // Fire-and-forget to reduce timing differences; failures are logged, never echoed to clients.
              void sendTransactionalEmail({
                to: user.email,
                subject: "Reset your StartupOS password",
                text: [
                  `Hi${user.name ? ` ${user.name}` : ""},`,
                  "",
                  "We received a request to reset your StartupOS password.",
                  "Open this link to choose a new password (it expires in about one hour):",
                  "",
                  url,
                  "",
                  "If you did not request this, you can ignore this email.",
                ].join("\n"),
                html: `<p>Hi${user.name ? ` ${escapeHtml(user.name)}` : ""},</p>
<p>We received a request to reset your StartupOS password.</p>
<p><a href="${escapeHtml(url)}">Choose a new password</a></p>
<p>This link expires in about one hour. If you did not request this, you can ignore this email.</p>`,
              }).catch((err) => logFailure("email.reset", err));
            },
            revokeSessionsOnPasswordReset: true,
            resetPasswordTokenExpiresIn: 60 * 60,
          }
        : {}),
    },
    socialProviders: google
      ? {
          google: {
            clientId: google.clientId,
            clientSecret: google.clientSecret,
            prompt: "select_account",
          },
        }
      : {},
    account: {
      accountLinking: {
        enabled: true,
        // Only link when the provider asserts a verified email (Google does).
        trustedProviders: ["google"],
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    user: {
      deleteUser: { enabled: true },
    },
    advanced: {
      // Lock HttpOnly + SameSite=Lax + Path. Secure/`__Secure-` still follows Better Auth's
      // HTTPS baseURL / production detection so local http://localhost keeps working.
      defaultCookieAttributes: { ...SESSION_COOKIE_ATTRIBUTES },
    },
    rateLimit: {
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 5 },
        "/reset-password": { window: 60, max: 5 },
        "/change-password": { window: 60, max: 5 },
        "/delete-user": { window: 60, max: 5 },
      },
    },
    plugins: [nextCookies()],
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { startupAuth?: Auth };

// In development, drop a cached instance whenever this module reloads so auth option changes apply.
if (process.env.NODE_ENV !== "production") {
  globalForAuth.startupAuth = undefined;
}

/** Created on first use so a missing configuration fails the request, not module import. */
export function getAuth(): Auth {
  if (!globalForAuth.startupAuth) globalForAuth.startupAuth = createAuth();
  return globalForAuth.startupAuth;
}

/** Drop the cached auth instance (tests that change email/Google env between cases). */
export function resetAuthForTests(): void {
  globalForAuth.startupAuth = undefined;
}
