import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth/session";
import type { ResearchSearchProvider } from "@/lib/research/provider";

const state = vi.hoisted(() => ({
  user: null as SessionUser | null,
  db: null as unknown,
  provider: null as ResearchSearchProvider | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/db", () => ({ getDb: () => state.db }));
vi.mock("@/lib/research/web-provider", () => ({ getResearchProvider: () => state.provider }));

import { POST } from "./route";
import { completeGeneration, createGeneratingBusiness } from "@/lib/businesses/repository";
import { RESEARCH_LIMITS } from "@/lib/research/limits";
import { createTestDb, createUser, makePackage, type TestDb } from "@/test/db";
import { fakeProvider, hit } from "@/test/research";

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
  state.provider = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function readyBusinessFor(owner: string) {
  const pkg = makePackage();
  const id = await createGeneratingBusiness(db, owner, pkg.input);
  await completeGeneration(db, owner, id, pkg);
  return id;
}

function post(id: string, body: unknown = {}) {
  const req = new Request(`http://localhost/api/businesses/${id}/research`, { method: "POST", body: JSON.stringify(body) });
  return POST(req, { params: Promise.resolve({ id }) });
}

describe("POST /api/businesses/[id]/research", () => {
  it("rejects unauthenticated requests", async () => {
    state.user = null;
    const res = await post(await readyBusinessFor("alice"));
    expect(res.status).toBe(401);
  });

  it("does not run research on another user's business, whatever the body claims", async () => {
    const provider = fakeProvider(() => [hit("x")]);
    state.provider = provider;
    const bobs = await readyBusinessFor("bob");
    const res = await post(bobs, { userId: "bob" });
    expect(res.status).toBe(404);
    expect(provider.calls).toHaveLength(0);
  });

  it("returns 409 for a business that is still generating", async () => {
    const id = await createGeneratingBusiness(db, "alice", makePackage().input);
    expect((await post(id)).status).toBe(409);
  });

  it("runs fresh research for the owner within server-side limits", async () => {
    const provider = fakeProvider((_q, call) => Array.from({ length: 20 }, (_, i) => hit(`c${call}-${i}`)));
    state.provider = provider;
    const res = await post(await readyBusinessFor("alice"), {
      limits: { maxQueries: 100, maxResultsPerQuery: 100 },
      provider: "https://evil.example/search",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { research: { status: string; snapshot: { sources: unknown[]; provider: string } } };
    expect(body.research.status).toBe("complete");
    expect(body.research.snapshot.provider).toBe("fake");
    expect(provider.calls.length).toBeLessThanOrEqual(RESEARCH_LIMITS.maxQueries);
    expect(provider.calls.every((c) => c.options.maxResults <= RESEARCH_LIMITS.maxResultsPerQuery)).toBe(true);
    expect(body.research.snapshot.sources.length).toBeLessThanOrEqual(RESEARCH_LIMITS.maxSources);
  });

  it("reports missing search configuration explicitly", async () => {
    const res = await post(await readyBusinessFor("alice"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      research: expect.objectContaining({ status: "failed", error: "notConfigured", provider: null }),
    });
  });

  it("rate limits per session user before running research", async () => {
    vi.stubEnv("RATE_LIMIT_RESEARCH_PER_HOUR", "1");
    await createUser(db, "carol");
    state.user = { id: "carol", name: "carol", email: "carol@example.test", image: null, emailVerified: true };
    const provider = fakeProvider(() => [hit("x")]);
    state.provider = provider;
    const id = await readyBusinessFor("carol");
    expect((await post(id)).status).toBe(200);
    const callsBefore = provider.calls.length;

    const res = await post(id, { userId: "alice" });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await res.json()).toMatchObject({ error: "rateLimited" });
    expect(provider.calls).toHaveLength(callsBefore);

    state.user = { id: "bob", name: "bob", email: "bob@example.test", image: null, emailVerified: true };
    expect((await post(await readyBusinessFor("bob"))).status).toBe(200);
  });
});
