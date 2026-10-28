import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { eq, sql } from "drizzle-orm";
import { business, user } from "@/lib/db/schema";
import { createTestDb, createUser, makePackage, type TestDb } from "@/test/db";
import { makeWebsiteCore } from "@/test/website";
import {
  completeGeneration,
  createGeneratingBusiness,
  decodeListCursor,
  deleteBusiness,
  exportBusinesses,
  failGeneration,
  GENERATION_ROUTE_MAX_MS,
  getBusiness,
  getLivePublishedWebsite,
  importLegacyProject,
  listBusinesses,
  recoverStaleGenerations,
  STALE_GENERATION_MS,
  touchGeneratingBusiness,
  saveScopedRegeneration,
  setChecklistItem,
  updateBrand,
  updateBusinessContext,
  publishWebsiteLive,
  saveWebsiteBrief,
  saveWebsitePublication,
} from "./repository";
import { discoverySchema, toBusinessInput, type Discovery } from "@/lib/discovery";
import type { SectionOutcome, SectionPatch } from "@/lib/regenerate-core";
import { publicationStatus } from "@/lib/website/publish";
import { websiteBriefSchema } from "@/lib/website/brief";
import { applyWebsiteBrief } from "@/lib/website/setup";

let db: TestDb;
let close: () => Promise<void>;

const input = makePackage().input;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await createUser(db, "alice");
  await createUser(db, "bob");
});

afterAll(async () => {
  await close();
});

