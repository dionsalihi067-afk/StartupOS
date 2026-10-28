import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown, viewer: null as string | null }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => state.db }));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () =>
    state.viewer
      ? { id: state.viewer, name: state.viewer, email: `${state.viewer}@example.test`, image: null, emailVerified: true }
      : null,
}));

import { eq } from "drizzle-orm";
import { GET } from "./route";
import { ASSET_PRUNE_GRACE_MS, businessAssetStore, pruneUnreferencedAssets, saveGeneratedAsset } from "@/lib/businesses/assets";
import { createGeneratingBusiness, deleteBusiness } from "@/lib/businesses/repository";
import { business, generatedAsset, publishedWebsite } from "@/lib/db/schema";
import { createTestDb, createUser, makePackage, type TestDb } from "@/test/db";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);

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

beforeEach(() => {
  state.viewer = "alice";
});

const get = (id: string) => GET(new Request(`http://localhost/api/assets/${id}`), { params: Promise.resolve({ id }) });
const idOf = (url: string) => url.split("/").pop()!;
const logo = (userId: string, businessId: string) => saveGeneratedAsset(db, userId, businessId, { kind: "logo", contentType: "image/png", bytes: PNG });

async function publish(businessId: string, site: unknown, status: "live" | "unpublished" = "live") {
  const now = new Date();
  await db
    .insert(publishedWebsite)
    .values({ businessId, publicSlug: `s-${businessId.slice(-8)}`, status, fingerprint: "f", site, publishedAt: now })
    .onConflictDoUpdate({ target: publishedWebsite.businessId, set: { site, status } });
}

async function useAsLogo(businessId: string, url: string) {
  const pkg = makePackage();
  await db
    .update(business)
    .set({ package: { ...pkg, brand: { ...pkg.brand, logo: { ...pkg.brand.logo, generated: true, imageUrl: url } } } })
    .where(eq(business.id, businessId));
}

async function age(url: string) {
  await db.update(generatedAsset).set({ createdAt: new Date(Date.now() - ASSET_PRUNE_GRACE_MS - 60_000) }).where(eq(generatedAsset.id, idOf(url)));
}

describe("generated assets", () => {
  it("stores a logo durably and serves the same bytes with safe headers to the owner", async () => {
    const businessId = await createGeneratingBusiness(db, "alice", makePackage().input);
    const url = await businessAssetStore(db, "alice", businessId)({ kind: "logo", contentType: "image/png", bytes: PNG });
    expect(url).toMatch(/^\/api\/assets\/ast_[0-9a-f]{32}$/);

    const res = await get(idOf(url));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it("hides an unpublished business's images from other users and anonymous visitors", async () => {
    const businessId = await createGeneratingBusiness(db, "alice", makePackage().input);
    const url = await logo("alice", businessId);
    state.viewer = "bob";
    expect((await get(idOf(url))).status).toBe(404);
    state.viewer = null;
    expect((await get(idOf(url))).status).toBe(404);
  });

  it("serves an image publicly only while a live published website uses it", async () => {
    const businessId = await createGeneratingBusiness(db, "alice", makePackage().input);
    const used = await logo("alice", businessId);
    const unused = await logo("alice", businessId);
    await publish(businessId, { siteName: "Lume", logoUrl: used });
    state.viewer = null;

    const res = await get(idOf(used));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    expect((await get(idOf(unused))).status).toBe(404);

    await publish(businessId, { siteName: "Lume", logoUrl: used }, "unpublished");
    expect((await get(idOf(used))).status).toBe(404);
  });

  it("refuses to store images for another user's business", async () => {
    const businessId = await createGeneratingBusiness(db, "alice", makePackage().input);
    await expect(logo("bob", businessId)).rejects.toThrow();
  });

  it("refuses non-PNG, empty or mislabelled content", async () => {
    const businessId = await createGeneratingBusiness(db, "alice", makePackage().input);
    await expect(saveGeneratedAsset(db, "alice", businessId, { kind: "logo", contentType: "image/svg+xml", bytes: PNG })).rejects.toThrow();
    await expect(saveGeneratedAsset(db, "alice", businessId, { kind: "logo", contentType: "image/png", bytes: Buffer.alloc(0) })).rejects.toThrow();
    await expect(saveGeneratedAsset(db, "alice", businessId, { kind: "logo", contentType: "image/png", bytes: Buffer.from("<svg onload=alert(1)>") })).rejects.toThrow();
  });

  it("returns 404 for unknown or malformed ids without touching other tables", async () => {
    expect((await get("ast_00000000000000000000000000000000")).status).toBe(404);
    expect((await get("../../etc/passwd")).status).toBe(404);
    expect((await get("biz_123")).status).toBe(404);
  });

  it("deletes a business's images with the business", async () => {
    const businessId = await createGeneratingBusiness(db, "alice", makePackage().input);
    const url = await saveGeneratedAsset(db, "alice", businessId, { kind: "icon", contentType: "image/png", bytes: PNG });
    expect((await get(idOf(url))).status).toBe(200);
    await deleteBusiness(db, "alice", businessId);
    expect((await get(idOf(url))).status).toBe(404);
  });
});

describe("pruning unreferenced assets", () => {
  it("deletes only old images that no package or published snapshot references", async () => {
    const businessId = await createGeneratingBusiness(db, "alice", makePackage().input);
    const current = await logo("alice", businessId);
    const published = await logo("alice", businessId);
    const replaced = await logo("alice", businessId);
    const fresh = await logo("alice", businessId);
    for (const url of [current, published, replaced]) await age(url);

    await useAsLogo(businessId, current);
    await publish(businessId, { logoUrl: published }, "unpublished");

    expect(await pruneUnreferencedAssets(db, "alice", businessId)).toBe(1);
    expect((await get(idOf(replaced))).status).toBe(404);
    for (const url of [current, published, fresh]) expect((await get(idOf(url))).status).toBe(200);
  });

  it("keeps an image another business's package still references", async () => {
    const original = await createGeneratingBusiness(db, "alice", makePackage().input);
    const copy = await createGeneratingBusiness(db, "alice", makePackage().input);
    const url = await logo("alice", original);
    await age(url);
    await useAsLogo(copy, url);
    expect(await pruneUnreferencedAssets(db, "alice", original)).toBe(0);
  });

  it("never touches another user's images", async () => {
    const bobs = await createGeneratingBusiness(db, "bob", makePackage().input);
    const url = await logo("bob", bobs);
    await age(url);
    expect(await pruneUnreferencedAssets(db, "alice", bobs)).toBe(0);
    state.viewer = "bob";
    expect((await get(idOf(url))).status).toBe(200);
  });
});
