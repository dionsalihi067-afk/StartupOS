/**
 * Phase 12 — CSRF / origin enforcement on a real state-changing route boundary.
 * Session identity remains mocked; the Cookie header triggers origin checks.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth/session";

const state = vi.hoisted(() => ({ user: null as SessionUser | null, db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/db", () => ({ getDb: () => state.db }));

import { DELETE, PATCH } from "@/app/api/businesses/[id]/route";
import { completeGeneration, createGeneratingBusiness, getBusiness } from "@/lib/businesses/repository";
import { createTestDb, createUser, makePackage, type TestDb } from "@/test/db";

let db: TestDb;
let close: () => Promise<void>;

const PREV = {
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  APP_ORIGIN: process.env.APP_ORIGIN,
  BETTER_AUTH_TRUSTED_ORIGINS: process.env.BETTER_AUTH_TRUSTED_ORIGINS,
};

const as = (id: string): SessionUser => ({
  id,
  name: id,
  email: `${id}@example.test`,
  image: null,
  emailVerified: true,
});

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  state.db = db;
  await createUser(db, "alice");
});

afterAll(async () => {
  await close();
});

beforeEach(() => {
  state.user = as("alice");
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  delete process.env.APP_ORIGIN;
  delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;
});

afterEach(() => {
  for (const [key, value] of Object.entries(PREV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function ready() {
  const pkg = makePackage();
  const id = await createGeneratingBusiness(db, "alice", pkg.input);
  await completeGeneration(db, "alice", id, pkg);
  return id;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function patchReq(id: string, origin: string | undefined, withCookie: boolean) {
  const headers = new Headers({ "content-type": "application/json" });
  if (origin) headers.set("origin", origin);
  if (withCookie) headers.set("cookie", "better-auth.session_token=test");
  return new Request(`http://localhost:3000/api/businesses/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ op: "updateBrand", edit: { field: "name", value: "CSRF Probe" } }),
  });
}

describe("CSRF origin checks on PATCH/DELETE /api/businesses/[id]", () => {
  it("allows same-origin cookie-authenticated PATCH", async () => {
    const id = await ready();
    const res = await PATCH(patchReq(id, "http://localhost:3000", true), ctx(id));
    expect(res.status).toBe(200);
    const detail = await getBusiness(db, "alice", id);
    expect(detail?.package?.brand.name).toBe("CSRF Probe");
  });

  it("rejects untrusted-origin cookie-authenticated PATCH without writing", async () => {
    const id = await ready();
    const before = await getBusiness(db, "alice", id);
    const res = await PATCH(patchReq(id, "https://evil.example", true), ctx(id));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "forbidden" });
    expect(await getBusiness(db, "alice", id)).toEqual(before);
  });

  it("rejects cookie-authenticated DELETE from an untrusted origin", async () => {
    const id = await ready();
    const headers = new Headers({
      origin: "https://evil.example",
      cookie: "better-auth.session_token=test",
    });
    const res = await DELETE(new Request(`http://localhost:3000/api/businesses/${id}`, { method: "DELETE", headers }), ctx(id));
    expect(res.status).toBe(403);
    expect(await getBusiness(db, "alice", id)).not.toBeNull();
  });

  it("still requires authentication when Origin is trusted but there is no session", async () => {
    const id = await ready();
    state.user = null;
    const res = await PATCH(patchReq(id, "http://localhost:3000", true), ctx(id));
    expect(res.status).toBe(401);
  });
});