/** Every business of `owner`, following list cursors page by page. */
async function allBusinesses(owner: string, limit?: number) {
  const out: Awaited<ReturnType<typeof listBusinesses>>["businesses"] = [];
  let cursor: string | null = null;
  do {
    const page: Awaited<ReturnType<typeof listBusinesses>> = await listBusinesses(db, owner, { cursor, limit });
    out.push(...page.businesses);
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

async function readyBusinessFor(owner: string) {
  const id = await createGeneratingBusiness(db, owner, input);
  await completeGeneration(db, owner, id, makePackage({ id: "ignored" }));
  return id;
}

describe("ownership isolation", () => {
  it("never returns another user's business", async () => {
    const bobs = await readyBusinessFor("bob");
    expect(await getBusiness(db, "alice", bobs)).toBeNull();
    expect((await getBusiness(db, "bob", bobs))?.package?.id).toBe(bobs);
    expect((await allBusinesses("alice")).some((b) => b.id === bobs)).toBe(false);
  });

  it("does not let one user update another user's business", async () => {
    const bobs = await readyBusinessFor("bob");
    const result = await setChecklistItem(db, "alice", bobs, 0, true);
    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect((await getBusiness(db, "bob", bobs))?.launchDone).toBe(0);
  });

  it("does not let one user delete another user's business", async () => {
    const bobs = await readyBusinessFor("bob");
    expect(await deleteBusiness(db, "alice", bobs)).toBe(false);
    expect(await getBusiness(db, "bob", bobs)).not.toBeNull();
    expect(await deleteBusiness(db, "bob", bobs)).toBe(true);
    expect(await getBusiness(db, "bob", bobs)).toBeNull();
  });

  it("does not let one user complete or fail another user's generation", async () => {
    const bobs = await createGeneratingBusiness(db, "bob", input);
    expect(await completeGeneration(db, "alice", bobs, makePackage())).toBeNull();
    await failGeneration(db, "alice", bobs, "generationFailed");
    expect((await getBusiness(db, "bob", bobs))?.status).toBe("generating");
  });

  it("exports only the requesting user's businesses", async () => {
    const alices = await readyBusinessFor("alice");
    const exported = await collect(exportBusinesses(db, "alice"));
    expect(exported.map((p) => p.id)).toContain(alices);
    const bobIds = (await allBusinesses("bob")).map((b) => b.id);
    expect(exported.some((p) => bobIds.includes(p.id))).toBe(false);
  });
});

describe("bounded listing and export", () => {
  it("pages through every business exactly once, newest first, also when timestamps tie", async () => {
    await createUser(db, "paula");
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) ids.push(await readyBusinessFor("paula"));
    await db.update(business).set({ updatedAt: new Date("2026-10-01T10:00:00.000Z") }).where(sql`${business.id} in (${sql.join(ids.slice(0, 4).map((id) => sql`${id}`), sql`, `)})`);

    const first = await listBusinesses(db, "paula", { limit: 3 });
    expect(first.businesses).toHaveLength(3);
    expect(first.nextCursor).not.toBeNull();
    const all = await allBusinesses("paula", 3);
    expect(all.map((b) => b.id).sort()).toEqual([...ids].sort());
    expect(new Set(all.map((b) => b.id)).size).toBe(7);
    const times = all.map((b) => Date.parse(b.updatedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect((await listBusinesses(db, "paula", { limit: 500 })).businesses.length).toBeLessThanOrEqual(50);
  });

  it("rejects tampered cursors and never leaks another user's rows through one", async () => {
    expect(decodeListCursor("not-a-cursor")).toBeNull();
    expect(decodeListCursor(Buffer.from("2026-10-01T10:00:00Z|biz_x' or 1=1", "utf8").toString("base64url"))).toBeNull();
    const page = await listBusinesses(db, "paula", { limit: 2 });
    const foreign = await listBusinesses(db, "bob", { cursor: page.nextCursor });
    expect(foreign.businesses.every((b) => !page.businesses.some((p) => p.id === b.id))).toBe(true);
  });

  it("exports in batches without dropping or repeating businesses", async () => {
    await createUser(db, "xena");
    const ids: string[] = [];
    for (let i = 0; i < 23; i++) ids.push(await readyBusinessFor("xena"));
    const exported = await collect(exportBusinesses(db, "xena"));
    expect(exported.map((p) => p.id).sort()).toEqual([...ids].sort());
  });
});

describe("generation lifecycle", () => {
  it("moves from generating to ready with the business id stamped on the package", async () => {
    const id = await createGeneratingBusiness(db, "alice", input);
    expect((await getBusiness(db, "alice", id))?.status).toBe("generating");
    const stored = await completeGeneration(db, "alice", id, makePackage({ id: "from-engine" }));
    expect(stored?.id).toBe(id);
    const detail = await getBusiness(db, "alice", id);
    expect(detail).toMatchObject({ status: "ready", name: "Kafeja", launchTotal: 2, launchDone: 0 });
  });

  it("refuses to persist a malformed package and marks the business failed", async () => {
    const id = await createGeneratingBusiness(db, "alice", input);
    const broken = { ...makePackage(), brand: { name: "" } } as unknown as ReturnType<typeof makePackage>;
    expect(await completeGeneration(db, "alice", id, broken)).toBeNull();
    expect(await getBusiness(db, "alice", id)).toMatchObject({ status: "failed", errorCode: "invalidData", package: null });
  });

  it("does not report success when the generating row is gone", async () => {
    const id = await createGeneratingBusiness(db, "alice", input);
    await deleteBusiness(db, "alice", id);
    expect(await completeGeneration(db, "alice", id, makePackage())).toBeNull();
    expect(await getBusiness(db, "alice", id)).toBeNull();
  });

  it("reports a generation that never finished as interrupted", async () => {
    const id = await createGeneratingBusiness(db, "alice", input);
    await db.execute(sql`update business set updated_at = now() - interval '1 hour' where id = ${id}`);
    expect(await getBusiness(db, "alice", id)).toMatchObject({ status: "failed", errorCode: "interrupted" });
    const [row] = await db.select().from(business).where(eq(business.id, id));
    expect(row).toMatchObject({ status: "failed", errorCode: "interrupted" });
  });

  it("recovers only stale generations, repeatably, and never revives them from a late worker", async () => {
    const stale = await createGeneratingBusiness(db, "bob", input);
    const fresh = await createGeneratingBusiness(db, "bob", input);
    const ready = await readyBusinessFor("bob");
    await db.execute(sql`update business set updated_at = now() - interval '1 hour' where id in (${stale}, ${ready})`);

    expect(await recoverStaleGenerations(db, "bob")).toBe(1);
    expect(await recoverStaleGenerations(db, "bob")).toBe(0);
    expect(await getBusiness(db, "bob", stale)).toMatchObject({ status: "failed", errorCode: "interrupted" });
    expect((await getBusiness(db, "bob", fresh))?.status).toBe("generating");
    expect((await getBusiness(db, "bob", ready))?.status).toBe("ready");

    expect(await completeGeneration(db, "bob", stale, makePackage())).toBeNull();
    expect(await getBusiness(db, "bob", stale)).toMatchObject({ status: "failed", errorCode: "interrupted", package: null });
  });

  it("does not recover generations still within the route limit plus grace window", async () => {
    expect(STALE_GENERATION_MS).toBeGreaterThan(GENERATION_ROUTE_MAX_MS);

    const active = await createGeneratingBusiness(db, "bob", input);
    // Just under the stale threshold — still protected as potentially active.
    const almostStaleMs = STALE_GENERATION_MS - 60_000;
    await db.execute(sql`update business set updated_at = now() - (${almostStaleMs} * interval '1 millisecond') where id = ${active}`);

    expect(await recoverStaleGenerations(db, "bob")).toBe(0);
    expect((await getBusiness(db, "bob", active))?.status).toBe("generating");
  });

  it("protects an active generation from stale recovery after a heartbeat", async () => {
    const active = await createGeneratingBusiness(db, "bob", input);
    await db.execute(sql`update business set updated_at = now() - interval '1 hour' where id = ${active}`);
    expect(await touchGeneratingBusiness(db, "bob", active)).toBe(true);
    expect(await recoverStaleGenerations(db, "bob")).toBe(0);
    expect((await getBusiness(db, "bob", active))?.status).toBe("generating");
  });

  it("recovers generations older than the route limit plus grace", async () => {
    const abandoned = await createGeneratingBusiness(db, "bob", input);
    const pastStaleMs = STALE_GENERATION_MS + 60_000;
    await db.execute(sql`update business set updated_at = now() - (${pastStaleMs} * interval '1 millisecond') where id = ${abandoned}`);

    expect(await recoverStaleGenerations(db, "bob")).toBe(1);
    expect(await getBusiness(db, "bob", abandoned)).toMatchObject({ status: "failed", errorCode: "interrupted" });
  });

  it("does not let another user's reads recover this user's generations", async () => {
    const id = await createGeneratingBusiness(db, "bob", input);
    await db.execute(sql`update business set updated_at = now() - interval '1 hour' where id = ${id}`);
    expect(await recoverStaleGenerations(db, "alice")).toBe(0);
    const [row] = await db.select().from(business).where(eq(business.id, id));
    expect(row?.status).toBe("generating");
  });

  it("never lets a late failure overwrite a settled generation", async () => {
    const id = await readyBusinessFor("alice");
    expect(await failGeneration(db, "alice", id, "generationFailed")).toBe(false);
    expect((await getBusiness(db, "alice", id))?.status).toBe("ready");

    const failed = await createGeneratingBusiness(db, "alice", input);
    expect(await failGeneration(db, "alice", failed, "generationFailed")).toBe(true);
    expect(await completeGeneration(db, "alice", failed, makePackage())).toBeNull();
    expect(await getBusiness(db, "alice", failed)).toMatchObject({ status: "failed", errorCode: "generationFailed" });
  });

  it("gives every write a new revision, independent of the application server clock", async () => {
    const id = await createGeneratingBusiness(db, "alice", input);
    const created = (await getBusiness(db, "alice", id))!.version;
    await completeGeneration(db, "alice", id, makePackage());
    const completed = (await getBusiness(db, "alice", id))!.version;
    expect(completed).toBeGreaterThan(created);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
    try {
      const first = await setChecklistItem(db, "alice", id, 0, true);
      const second = await setChecklistItem(db, "alice", id, 1, true);
      if (!first.ok || !second.ok) throw new Error("edits failed");
      // The frozen clock gives both writes the same timestamp; only the revision orders them.
      expect(second.summary.updatedAt).toBe(first.summary.updatedAt);
      expect(first.summary.version).toBe(completed + 1);
      expect(second.summary.version).toBe(completed + 2);
    } finally {
      vi.useRealTimers();
    }

    const results = await Promise.all([setChecklistItem(db, "alice", id, 0, false), setChecklistItem(db, "alice", id, 1, false)]);
    const versions = results.map((r) => (r.ok ? r.summary.version : 0)).sort();
    expect(versions).toEqual([completed + 3, completed + 4]);

    const stale = await createGeneratingBusiness(db, "alice", input);
    const before = (await getBusiness(db, "alice", stale))!.version;
    await failGeneration(db, "alice", stale, "generationFailed");
    expect((await getBusiness(db, "alice", stale))!.version).toBe(before + 1);
  });

  it("does not let a duplicate completion overwrite the stored package", async () => {
    const id = await createGeneratingBusiness(db, "alice", input);
    expect(await completeGeneration(db, "alice", id, makePackage())).not.toBeNull();
    const renamed = makePackage({ brand: { ...makePackage().brand, name: "Overwrite" } });
    expect(await completeGeneration(db, "alice", id, renamed)).toBeNull();
    expect((await getBusiness(db, "alice", id))?.name).toBe("Kafeja");
  });

  it("treats corrupted stored JSON as unusable instead of trusting it", async () => {
    const id = await readyBusinessFor("alice");
    await db.execute(sql`update business set package = '{"id":"x"}'::jsonb where id = ${id}`);
    expect(await getBusiness(db, "alice", id)).toMatchObject({ status: "failed", errorCode: "invalidData", package: null });
  });
});

describe("checklist updates", () => {
  it("updates one item and keeps summary columns in sync", async () => {
    const id = await readyBusinessFor("alice");
    const result = await setChecklistItem(db, "alice", id, 1, true);
    expect(result.ok && result.summary.launchDone).toBe(1);
    expect((await getBusiness(db, "alice", id))?.package?.launch.checklist[1]?.done).toBe(true);
  });

  it("rejects out-of-range indexes", async () => {
    const id = await readyBusinessFor("alice");
    expect(await setChecklistItem(db, "alice", id, 99, true)).toEqual({ ok: false, reason: "invalidIndex" });
  });

  it("applies concurrent edits from two tabs without losing either", async () => {
    const id = await readyBusinessFor("alice");
    await Promise.all([setChecklistItem(db, "alice", id, 0, true), setChecklistItem(db, "alice", id, 1, true)]);
    const checklist = (await getBusiness(db, "alice", id))?.package?.launch.checklist ?? [];
    expect(checklist.every((c) => c.done)).toBe(true);
  });
});

describe("brand edits", () => {
  it("changes only the edited field and syncs the summary name", async () => {
    const id = await readyBusinessFor("alice");
    const before = (await getBusiness(db, "alice", id))?.package;
    const result = await updateBrand(db, "alice", id, { field: "name", value: "  Drita  " });
    expect(result.ok && result.summary.name).toBe("Drita");
    const after = (await getBusiness(db, "alice", id))?.package;
    expect(after?.brand.name).toBe("Drita");
    expect(after?.brand.slogan).toBe(before?.brand.slogan);
    expect(after?.brand.palette).toEqual(before?.brand.palette);
    expect(after?.website).toEqual(before?.website);
  });

  it("updates a single palette colour", async () => {
    const id = await readyBusinessFor("alice");
    const before = (await getBusiness(db, "alice", id))?.package?.brand.palette ?? [];
    const result = await updateBrand(db, "alice", id, { field: "color", index: 0, hex: "#1a2b3c" });
    expect(result.ok).toBe(true);
    const palette = (await getBusiness(db, "alice", id))?.package?.brand.palette ?? [];
    expect(palette[0]?.hex).toBe("#1A2B3C");
    expect(palette.slice(1)).toEqual(before.slice(1));
  });

  it("rejects empty values and unknown colours, and other users' businesses", async () => {
    const id = await readyBusinessFor("alice");
    expect(await updateBrand(db, "alice", id, { field: "slogan", value: "   " })).toEqual({ ok: false, reason: "invalidValue" });
    expect(await updateBrand(db, "alice", id, { field: "color", index: 99, hex: "#000000" })).toEqual({ ok: false, reason: "invalidIndex" });
    expect(await updateBrand(db, "bob", id, { field: "name", value: "Taken" })).toEqual({ ok: false, reason: "notFound" });
  });

  async function websiteBusiness(siteName?: string) {
    const base = makePackage();
    const core = makeWebsiteCore("Home");
    const spec = siteName ? { ...core.spec, siteName } : core.spec;
    const website = { ...base.website, ...core, spec, footerColumns: [{ title: spec.siteName, links: spec.navigation }] };
    const id = await createGeneratingBusiness(db, "alice", input);
    await completeGeneration(db, "alice", id, makePackage({ website }));
    return { id, before: (await getBusiness(db, "alice", id))!.package! };
  }

  it("renames the draft website with the brand without touching the rest of the site", async () => {
    const { id, before } = await websiteBusiness();
    expect(before.website.spec?.siteName).toBe("Kafeja");
    expect((await updateBrand(db, "alice", id, { field: "name", value: "  Drita   Coffee " })).ok).toBe(true);

    const after = (await getBusiness(db, "alice", id))!.package!;
    expect(after.website.spec?.siteName).toBe("Drita Coffee");
    expect(after.website.footerColumns[0]?.title).toBe("Drita Coffee");
    const { siteName: _a, ...restAfter } = after.website.spec!;
    const { siteName: _b, ...restBefore } = before.website.spec!;
    void _a;
    void _b;
    expect(restAfter).toEqual(restBefore);
    expect(after.website.pages).toEqual(before.website.pages);
    expect(after.website.navItems).toEqual(before.website.navItems);
  });

  it("keeps a customised website name when the brand is renamed", async () => {
    const { id, before } = await websiteBusiness("Kafeja Rooftop Bar");
    expect((await updateBrand(db, "alice", id, { field: "name", value: "Drita" })).ok).toBe(true);
    const after = (await getBusiness(db, "alice", id))!.package!;
    expect(after.brand.name).toBe("Drita");
    expect(after.website).toEqual(before.website);
  });

  it("does not rename the website when the brand edit is rejected", async () => {
    const { id, before } = await websiteBusiness();
    expect(await updateBrand(db, "alice", id, { field: "name", value: "   " })).toEqual({ ok: false, reason: "invalidValue" });
    expect((await getBusiness(db, "alice", id))!.package!.website).toEqual(before.website);
  });
});

function sampleDiscovery(overrides: Partial<{ [K in keyof Discovery]: Partial<Discovery[K]> }> = {}): Discovery {
  return discoverySchema.parse({
    business: {
      name: "Drita",
      idea: "Specialty coffee shop",
      stage: "idea",
      type: "physical",
      category: "food",
      location: "Tirana",
      ...overrides.business,
    },
    customer: { ideal: "Remote workers", type: "b2c", ...overrides.customer },
    offer: { status: "planned", ...overrides.offer },
    model: { revenue: ["oneTime"], ...overrides.model },
    market: { ...overrides.market },
    brand: { style: "Modern / Minimal", tone: "calm", language: "sq", ...overrides.brand },
    goals: { priority: "launch", ...overrides.goals },
  });
}

describe("business context updates", () => {
  it("updates source input and package.input without touching generated output", async () => {
    const id = await readyBusinessFor("alice");
    const before = (await getBusiness(db, "alice", id))!;
    const next = toBusinessInput(sampleDiscovery({ customer: { ideal: "Freelancers", type: "b2c" } }));

    const result = await updateBusinessContext(db, "alice", id, next);
    expect(result.ok).toBe(true);

    const after = (await getBusiness(db, "alice", id))!;
    expect(after.idea).toBe(next.idea);
    expect(after.package?.input).toEqual(next);
    expect(after.package?.brand).toEqual(before.package?.brand);
    expect(after.package?.website).toEqual(before.package?.website);
    expect(after.package?.marketing).toEqual(before.package?.marketing);
    expect(after.package?.pricing).toEqual(before.package?.pricing);
    expect(after.package?.growth).toEqual(before.package?.growth);
    expect(after.package?.launch).toEqual(before.package?.launch);
    expect(after.name).toBe(before.name);
  });

  it("does not let one user update another user's business context", async () => {
    const id = await readyBusinessFor("alice");
    const next = toBusinessInput(sampleDiscovery());
    expect(await updateBusinessContext(db, "bob", id, next)).toEqual({ ok: false, reason: "notFound" });
    expect((await getBusiness(db, "alice", id))?.package?.input.audience).toBe("Remote workers");
  });

  it("rejects context updates while generation is incomplete", async () => {
    const id = await createGeneratingBusiness(db, "alice", input);
    const next = toBusinessInput(sampleDiscovery());
    expect(await updateBusinessContext(db, "alice", id, next)).toEqual({ ok: false, reason: "notReady" });
  });

  it("accepts a first discovery payload on a legacy business that had none", async () => {
    const id = await readyBusinessFor("alice");
    expect((await getBusiness(db, "alice", id))?.package?.input.discovery).toBeUndefined();
    const next = toBusinessInput(sampleDiscovery());
    const result = await updateBusinessContext(db, "alice", id, next);
    expect(result.ok && result.package.input.discovery?.goals.priority).toBe("launch");
  });
});

describe("website setup", () => {
  const brief = websiteBriefSchema.parse({
    archetype: "restaurant",
    goal: "book",
    phone: "+355 69 123 4567",
    address: "Rruga e Kavajës 10, Tirana",
    hours: [{ days: "Mon–Sun", time: "08:00–22:00" }],
    items: [
      { name: "Espresso", description: "Double shot", price: "150 ALL" },
      { name: "Pastries", description: "", price: "" },
    ],
  });

  it("stores the brief and rebuilds only the website and its SEO, leaving the live site alone", async () => {
    const id = await readyBusinessFor("alice");
    const first = websiteBriefSchema.parse({ archetype: "general", goal: "contact", email: "hello@kafeja.al" });
    expect(await saveWebsiteBrief(db, "alice", id, (current) => applyWebsiteBrief(current, first))).toMatchObject({ ok: true });
    expect(await publishWebsiteLive(db, "alice", id)).toMatchObject({ ok: true });
    const before = (await getBusiness(db, "alice", id))!;
    const live = await getLivePublishedWebsite(db, before.package!.website.publication!.publicSlug);

    const result = await saveWebsiteBrief(db, "alice", id, (current) => applyWebsiteBrief(current, brief));
    expect(result).toMatchObject({ ok: true });

    const after = (await getBusiness(db, "alice", id))!;
    const [row] = await db.select({ input: business.input }).from(business).where(eq(business.id, id));
    expect(row!.input.website).toEqual(brief);
    expect(after.package!.input.website).toEqual(brief);
    expect(after.version).toBe(before.version + 1);
    const spec = after.package!.website.spec!;
    expect(spec.archetype).toBe("restaurant");
    expect(spec.primaryCta.label).toBe("Book now");
    expect(JSON.stringify(spec)).toContain("tel:+355691234567");
    expect(JSON.stringify(spec)).toContain("150 ALL");
    for (const key of ["brand", "marketing", "pricing", "growth", "launch", "competitors", "strategy"] as const) {
      expect(after.package![key], key).toEqual(before.package![key]);
    }
    expect(publicationStatus(after.package!.website)).toBe("outdated");
    expect(await getLivePublishedWebsite(db, before.package!.website.publication!.publicSlug)).toEqual(live);
  });

  it("keeps saved setup answers when the business context is edited", async () => {
    const id = await readyBusinessFor("alice");
    await saveWebsiteBrief(db, "alice", id, (current) => applyWebsiteBrief(current, brief));
    const next = toBusinessInput(sampleDiscovery({ customer: { ideal: "Students", type: "b2c" } }));
    const result = await updateBusinessContext(db, "alice", id, next);
    expect(result.ok && result.package.input.website).toEqual(brief);
    expect(result.ok && result.package.input.audience).toBe("Students");
  });

  it("does not let another user change the setup", async () => {
    const id = await readyBusinessFor("alice");
    expect(await saveWebsiteBrief(db, "bob", id, (current) => applyWebsiteBrief(current, brief))).toEqual({ ok: false, reason: "notFound" });
    expect((await getBusiness(db, "alice", id))!.package!.input.website).toBeUndefined();
  });

  it("assigns distinct slugs when a same-named business already took the base slug", async () => {
    // PGlite runs all transactions over one connection, so true multi-connection
    // concurrency cannot be exercised here; sequential collision + the unique
    // slug index + the advisory allocation lock cover what this harness can prove.
    const a = await readyBusinessFor("alice");
    const b = await readyBusinessFor("alice");
    const setup = websiteBriefSchema.parse({ archetype: "general", goal: "contact", email: "hello@kafeja.al" });
    await saveWebsiteBrief(db, "alice", a, (current) => applyWebsiteBrief(current, setup));
    await saveWebsiteBrief(db, "alice", b, (current) => applyWebsiteBrief(current, setup));
    const ra = await publishWebsiteLive(db, "alice", a);
    const rb = await publishWebsiteLive(db, "alice", b);
    if (!ra.ok || !rb.ok) throw new Error(`publish failed: ${JSON.stringify([ra, rb])}`);
    expect(ra.publicSlug).not.toBe(rb.publicSlug);
    expect((await getLivePublishedWebsite(db, ra.publicSlug)).ok).toBe(true);
    expect((await getLivePublishedWebsite(db, rb.publicSlug)).ok).toBe(true);
  });

  it("refuses to publish a website with placeholder text", async () => {
    const id = await readyBusinessFor("alice");
    const placeholder = { ...brief, items: [{ name: "TODO add menu", description: "", price: "" }] };
    await saveWebsiteBrief(db, "alice", id, (current) => applyWebsiteBrief(current, placeholder));
    expect(await publishWebsiteLive(db, "alice", id)).toEqual({ ok: false, reason: "needsFixes" });
    expect(await saveWebsitePublication(db, "alice", id)).toEqual({ ok: false, reason: "needsFixes" });
    expect((await getBusiness(db, "alice", id))!.package!.website.publication).toBeUndefined();
  });
});

describe("scoped regeneration persistence", () => {
  it("merges only selected section patches and preserves the rest", async () => {
    const id = await readyBusinessFor("alice");
    const before = (await getBusiness(db, "alice", id))!.package!;
    const patches: SectionPatch[] = [
      {
        section: "website",
        website: makeWebsiteCore("Scoped Home"),
      },
      {
        section: "marketing",
        marketing: {
          strategy: { ...before.marketing.strategy, positioning: "Scoped positioning" },
          instagram: [],
          facebookAds: [],
        },
      },
    ];
    const outcomes: SectionOutcome[] = [
      { section: "website", status: "ok", source: "deterministic" },
      { section: "marketing", status: "ok", source: "deterministic" },
    ];

    const result = await saveScopedRegeneration(db, "alice", id, patches, outcomes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.package.website.pages[0]?.title).toBe("Scoped Home");
    expect(result.package.website.seo).toEqual(before.website.seo);
    expect(result.package.marketing.strategy.positioning).toBe("Scoped positioning");
    expect(result.package.marketing.email).toEqual(before.marketing.email);
    expect(result.package.brand).toEqual(before.brand);
    expect(result.package.pricing).toEqual(before.pricing);
    expect(result.package.persona).toEqual(before.persona);
    expect(result.package.launch).toEqual(before.launch);
    expect(result.package.input).toEqual(before.input);
    expect(result.succeeded).toEqual(["website", "marketing"]);
    expect(result.failed).toEqual([]);
  });

  it("keeps previous output when a selected section failed and only successful patches are saved", async () => {
    const id = await readyBusinessFor("alice");
    const before = (await getBusiness(db, "alice", id))!.package!;
    const patches: SectionPatch[] = [
      {
        section: "pricing",
        pricing: { ...before.pricing, model: "Only pricing changed" },
      },
    ];
    const outcomes: SectionOutcome[] = [
      { section: "pricing", status: "ok", source: "deterministic" },
      { section: "marketing", status: "error", message: "failed" },
    ];

    const result = await saveScopedRegeneration(db, "alice", id, patches, outcomes);
    expect(result.ok && result.package.pricing.model).toBe("Only pricing changed");
    expect(result.ok && result.package.marketing).toEqual(before.marketing);
    expect(result.ok && result.failed).toEqual(["marketing"]);
  });

  it("does not let one user regenerate another user's business", async () => {
    const id = await readyBusinessFor("alice");
    const patches: SectionPatch[] = [
      { section: "launch", launch: { ...makePackage().launch, summary: "hacked" } },
    ];
    const outcomes: SectionOutcome[] = [{ section: "launch", status: "ok", source: "deterministic" }];
    expect(await saveScopedRegeneration(db, "bob", id, patches, outcomes)).toEqual({
      ok: false,
      reason: "notFound",
    });
    expect((await getBusiness(db, "alice", id))?.package?.launch.summary).toBe("");
  });

  it("leaves the package unchanged when every selected section failed", async () => {
    const id = await readyBusinessFor("alice");
    const before = (await getBusiness(db, "alice", id))!.package!;
    const outcomes: SectionOutcome[] = [{ section: "website", status: "error", message: "boom" }];
    const result = await saveScopedRegeneration(db, "alice", id, [], outcomes);
    expect(result.ok && result.package).toEqual(before);
    expect(result.ok && result.failed).toEqual(["website"]);
  });

  it("preserves business context when saving regenerated sections", async () => {
    const id = await readyBusinessFor("alice");
    const nextInput = toBusinessInput(sampleDiscovery({ customer: { ideal: "Students", type: "b2c" } }));
    await updateBusinessContext(db, "alice", id, nextInput);

    const patches: SectionPatch[] = [
      { section: "persona", persona: { ...makePackage().persona, name: "Student Sam" } },
    ];
    const outcomes: SectionOutcome[] = [{ section: "persona", status: "ok", source: "deterministic" }];
    const result = await saveScopedRegeneration(db, "alice", id, patches, outcomes);
    expect(result.ok && result.package.input).toEqual(nextInput);
    expect(result.ok && result.package.persona.name).toBe("Student Sam");
  });
});

describe("legacy localStorage import", () => {
  it("imports a valid project, preserving content and creation date", async () => {
    const legacy = makePackage({ id: "biz_local_abc" });
    const result = await importLegacyProject(db, "alice", legacy);
    expect(result.status).toBe("imported");
    const detail = await getBusiness(db, "alice", result.businessId!);
    expect(detail?.package?.brand.name).toBe("Kafeja");
    expect(detail?.createdAt).toBe("2026-01-02T03:04:05.000Z");
  });

  it("is idempotent: importing the same project twice creates one business", async () => {
    const legacy = makePackage({ id: "biz_local_twice" });
    const first = await importLegacyProject(db, "alice", legacy);
    const second = await importLegacyProject(db, "alice", legacy);
    expect(second).toEqual({ legacyId: "biz_local_twice", status: "duplicate", businessId: first.businessId });
    const rows = await db.select().from(business).where(eq(business.legacyId, "biz_local_twice"));
    expect(rows).toHaveLength(1);
  });

  it("lets two accounts on the same device each import the same local project", async () => {
    const legacy = makePackage({ id: "biz_shared_device" });
    const a = await importLegacyProject(db, "alice", legacy);
    const b = await importLegacyProject(db, "bob", legacy);
    expect(a.status).toBe("imported");
    expect(b.status).toBe("imported");
    expect(a.businessId).not.toBe(b.businessId);
  });

  it("rejects malformed projects without writing anything", async () => {
    const before = (await allBusinesses("alice")).length;
    expect((await importLegacyProject(db, "alice", { id: "broken", brand: {} })).status).toBe("invalid");
    expect((await importLegacyProject(db, "alice", "not an object")).status).toBe("invalid");
    expect((await allBusinesses("alice")).length).toBe(before);
  });

  it("strips imported publication state so live public access requires an explicit publish", async () => {
    const base = makePackage({ id: "biz_local_live" });
    const legacy = {
      ...base,
      website: {
        ...base.website,
        ...makeWebsiteCore("Home"),
        publication: {
          preparedAt: "2026-01-02T03:04:05.000Z",
          fingerprint: "139ad4c8e93d3b",
          publicSlug: "stolen-slug",
          publishedAt: "2026-01-02T03:04:05.000Z",
          publishedFingerprint: "139ad4c8e93d3b",
          live: true,
        },
      },
    };
    const result = await importLegacyProject(db, "alice", legacy);
    expect(result.status).toBe("imported");
    const detail = await getBusiness(db, "alice", result.businessId!);
    expect(detail?.package?.website.publication).toBeUndefined();
    expect(await getLivePublishedWebsite(db, "stolen-slug")).toEqual({ ok: false, reason: "notFound" });
    expect(publicationStatus(detail!.package!.website)).toBe("draft");
  });
});

describe("database constraints", () => {
  it("enforces unique emails", async () => {
    await expect(db.insert(user).values({ id: "dup", name: "x", email: "alice@example.test" })).rejects.toThrow();
  });

  it("requires an existing owner", async () => {
    await expect(
      db.insert(business).values({ id: "orphan", userId: "nobody", status: "generating", input }),
    ).rejects.toThrow();
  });

  it("does not allow a ready business without a package", async () => {
    await expect(db.insert(business).values({ id: "empty", userId: "alice", status: "ready", input })).rejects.toThrow();
  });

  it("removes a user's businesses when the account is deleted", async () => {
    await createUser(db, "carol");
    await readyBusinessFor("carol");
    await db.delete(user).where(eq(user.id, "carol"));
    expect(await db.select().from(business).where(eq(business.userId, "carol"))).toHaveLength(0);
  });
});
