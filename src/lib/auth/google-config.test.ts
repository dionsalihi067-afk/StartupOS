import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { authCapabilityFlags, googleOAuthCredentials, isGoogleAuthConfigured } from "@/lib/auth/providers";
import { isEmailDeliveryConfigured } from "@/lib/email/delivery";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Google OAuth configuration gates", () => {
  it("requires both client id and secret", () => {
    expect(isGoogleAuthConfigured({} as NodeJS.ProcessEnv)).toBe(false);
    expect(
      isGoogleAuthConfigured({ GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com" } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      googleOAuthCredentials({
        GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET: "secret",
      } as unknown as NodeJS.ProcessEnv),
    ).toEqual({
      clientId: "id.apps.googleusercontent.com",
      clientSecret: "secret",
    });
  });

  it("exposes auth capability flags without secret values", () => {
    const flags = authCapabilityFlags({
      NODE_ENV: "development",
      GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "super-secret-value",
      EMAIL_FROM: "StartupOS <mail@example.com>",
      RESEND_API_KEY: "re_test",
    } as unknown as NodeJS.ProcessEnv);
    expect(flags).toEqual({ passwordRecovery: true, googleSignIn: true });
    expect(JSON.stringify(flags)).not.toContain("super-secret");
    expect(JSON.stringify(flags)).not.toContain("re_test");
  });

  it("treats missing email delivery as recovery unavailable outside test sink", () => {
    expect(
      isEmailDeliveryConfigured({ NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      isEmailDeliveryConfigured({
        NODE_ENV: "development",
        EMAIL_FROM: "a@b.com",
        RESEND_API_KEY: "re_x",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(true);
  });
});

describe("callback URI documentation contract", () => {
  it("documents the Better Auth Google callback under /api/auth/callback/google", () => {
    // Derived from Better Auth basePath default `/api/auth` + provider id `google`.
    const base = "https://app.example.com";
    expect(`${base}/api/auth/callback/google`).toBe("https://app.example.com/api/auth/callback/google");
    expect(`${"http://localhost:3000"}/api/auth/callback/google`).toBe(
      "http://localhost:3000/api/auth/callback/google",
    );
  });
});
