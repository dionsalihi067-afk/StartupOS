import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_ATTRIBUTES } from "@/lib/auth/cookies";

describe("SESSION_COOKIE_ATTRIBUTES", () => {
  it("locks HttpOnly, SameSite=Lax, and path for session cookies", () => {
    expect(SESSION_COOKIE_ATTRIBUTES).toEqual({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  });
});
