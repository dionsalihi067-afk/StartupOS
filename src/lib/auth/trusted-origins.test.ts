import { describe, expect, it } from "vitest";
import { authTrustedOrigins } from "@/lib/auth/trusted-origins";

describe("authTrustedOrigins", () => {
  it("aliases localhost and 127.0.0.1 (and IPv6 loopback) for the same port", () => {
    expect(authTrustedOrigins("http://localhost:3000").sort()).toEqual(
      ["http://127.0.0.1:3000", "http://[::1]:3000", "http://localhost:3000"].sort(),
    );
  });

  it("does not invent hosts for a public production origin", () => {
    expect(authTrustedOrigins("https://app.example.com")).toEqual(["https://app.example.com"]);
  });

  it("includes APP_ORIGIN when it differs from BETTER_AUTH_URL", () => {
    const origins = authTrustedOrigins("https://app.example.com", "https://www.example.com");
    expect(origins).toContain("https://app.example.com");
    expect(origins).toContain("https://www.example.com");
  });

  it("skips invalid URLs without throwing", () => {
    expect(authTrustedOrigins("not-a-url", "http://localhost:3000")).toContain("http://localhost:3000");
  });

  it("normalizes trailing DNS dots and rejects credentialed or non-http seeds", () => {
    expect(authTrustedOrigins("https://app.example.com.")).toEqual(["https://app.example.com"]);
    expect(authTrustedOrigins("https://user:pass@app.example.com")).toEqual([]);
    expect(authTrustedOrigins("ftp://app.example.com")).toEqual([]);
  });

  it("never treats a suffix lookalike as the trusted host", () => {
    const trusted = authTrustedOrigins("https://app.example.com");
    expect(trusted).not.toContain("https://app.example.com.evil.com");
    expect(trusted).toEqual(["https://app.example.com"]);
  });
});
