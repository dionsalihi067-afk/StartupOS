import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  denyUntrustedMutationOrigin,
  isTrustedMutationOrigin,
  trustedMutationOrigins,
} from "@/lib/auth/request-origin";

const PREV = {
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  APP_ORIGIN: process.env.APP_ORIGIN,
  BETTER_AUTH_TRUSTED_ORIGINS: process.env.BETTER_AUTH_TRUSTED_ORIGINS,
};

afterEach(() => {
  for (const [key, value] of Object.entries(PREV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function mutationReq(init: {
  origin?: string | null;
  referer?: string;
  cookie?: boolean;
  method?: string;
  secFetchSite?: string;
  url?: string;
}): Request {
  const headers = new Headers();
  if (init.origin !== undefined && init.origin !== null) headers.set("origin", init.origin);
  if (init.origin === null) headers.set("origin", "null");
  if (init.referer) headers.set("referer", init.referer);
  if (init.cookie) headers.set("cookie", "better-auth.session_token=test-session");
  if (init.secFetchSite) headers.set("sec-fetch-site", init.secFetchSite);
  return new Request(init.url ?? "http://localhost:3000/api/businesses/x", {
    method: init.method ?? "PATCH",
    headers,
  });
}

describe("trustedMutationOrigins / isTrustedMutationOrigin", () => {
  it("accepts only exact parsed origins from env, never substring hosts", () => {
    process.env.BETTER_AUTH_URL = "https://app.example.com";
    delete process.env.APP_ORIGIN;
    delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;
    const trusted = trustedMutationOrigins();
    expect(trusted).toEqual(["https://app.example.com"]);
    expect(isTrustedMutationOrigin("https://app.example.com", trusted)).toBe(true);
    expect(isTrustedMutationOrigin("https://app.example.com.evil.com", trusted)).toBe(false);
    expect(isTrustedMutationOrigin("https://evil.com", trusted)).toBe(false);
    expect(isTrustedMutationOrigin("https://app.example.com:443", trusted)).toBe(true);
    expect(isTrustedMutationOrigin("not-a-url", trusted)).toBe(false);
  });

  it("includes APP_ORIGIN and BETTER_AUTH_TRUSTED_ORIGINS extras", () => {
    process.env.BETTER_AUTH_URL = "https://app.example.com";
    process.env.APP_ORIGIN = "https://www.example.com";
    process.env.BETTER_AUTH_TRUSTED_ORIGINS = "https://preview.example.com, https://staging.example.com";
    const trusted = trustedMutationOrigins();
    expect(trusted).toContain("https://app.example.com");
    expect(trusted).toContain("https://www.example.com");
    expect(trusted).toContain("https://preview.example.com");
    expect(trusted).toContain("https://staging.example.com");
  });
});

describe("denyUntrustedMutationOrigin", () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    delete process.env.APP_ORIGIN;
    delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;
  });

  it("allows same-origin cookie mutations", async () => {
    expect(
      denyUntrustedMutationOrigin(
        mutationReq({ origin: "http://localhost:3000", cookie: true, method: "PATCH" }),
      ),
    ).toBeNull();
  });

  it("allows true same-origin even when BETTER_AUTH_URL names a different local port", () => {
    // Reproduces Next.js falling back to :3001 while BETTER_AUTH_URL stays :3000 —
    // the failure that surfaced as POST /api/generate 403 during business creation.
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    expect(
      denyUntrustedMutationOrigin(
        mutationReq({
          origin: "http://localhost:3001",
          cookie: true,
          method: "POST",
          url: "http://localhost:3001/api/generate",
        }),
      ),
    ).toBeNull();
  });

  it("still rejects cross-origin mutations when only the request URL is local", () => {
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    const res = denyUntrustedMutationOrigin(
      mutationReq({
        origin: "https://evil.example",
        cookie: true,
        method: "POST",
        url: "http://localhost:3001/api/generate",
      }),
    );
    expect(res?.status).toBe(403);
  });

  it("allows trusted APP_ORIGIN mutations", async () => {
    process.env.APP_ORIGIN = "https://www.example.com";
    process.env.BETTER_AUTH_URL = "https://app.example.com";
    expect(
      denyUntrustedMutationOrigin(
        mutationReq({
          origin: "https://www.example.com",
          cookie: true,
          method: "POST",
          url: "https://app.example.com/api/generate",
        }),
      ),
    ).toBeNull();
  });

  it("rejects untrusted Origin when a session cookie is present", async () => {
    const res = denyUntrustedMutationOrigin(
      mutationReq({ origin: "https://evil.example", cookie: true, method: "DELETE" }),
    );
    expect(res?.status).toBe(403);
    await expect(res!.json()).resolves.toEqual({ error: "forbidden" });
  });

  it("rejects Origin: null without same-origin Fetch Metadata", async () => {
    const res = denyUntrustedMutationOrigin(mutationReq({ origin: null, cookie: true }));
    expect(res?.status).toBe(403);
  });

  it("allows Origin: null with sec-fetch-site same-origin", () => {
    expect(
      denyUntrustedMutationOrigin(
        mutationReq({ origin: null, cookie: true, secFetchSite: "same-origin", url: "http://localhost:3000/api/x" }),
      ),
    ).toBeNull();
  });

  it("rejects missing Origin/Referer when a session cookie is present", async () => {
    const res = denyUntrustedMutationOrigin(mutationReq({ cookie: true }));
    expect(res?.status).toBe(403);
  });

  it("accepts Referer origin when Origin is absent", () => {
    expect(
      denyUntrustedMutationOrigin(
        mutationReq({ referer: "http://localhost:3000/dashboard/projects", cookie: true }),
      ),
    ).toBeNull();
  });

  it("does not enforce when no session cookie is present (auth still required separately)", () => {
    expect(denyUntrustedMutationOrigin(mutationReq({ origin: "https://evil.example", cookie: false }))).toBeNull();
  });

  it("does not enforce on safe methods", () => {
    expect(
      denyUntrustedMutationOrigin(mutationReq({ origin: "https://evil.example", cookie: true, method: "GET" })),
    ).toBeNull();
  });

  it("rejects lookalike hosts and the string null origin", async () => {
    const lookalike = denyUntrustedMutationOrigin(
      mutationReq({ origin: "http://localhost:3000.evil.com", cookie: true }),
    );
    expect(lookalike?.status).toBe(403);
    await expect(lookalike!.json()).resolves.toEqual({ error: "forbidden" });
    expect(denyUntrustedMutationOrigin(mutationReq({ origin: "null", cookie: true }))?.status).toBe(403);
  });
});
