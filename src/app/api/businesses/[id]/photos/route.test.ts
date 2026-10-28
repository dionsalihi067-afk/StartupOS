import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth/session";

const state = vi.hoisted(() => ({ user: null as SessionUser | null, db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/db", () => ({ getDb: () => state.db }));

import { eq } from "drizzle-orm";
import { POST } from "./route";
import { PATCH } from "../route";
import { GET as getAsset } from "@/app/api/assets/[id]/route";
import { MAX_PHOTO_BYTES } from "@/lib/businesses/assets";
import { completeGeneration, createGeneratingBusiness, getBusiness, publishWebsiteLive } from "@/lib/businesses/repository";
import { generatedAsset } from "@/lib/db/schema";
import { createTestDb, createUser, makePackage, type TestDb } from "@/test/db";

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(32, 2)]);

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
const upload = (id: string, bytes: Buffer, type = "image/jpeg") =>
  POST(new Request(`http://localhost/api/businesses/${id}/photos`, { method: "POST", body: new Uint8Array(bytes), headers: { "content-type": type } }), ctx(id));
const patch = (id: string, body: unknown) => PATCH(new Request(`http://localhost/api/businesses/${id}`, { method: "PATCH", body: JSON.stringify(body) }), ctx(id));
const fetchAsset = (url: string) => {
  const assetId = url.split("/").pop()!;
  return getAsset(new Request(`http://localhost${url}`), { params: Promise.resolve({ id: assetId }) });
};
const brief = (heroImage: string, heroImageAlt = "Our bakery counter") => ({
  op: "updateWebsiteBrief",
  brief: { archetype: "shop", goal: "contact", email: "hello@kafeja.al", heroImage, heroImageAlt },
});

describe("POST /api/businesses/[id]/photos", () => {
  it("requires a session and never reads the body without one", async () => {
    const id = await businessFor("alice");
    state.user = null;
    expect((await upload(id, JPEG)).status).toBe(401);
  });

  it("stores the owner's JPEG or WebP privately and returns its URL", async () => {
    const id = await businessFor("alice");
    const res = await upload(id, JPEG);
    expect(res.status).toBe(201);
    const { url } = (await res.json()) as { url: string };
    expect(url).toMatch(/^\/api\/assets\/ast_[0-9a-f]{32}$/);
    const [row] = await db.select().from(generatedAsset).where(eq(generatedAsset.id, url.split("/").pop()!));
    expect(row).toMatchObject({ userId: "alice", businessId: id, kind: "photo", contentType: "image/jpeg" });

    expect((await fetchAsset(url)).status).toBe(200);
    state.user = null;
    expect((await fetchAsset(url)).status).toBe(404);
    state.user = as("bob");
    expect((await fetchAsset(url)).status).toBe(404);

    state.user = as("alice");
    const webp = await upload(id, WEBP, "image/png");
    expect(webp.status).toBe(201);
    const stored = await db.select({ type: generatedAsset.contentType }).from(generatedAsset).where(eq(generatedAsset.id, ((await webp.json()) as { url: string }).url.split("/").pop()!));
    expect(stored[0]!.type).toBe("image/webp");
  });

  it("reads the type from the bytes and refuses anything that is not an image", async () => {
    const id = await businessFor("alice");
    const svg = await upload(id, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), "image/jpeg");
    expect(svg.status).toBe(415);
    expect(await svg.json()).toEqual({ error: "unsupportedType" });
    expect((await upload(id, Buffer.alloc(0))).status).toBe(400);
  });

  it("refuses photos over the size limit", async () => {
    const id = await businessFor("alice");
    const big = Buffer.concat([JPEG, Buffer.alloc(MAX_PHOTO_BYTES)]);
    expect((await upload(id, big)).status).toBe(413);
  });

  it("does not store photos for another user's business", async () => {
    const id = await businessFor("alice");
    state.user = as("bob");
    expect((await upload(id, JPEG)).status).toBe(404);
    expect(await db.select({ id: generatedAsset.id }).from(generatedAsset).where(eq(generatedAsset.businessId, id))).toEqual([]);
  });
});

describe("hero photo in Website setup", () => {
  it("puts the owner's photo on the homepage and makes it public only while the site is live", async () => {
    const id = await businessFor("alice");
    const { url } = (await (await upload(id, JPEG)).json()) as { url: string };
    expect((await patch(id, brief(url))).status).toBe(200);

    const spec = (await getBusiness(db, "alice", id))!.package!.website.spec!;
    const hero = spec.pages[0]!.sections[0]!;
    expect(hero.type === "hero" && hero.image).toEqual({ src: url, alt: "Our bakery counter" });

    state.user = null;
    expect((await fetchAsset(url)).status).toBe(404);
    expect(await publishWebsiteLive(db, "alice", id)).toMatchObject({ ok: true });
    expect((await fetchAsset(url)).status).toBe(200);
  });

  it("requires a description with the photo", async () => {
    const id = await businessFor("alice");
    const { url } = (await (await upload(id, JPEG)).json()) as { url: string };
    expect((await patch(id, brief(url, ""))).status).toBe(400);
  });

  it("refuses a photo that belongs to another business or user", async () => {
    const mine = await businessFor("alice");
    const other = await businessFor("alice");
    const { url: otherPhoto } = (await (await upload(other, JPEG)).json()) as { url: string };
    state.user = as("bob");
    const bobs = await businessFor("bob");
    const { url: bobPhoto } = (await (await upload(bobs, JPEG)).json()) as { url: string };
    state.user = as("alice");
    const before = await getBusiness(db, "alice", mine);
    expect((await patch(mine, brief(otherPhoto))).status).toBe(400);
    expect((await patch(mine, brief(bobPhoto))).status).toBe(400);
    expect((await patch(mine, brief("/api/assets/ast_00000000000000000000000000000000"))).status).toBe(400);
    expect(await getBusiness(db, "alice", mine)).toEqual(before);
  });

  it("enforces the photo rules in the database too", async () => {
    const id = await businessFor("alice");
    const insert = (kind: "logo" | "photo", contentType: string) =>
      db.insert(generatedAsset).values({ id: `ast_${"a".repeat(31)}${kind === "logo" ? "1" : "2"}`, userId: "alice", businessId: id, kind, contentType, byteSize: 4, bytes: JPEG });
    await expect(insert("logo", "image/jpeg")).rejects.toThrow();
    await expect(insert("photo", "image/gif")).rejects.toThrow();
  });
});
