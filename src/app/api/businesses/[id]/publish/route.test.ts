import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth/session";

const state = vi.hoisted(() => ({ user: null as SessionUser | null, db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/db", () => ({ getDb: () => state.db }));

import { GET, POST } from "./route";
import {
  completeGeneration,
  createGeneratingBusiness,
  getBusiness,
  getLivePublishedWebsite,
  saveScopedRegeneration,
  updateBrand,
} from "@/lib/businesses/repository";
import { publicSiteUrl, resolvePublishedPage } from "@/lib/website/publish";
import { getAppOrigin } from "@/lib/env";
import type { BusinessPackage } from "@/lib/types";
import { createTestDb, createUser, makePackage, type TestDb } from "@/test/db";
import { makeWebsiteCore } from "@/test/website";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteRenderer } from "@/components/website/SiteRenderer";

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
  state.user = { id: "alice", name: "alice", email: "alice@example.test", image: null, emailVerified: true };
});

async function businessFor(owner: string, withSpec = true): Promise<{ id: string; pkg: BusinessPackage }> {
  const base = makePackage();
  const pkg = withSpec ? makePackage({ website: { ...base.website, ...makeWebsiteCore("Home") } }) : base;
  const id = await createGeneratingBusiness(db, owner, pkg.input);
  await completeGeneration(db, owner, id, pkg);
  return { id, pkg: (await getBusiness(db, owner, id))!.package! };
}

const stored = async (owner: string, id: string) => (await getBusiness(db, owner, id))!.package!;

