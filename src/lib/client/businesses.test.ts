import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessDetail, BusinessSummary } from "@/lib/businesses/types";
import type { BusinessPackage } from "@/lib/types";
import { makePackage } from "@/test/db";
import { clearBusinessCache, getCachedBusiness, loadBusiness, mergeFirstPage, pickActive, updateBrand } from "./businesses";

const ID = "biz_client";
const SAME_TIME = "2026-01-01T00:00:01.000Z";

function detail(version: number, brand: Partial<BusinessPackage["brand"]> = {}, updatedAt = SAME_TIME): BusinessDetail {
  const pkg = makePackage({ id: ID });
  const next = { ...pkg, brand: { ...pkg.brand, ...brand } };
  return {
    id: ID,
    status: "ready",
    name: next.brand.name,
    slogan: next.brand.slogan,
    idea: pkg.input.idea,
    location: pkg.input.location,
    iconUrl: null,
    launchDone: 0,
    launchTotal: pkg.launch.checklist.length,
    errorCode: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
    version,
    package: next,
  };
}

/** A fetch whose responses are released by the test, in any order. */
function controlledFetch() {
  const calls: { url: string; method: string; reply: (status: number, body: unknown) => void }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string, init: RequestInit = {}) =>
        new Promise<Response>((resolve) => {
          calls.push({
            url,
            method: init.method ?? "GET",
            reply: (status, body) => resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })),
          });
        }),
    ),
  );
  return calls;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const cachedBrand = () => getCachedBusiness(ID)?.business?.package?.brand;

beforeEach(async () => {
  clearBusinessCache();
  const calls = controlledFetch();
  const loading = loadBusiness(ID);
  calls[0]!.reply(200, { business: detail(1) });
  await loading;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("business detail cache", () => {
  it("keeps the newest server revision when responses to overlapping edits arrive out of order", async () => {
    const calls = controlledFetch();
    const rename = updateBrand(ID, { field: "name", value: "Drita" });
    const reslogan = updateBrand(ID, { field: "slogan", value: "Fresh daily" });
    expect(cachedBrand()).toMatchObject({ name: "Drita", slogan: "Fresh daily" });

    // Both saves landed in the same millisecond: only the revision tells them apart.
    calls[1]!.reply(200, { business: detail(3, { name: "Drita", slogan: "Fresh daily" }) });
    await reslogan;
    calls[0]!.reply(200, { business: detail(2, { name: "Drita" }) });
    await rename;

    expect(cachedBrand()).toMatchObject({ name: "Drita", slogan: "Fresh daily" });
    expect(getCachedBusiness(ID)?.business?.version).toBe(3);
  });

  it("accepts a newer revision even when its timestamp is older (server clocks differ)", async () => {
    const calls = controlledFetch();
    const rename = updateBrand(ID, { field: "name", value: "Drita" });
    calls[0]!.reply(200, { business: detail(2, { name: "Drita" }, "2026-01-01T00:00:00.500Z") });
    await rename;
    expect(cachedBrand()?.name).toBe("Drita");
    expect(getCachedBusiness(ID)?.business?.version).toBe(2);
  });

  it("does not let a reload started before an edit overwrite the edit's result", async () => {
    const calls = controlledFetch();
    const staleReload = loadBusiness(ID);
    const rename = updateBrand(ID, { field: "name", value: "Drita" });
    expect(calls.map((c) => c.method)).toEqual(["GET", "PATCH"]);

    calls[1]!.reply(200, { business: detail(2, { name: "Drita" }) });
    await rename;
    calls[0]!.reply(200, { business: detail(1) });
    await staleReload;

    expect(cachedBrand()?.name).toBe("Drita");
  });

  it("rolls back a failed edit when nothing else changed", async () => {
    const calls = controlledFetch();
    const rename = updateBrand(ID, { field: "name", value: "Drita" });
    expect(cachedBrand()?.name).toBe("Drita");
    calls[0]!.reply(500, { error: "unavailable" });
    await expect(rename).rejects.toMatchObject({ status: 500 });
    expect(cachedBrand()?.name).toBe("Kafeja");
  });

  it("does not discard a later edit when an earlier one fails, and resyncs from the server", async () => {
    const calls = controlledFetch();
    const rename = updateBrand(ID, { field: "name", value: "Drita" });
    const reslogan = updateBrand(ID, { field: "slogan", value: "Fresh daily" });

    calls[0]!.reply(500, { error: "unavailable" });
    await expect(rename).rejects.toMatchObject({ status: 500 });
    expect(cachedBrand()?.slogan).toBe("Fresh daily");

    await flush();
    const reload = calls.find((c) => c.method === "GET");
    expect(reload).toBeDefined();
    calls[1]!.reply(200, { business: detail(2, { slogan: "Fresh daily" }) });
    await reslogan;
    reload!.reply(200, { business: detail(2, { slogan: "Fresh daily" }) });
    await flush();

    expect(cachedBrand()).toMatchObject({ name: "Kafeja", slogan: "Fresh daily" });
  });
});

function summary(id: string, updatedAt: string, status: BusinessSummary["status"] = "ready"): BusinessSummary {
  const { package: _pkg, ...rest } = detail(1, {}, updatedAt);
  return { ...rest, id, status };
}

describe("business list paging", () => {
  const page1 = [summary("biz_c", "2026-03-03T00:00:00.000Z"), summary("biz_b", "2026-03-02T00:00:00.000Z")];
  const older = [summary("biz_a", "2026-01-01T00:00:00.000Z")];

  it("keeps older loaded pages when the first page is refreshed", () => {
    const current = { businesses: [...page1, ...older], nextCursor: null, extended: true };
    const merged = mergeFirstPage(current, page1, "cursor-after-b");
    expect(merged.businesses.map((b) => b.id)).toEqual(["biz_c", "biz_b", "biz_a"]);
    expect(merged).toMatchObject({ nextCursor: null, extended: true });
  });

  it("drops a loaded business that the refreshed first page shows was deleted", () => {
    const current = { businesses: [...page1, summary("biz_gone", "2026-03-02T12:00:00.000Z"), ...older], nextCursor: null, extended: true };
    const merged = mergeFirstPage(current, page1, "cursor-after-b");
    expect(merged.businesses.map((b) => b.id)).toEqual(["biz_c", "biz_b", "biz_a"]);
  });

  it("replaces everything when the whole list now fits on the first page", () => {
    const current = { businesses: [...page1, ...older], nextCursor: null, extended: true };
    expect(mergeFirstPage(current, page1, null)).toEqual({ businesses: page1, nextCursor: null, extended: false });
  });

  it("does not swap the remembered business for another one while it is outside the loaded pages", () => {
    const remembered = detail(3, {}, "2025-01-01T00:00:00.000Z");
    expect(pickActive(page1, ID, undefined)).toBeUndefined();
    expect(pickActive(page1, ID, { status: "loading", business: null, movedTo: null })).toBeUndefined();
    expect(pickActive(page1, ID, { status: "ready", business: remembered, movedTo: null })?.id).toBe(ID);
    expect(pickActive(page1, ID, { status: "notFound", business: null, movedTo: null })?.id).toBe("biz_c");
    expect(pickActive(page1, null, undefined)?.id).toBe("biz_c");
    expect(pickActive([summary("biz_g", "2026-03-04T00:00:00.000Z", "generating"), ...page1], "biz_g", undefined)?.id).toBe("biz_c");
  });
});
