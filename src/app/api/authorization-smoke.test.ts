/**
 * Phase 11 — focused authn/authz smoke across list/export surfaces.
 * Detail/mutation/publish/asset IDOR coverage lives in existing route tests.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth/session";

const state = vi.hoisted(() => ({ user: null as SessionUser | null, db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/db", () => ({ getDb: () => state.db }));

import { GET as listBusinesses } from "@/app/api/businesses/route";
import { GET as exportBusinesses } from "@/app/api/businesses/export/route";
import { completeGeneration, createGeneratingBusiness, listBusinesses as listOwned } from "@/lib/businesses/repository";
import { createTestDb, createUser, makePackage, type TestDb } from "@/test/db";

let db: TestDb;
let close: () => Promise<void>;

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
  await createUser(db, "bob");
});

afterAll(async () => {
  await close();
});

beforeEach(() => {
  state.user = as("alice");
});

async function ready(owner: string) {
  const pkg = makePackage();
  const id = await createGeneratingBusiness(db, owner, pkg.input);
  await completeGeneration(db, owner, id, pkg);
  return id;
}

describe("list and export authorization", () => {
  it("rejects unauthenticated list and export without leaking businesses", async () => {
    await ready("alice");
    state.user = null;
    expect((await listBusinesses(new Request("http://localhost/api/businesses"))).status).toBe(401);
    expect((await exportBusinesses()).status).toBe(401);
  });

  it("lists and exports only the signed-in user's businesses", async () => {
    const aliceId = await ready("alice");
    const bobId = await ready("bob");

    state.user = as("alice");
    const listed = (await (await listBusinesses(new Request("http://localhost/api/businesses"))).json()) as {
      businesses: { id: string }[];
    };
    const ids = listed.businesses.map((b) => b.id);
    expect(ids).toContain(aliceId);
    expect(ids).not.toContain(bobId);

    const exportRes = await exportBusinesses();
    expect(exportRes.status).toBe(200);
    const exported = JSON.parse(await exportRes.text()) as { id: string }[];
    expect(exported.map((p) => p.id)).toContain(aliceId);
    expect(exported.map((p) => p.id)).not.toContain(bobId);

    // Repository boundary matches the API.
    const repoIds = (await listOwned(db, "alice")).businesses.map((b) => b.id);
    expect(repoIds).toContain(aliceId);
    expect(repoIds).not.toContain(bobId);
  });

  it("ignores a client-supplied userId when listing", async () => {
    const bobId = await ready("bob");
    state.user = as("alice");
    const res = await listBusinesses(new Request("http://localhost/api/businesses?userId=bob"));
    expect(res.status).toBe(200);
    const listed = (await res.json()) as { businesses: { id: string }[] };
    expect(listed.businesses.map((b) => b.id)).not.toContain(bobId);
  });
});