function post(id: string, body?: unknown) {
  const init: RequestInit = { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
  return POST(new Request(`http://localhost/api/businesses/${id}/publish`, init), { params: Promise.resolve({ id }) });
}

function resolve(id: string, path?: string) {
  const query = path === undefined ? "" : `?path=${encodeURIComponent(path)}`;
  return GET(new Request(`http://localhost/api/businesses/${id}/publish${query}`), { params: Promise.resolve({ id }) });
}

describe("POST prepare", () => {
  it("prepares the website without making it public", async () => {
    const { id, pkg } = await businessFor("alice");
    const res = await post(id, { op: "prepare" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string; changed: boolean; publication: { preparedAt: string; fingerprint: string; live?: boolean } };
    expect(json.status).toBe("prepared");
    expect(json.changed).toBe(true);
    expect(json.publication.live).toBeUndefined();
    expect(await getLivePublishedWebsite(db, "kafeja")).toEqual({ ok: false, reason: "notFound" });

    const after = await stored("alice", id);
    const { publication, ...website } = after.website;
    expect(publication?.fingerprint).toBe(json.publication.fingerprint);
    expect(website).toEqual(pkg.website);
  });

  it("is idempotent for an unchanged website", async () => {
    const { id } = await businessFor("alice");
    const first = (await (await post(id, {})).json()) as { publication: unknown };
    const afterFirst = await getBusiness(db, "alice", id);
    const second = await post(id, { op: "prepare" });
    expect(second.status).toBe(200);
    expect(((await second.json()) as { changed: boolean }).changed).toBe(false);
    expect(await getBusiness(db, "alice", id)).toEqual(afterFirst);
    void first;
  });

  it("rejects unauthenticated and foreign ownership", async () => {
    const { id, pkg } = await businessFor("alice");
    state.user = null;
    expect((await post(id, { op: "prepare" })).status).toBe(401);
    expect(await stored("alice", id)).toEqual(pkg);
    state.user = { id: "alice", name: "alice", email: "alice@example.test", image: null, emailVerified: true };
    const bob = await businessFor("bob");
    expect((await post(bob.id, { op: "publish" })).status).toBe(404);
    expect((await post(bob.id, { op: "publish", userId: "bob" })).status).toBe(400);
  });

  it("refuses invalid and legacy websites", async () => {
    const { id, pkg } = await businessFor("alice", false);
    expect((await post(id, { op: "publish" })).status).toBe(422);
    expect(await stored("alice", id)).toEqual(pkg);
    expect(await getLivePublishedWebsite(db, "kafeja")).toEqual({ ok: false, reason: "notFound" });
  });
});

describe("publish / unpublish lifecycle", () => {
  it("publishes a real public slug, serves it anonymously, and keeps the slug on republish", async () => {
    const { id } = await businessFor("alice");
    const res = await post(id, { op: "publish" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      status: string;
      publicSlug: string;
      publicPath: string;
      publicUrl: string;
      changed: boolean;
      business: { package: BusinessPackage };
    };
    expect(json.status).toBe("published");
    expect(json.publicPath).toBe(publicSiteUrl(json.publicSlug, "/"));
    expect(json.publicUrl).toBe(publicSiteUrl(json.publicSlug, "/", getAppOrigin()));
    expect(json.business.package.website.publication?.live).toBe(true);

    const live = await getLivePublishedWebsite(db, json.publicSlug);
    expect(live.ok).toBe(true);
    if (!live.ok) return;
    const home = resolvePublishedPage(live.site, "/");
    expect(home.ok).toBe(true);
    if (!home.ok) return;
    const html = renderToStaticMarkup(
      createElement(SiteRenderer, {
        site: live.site,
        page: home.page,
        publicSlug: live.publicSlug,
        labels: { navigation: "Nav", contactPending: "Pending" },
      }),
    );
    expect(html).toContain(live.site.siteName);
    expect(html).toContain(`/s/${json.publicSlug}/contact`);
    expect(html).not.toMatch(/<script|alice@example|"input"|"research"/i);

    const again = (await (await post(id, { op: "publish" })).json()) as { changed: boolean; publicSlug: string };
    expect(again.changed).toBe(false);
    expect(again.publicSlug).toBe(json.publicSlug);

    const contact = resolvePublishedPage(live.site, "/contact");
    expect(contact.ok && contact.page.slug).toBe("/contact");
  });

  it("keeps the previous public snapshot until republish after regeneration", async () => {
    const { id } = await businessFor("alice");
    const first = (await (await post(id, { op: "publish" })).json()) as { publicSlug: string; publication: { publishedFingerprint: string } };
    const before = await getLivePublishedWebsite(db, first.publicSlug);
    expect(before.ok && before.site.pages[0]?.seo.title).toContain("Home");

    const regenerated = makeWebsiteCore("Regenerated home");
    await saveScopedRegeneration(db, "alice", id, [{ section: "website", website: regenerated }], [
      { section: "website", status: "ok", source: "deterministic" },
    ]);
    const draft = await stored("alice", id);
    expect(draft.website.publication?.live).toBe(true);
    expect(((await (await resolve(id)).json()) as { status: string }).status).toBe("outdated");

    const stillLive = await getLivePublishedWebsite(db, first.publicSlug);
    expect(stillLive.ok && stillLive.site.pages[0]?.seo.title).toEqual(before.ok ? before.site.pages[0]?.seo.title : null);
    expect(stillLive.ok && stillLive.fingerprint).toBe(first.publication.publishedFingerprint);

    const republished = (await (await post(id, { op: "publish" })).json()) as { publicSlug: string; changed: boolean };
    expect(republished.publicSlug).toBe(first.publicSlug);
    expect(republished.changed).toBe(true);
    const after = await getLivePublishedWebsite(db, first.publicSlug);
    expect(after.ok && after.site.pages[0]?.seo.title).toContain("Regenerated home");
  });

  it("keeps the published site name until republish after a brand rename, then updates it on the same slug", async () => {
    const { id } = await businessFor("alice");
    const first = (await (await post(id, { op: "publish" })).json()) as { publicSlug: string; publication: { publishedFingerprint: string } };
    const before = await getLivePublishedWebsite(db, first.publicSlug);
    expect(before.ok && before.site.siteName).toBe("Kafeja");

    expect((await updateBrand(db, "alice", id, { field: "name", value: "Drita Coffee" })).ok).toBe(true);
    expect((await stored("alice", id)).website.spec?.siteName).toBe("Drita Coffee");
    expect(((await (await resolve(id)).json()) as { status: string }).status).toBe("outdated");

    const stillLive = await getLivePublishedWebsite(db, first.publicSlug);
    expect(stillLive.ok && stillLive.site.siteName).toBe("Kafeja");
    expect(stillLive.ok && stillLive.fingerprint).toBe(first.publication.publishedFingerprint);

    const republished = (await (await post(id, { op: "publish" })).json()) as { publicSlug: string; changed: boolean };
    expect(republished.changed).toBe(true);
    expect(republished.publicSlug).toBe(first.publicSlug);
    const after = await getLivePublishedWebsite(db, first.publicSlug);
    expect(after.ok && after.site.siteName).toBe("Drita Coffee");
  });

  it("unpublishes so anonymous visitors get not found, then republishes the same slug", async () => {
    const { id } = await businessFor("alice");
    const published = (await (await post(id, { op: "publish" })).json()) as { publicSlug: string };
    const un = await post(id, { op: "unpublish" });
    expect(un.status).toBe(200);
    expect(await getLivePublishedWebsite(db, published.publicSlug)).toEqual({ ok: false, reason: "notFound" });
    const pkg = await stored("alice", id);
    expect(pkg.website.publication?.live).toBe(false);
    expect(pkg.website.publication?.publicSlug).toBe(published.publicSlug);
    expect(pkg.brand).toBeDefined();

    const again = (await (await post(id, { op: "publish" })).json()) as { publicSlug: string };
    expect(again.publicSlug).toBe(published.publicSlug);
    expect((await getLivePublishedWebsite(db, published.publicSlug)).ok).toBe(true);
  });

  it("assigns distinct slugs when two businesses share a name", async () => {
    const a = await businessFor("alice");
    const b = await businessFor("bob");
    state.user = { id: "alice", name: "alice", email: "alice@example.test", image: null, emailVerified: true };
    const slugA = ((await (await post(a.id, { op: "publish" })).json()) as { publicSlug: string }).publicSlug;
    state.user = { id: "bob", name: "bob", email: "bob@example.test", image: null, emailVerified: true };
    const slugB = ((await (await post(b.id, { op: "publish" })).json()) as { publicSlug: string }).publicSlug;
    expect(slugA).not.toBe(slugB);
    expect((await getLivePublishedWebsite(db, slugA)).ok).toBe(true);
    expect((await getLivePublishedWebsite(db, slugB)).ok).toBe(true);
  });

  it("does not let user A unpublish user B", async () => {
    const bob = await businessFor("bob");
    state.user = { id: "bob", name: "bob", email: "bob@example.test", image: null, emailVerified: true };
    const slug = ((await (await post(bob.id, { op: "publish" })).json()) as { publicSlug: string }).publicSlug;
    state.user = { id: "alice", name: "alice", email: "alice@example.test", image: null, emailVerified: true };
    expect((await post(bob.id, { op: "unpublish" })).status).toBe(404);
    expect((await getLivePublishedWebsite(db, slug)).ok).toBe(true);
  });

  it("leaves unrelated package sections unchanged on publish", async () => {
    const { id, pkg } = await businessFor("alice");
    await post(id, { op: "publish" });
    const after = await stored("alice", id);
    expect(after.brand).toEqual(pkg.brand);
    expect(after.pricing).toEqual(pkg.pricing);
    expect(after.marketing).toEqual(pkg.marketing);
    expect(after.input).toEqual(pkg.input);
  });
});

describe("GET owner resolve", () => {
  it("resolves draft pages for the owner and never exposes private fields", async () => {
    const { id, pkg } = await businessFor("alice");
    const home = (await (await resolve(id)).json()) as { page: { slug: string }; status: string; live: boolean; slugs: string[] };
    expect(home.page.slug).toBe("/");
    expect(home.status).toBe("draft");
    expect(home.live).toBe(false);
    expect(home.slugs).toEqual(pkg.website.spec!.pages.map((p) => p.slug));
    const text = await (await resolve(id)).text();
    expect(text).not.toMatch(/"input"|"research"|"competitors"|"userId"|alice@example|10\.000 €/);
  });

  it("returns not found for unknown pages and enforces auth", async () => {
    const { id } = await businessFor("alice");
    expect((await resolve(id, "/missing")).status).toBe(404);
    expect((await resolve(id, "javascript:alert(1)")).status).toBe(404);
    const bob = await businessFor("bob");
    expect((await resolve(bob.id)).status).toBe(404);
    state.user = null;
    expect((await resolve(id)).status).toBe(401);
  });
});

describe("public lookup security", () => {
  it("rejects malformed public slugs and unknown sites", async () => {
    for (const slug of ["", "AB", "../x", "javascript:x", "a b", "en", "api"]) {
      expect(await getLivePublishedWebsite(db, slug)).toEqual({ ok: false, reason: "notFound" });
    }
  });

  it("never returns draft content for a website that was only prepared", async () => {
    const core = makeWebsiteCore("Draft home");
    const unique = makePackage({
      brand: { ...makePackage().brand, name: "Draft Only Cafe" },
      website: { ...makePackage().website, ...core, spec: { ...core.spec, siteName: "Draft Only Cafe" } },
    });
    const id = await createGeneratingBusiness(db, "alice", unique.input);
    await completeGeneration(db, "alice", id, unique);
    await post(id, { op: "prepare" });
    const pkg = await stored("alice", id);
    expect(pkg.website.publication?.live).not.toBe(true);
    expect(await getLivePublishedWebsite(db, "draft-only-cafe")).toEqual({ ok: false, reason: "notFound" });
  });
});
