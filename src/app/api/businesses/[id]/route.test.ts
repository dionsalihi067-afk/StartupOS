import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth/session";

const state = vi.hoisted(() => ({ user: null as SessionUser | null, db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/db", () => ({ getDb: () => state.db }));

import { DELETE, GET, PATCH } from "./route";
import { MAX_JSON_BODY_BYTES } from "@/lib/api";
import { completeGeneration, createGeneratingBusiness, getBusiness } from "@/lib/businesses/repository";
import { createTestDb, createUser, makePackage, type TestDb } from "@/test/db";

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  state.db = db;
  await createUser(db, "alice");
  await createUser(db, "bob");
});

afterAll(async () => {
  await close();
});

const as = (id: string): SessionUser => ({
  id,
  name: id,
  email: `${id}@example.test`,
  image: null,
  emailVerified: true,
});

beforeEach(() => {
  state.user = as("alice");
});

async function businessFor(owner: string): Promise<string> {
  const pkg = makePackage();
  const id = await createGeneratingBusiness(db, owner, pkg.input);
  await completeGeneration(db, owner, id, pkg);
  return id;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const url = (id: string) => `http://localhost/api/businesses/${id}`;
const get = (id: string) => GET(new Request(url(id)), ctx(id));
const patch = (id: string, body: unknown) =>
  PATCH(new Request(url(id), { method: "PATCH", body: typeof body === "string" ? body : JSON.stringify(body) }), ctx(id));
const del = (id: string) => DELETE(new Request(url(id), { method: "DELETE" }), ctx(id));

const rename = { op: "updateBrand", edit: { field: "name", value: "Taken over" } };
const brief = { op: "updateWebsiteBrief", brief: { archetype: "shop", goal: "contact", email: "hello@kafeja.al" } };

describe("GET /api/businesses/[id]", () => {
  it("requires a session", async () => {
    const id = await businessFor("alice");
    state.user = null;
    expect((await get(id)).status).toBe(401);
  });

  it("returns the owner's business and the same 404 for a foreign or unknown id", async () => {
    const id = await businessFor("alice");
    const res = await get(id);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { business: { id: string } }).business.id).toBe(id);

    state.user = as("bob");
    const foreign = await get(id);
    const unknown = await get("biz_00000000000000000000000000000000");
    expect(foreign.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await foreign.json()).toEqual(await unknown.json());
  });
});

describe("PATCH /api/businesses/[id]", () => {
  it("never edits another user's business, whatever the body claims", async () => {
    const id = await businessFor("alice");
    const before = await getBusiness(db, "alice", id);
    state.user = as("bob");
    expect((await patch(id, rename)).status).toBe(404);
    expect((await patch(id, { ...rename, userId: "alice" })).status).toBe(404);
    expect((await patch(id, brief)).status).toBe(404);
    expect((await patch(id, { op: "setChecklistItem", index: 0, done: true })).status).toBe(404);
    expect(await getBusiness(db, "alice", id)).toEqual(before);
  });

  it("rejects malformed and unknown operations without writing", async () => {
    const id = await businessFor("alice");
    const before = await getBusiness(db, "alice", id);
    expect((await patch(id, "{not json")).status).toBe(400);
    expect((await patch(id, { op: "deleteEverything" })).status).toBe(400);
    expect((await patch(id, { op: "updateBrand", edit: { field: "color", index: 0, hex: "red" } })).status).toBe(400);
    expect((await patch(id, { op: "updateWebsiteBrief", brief: { archetype: "shop", goal: "contact", actionUrl: "javascript:alert(1)" } })).status).toBe(400);
    expect(await getBusiness(db, "alice", id)).toEqual(before);
  });

  it("refuses oversized bodies without buffering them, with or without a declared length", async () => {
    const id = await businessFor("alice");
    const before = await getBusiness(db, "alice", id);
    const padded = JSON.stringify({ ...rename, padding: "x".repeat(MAX_JSON_BODY_BYTES) });
    const declared = new Request(url(id), { method: "PATCH", body: padded, headers: { "content-length": String(padded.length) } });
    expect((await PATCH(declared, ctx(id))).status).toBe(413);

    let pulled = 0;
    const chunk = new TextEncoder().encode("x".repeat(64 * 1024));
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const init: RequestInit & { duplex: "half" } = { method: "PATCH", body: endless, duplex: "half" };
    const res = await PATCH(new Request(url(id), init), ctx(id));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "tooLarge" });
    expect(pulled).toBeLessThan(MAX_JSON_BODY_BYTES * 2);
    expect(await getBusiness(db, "alice", id)).toEqual(before);
  });

  it("persists the owner's website setup so a fresh read returns it", async () => {
    const id = await businessFor("alice");
    const res = await patch(id, brief);
    expect(res.status).toBe(200);
    const stored = (await getBusiness(db, "alice", id))!;
    expect(stored.package!.input.website).toMatchObject(brief.brief);
    expect(stored.package!.website.spec?.archetype).toBe("shop");
    expect(stored.version).toBeGreaterThan(1);
  });
});

describe("DELETE /api/businesses/[id]", () => {
  it("only deletes the owner's business", async () => {
    const id = await businessFor("alice");
    state.user = null;
    expect((await del(id)).status).toBe(401);
    state.user = as("bob");
    expect((await del(id)).status).toBe(404);
    expect(await getBusiness(db, "alice", id)).not.toBeNull();

    state.user = as("alice");
    expect((await del(id)).status).toBe(204);
    expect(await getBusiness(db, "alice", id)).toBeNull();
    expect((await get(id)).status).toBe(404);
  });
});
