import { describe, expect, it } from "vitest";
import { authErrorKey } from "@/lib/auth/client";

describe("authErrorKey", () => {
  it("maps credential, recovery, and rate-limit errors", () => {
    expect(authErrorKey({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe("invalidCredentials");
    expect(authErrorKey({ status: 429 })).toBe("tooManyAttempts");
    expect(authErrorKey({ code: "USER_ALREADY_EXISTS" })).toBe("emailTaken");
    expect(authErrorKey({ code: "INVALID_TOKEN" })).toBe("invalidToken");
    expect(authErrorKey({ code: "RESET_PASSWORD_DISABLED" })).toBe("resetDisabled");
  });

  it("falls back to generic for unknown codes", () => {
    expect(authErrorKey({ code: "EMAIL_NOT_VERIFIED", status: 403 })).toBe("generic");
    expect(authErrorKey(null)).toBe("generic");
  });

  it("reports server and network failures as unavailable, not as credential errors", () => {
    expect(authErrorKey({ status: 500 })).toBe("unavailable");
    expect(authErrorKey({ status: 503 })).toBe("unavailable");
    expect(authErrorKey({ status: 0 })).toBe("unavailable");
    expect(authErrorKey({ code: "INVALID_EMAIL_OR_PASSWORD", status: 401 })).toBe("invalidCredentials");
  });
});
