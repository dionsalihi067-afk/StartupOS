import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth/session";
import type { ResearchSearchProvider } from "@/lib/research/provider";

const state = vi.hoisted(() => ({
  user: null as SessionUser | null,
  db: null as unknown,
  provider: null as ResearchSearchProvider | null,
  providerLookups: 0,
  liveSearches: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/db", () => ({ getDb: () => state.db }));
vi.mock("@/lib/research/web-provider", () => ({
  getResearchProvider: () => {
    state.providerLookups += 1;
    return state.provider;
  },
}));
vi.mock("@/lib/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/search")>()),
  multiSearch: vi.fn(async () => {
    state.liveSearches += 1;
    return { provider: null, queries: [], results: [] };
  }),
}));

import { POST } from "./route";
import { completeGeneration, createGeneratingBusiness, getBusiness } from "@/lib/businesses/repository";
import { planResearch } from "@/lib/research/planner";
import type { BusinessPackage } from "@/lib/types";
import { createTestDb, createUser, makePackage, type TestDb } from "@/test/db";
import { competitorResults, sampleInput, scriptedProvider } from "@/test/research";

let db: TestDb;
let close: () => Promise<void>;
const input = sampleInput();
const plannedQueries = planResearch(input).queries.length;

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
  for (const key of ["OPENAI_API_KEY", "TAVILY_API_KEY", "SERPER_API_KEY", "BRAVE_API_KEY"]) vi.stubEnv(key, "");
  state.user = { id: "alice", name: "alice", email: "alice@example.test", image: null, emailVerified: true };
  state.provider = scriptedProvider({ input, results: competitorResults() });
  state.providerLookups = 0;
  state.liveSearches = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function readyBusinessFor(owner: string): Promise<{ id: string; pkg: BusinessPackage }> {
  const pkg = makePackage({ input });
  const id = await createGeneratingBusiness(db, owner, pkg.input);
  await completeGeneration(db, owner, id, pkg);
  return { id, pkg: (await getBusiness(db, owner, id))!.package! };
}

function post(id: string, body: unknown) {
  const req = new Request(`http://localhost/api/businesses/${id}/regenerate`, { method: "POST", body: JSON.stringify(body) });
  return POST(req, { params: Promise.resolve({ id }) });
}

const providerCalls = () => (state.provider as ReturnType<typeof scriptedProvider>).calls.length;

describe("POST /api/businesses/[id]/regenerate with research", () => {
  it("rejects unauthenticated requests before any research runs", async () => {
    const { id } = await readyBusinessFor("alice");
    state.user = null;
    expect((await post(id, { sections: ["pricing"] })).status).toBe(401);
    expect(state.providerLookups).toBe(0);
  });

  it("never regenerates or researches another user's business", async () => {
    const { id, pkg } = await readyBusinessFor("bob");
    expect((await post(id, { sections: ["pricing"], userId: "bob" })).status).toBe(404);
    expect(state.providerLookups).toBe(0);
    expect((await getBusiness(db, "bob", id))!.package).toEqual(pkg);
  });

  it("runs research once for all selected sections and leaves the rest unchanged", async () => {
    const { id, pkg } = await readyBusinessFor("alice");
    const res = await post(id, { sections: ["competitor", "market", "pricing"] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { business: { package: BusinessPackage }; succeeded: string[]; failed: string[] };
    expect(body.succeeded).toEqual(["competitor", "market", "pricing"]);
    expect(body.failed).toEqual([]);

    expect(state.providerLookups).toBe(1);
    expect(providerCalls()).toBe(plannedQueries);
    expect(state.liveSearches).toBe(0);

    const saved = (await getBusiness(db, "alice", id))!.package!;
    expect(saved.competitors.competitors.map((c) => c.name)).toEqual(["Rio Café", "Nomad Hub", "Tea House Tirana", "Mulliri Vjetër"]);
    expect(saved.pricing.grounding?.evidence).toBe("observed");
    expect(saved.marketResearch.status).toBe("ok");
    for (const key of ["brand", "persona", "website", "marketing", "growth", "launch"] as const) expect(saved[key]).toEqual(pkg[key]);
  });

  it("ignores research, competitors and pricing evidence supplied in the body", async () => {
    const { id } = await readyBusinessFor("alice");
    state.provider = scriptedProvider({ input });
    const res = await post(id, {
      sections: ["competitor", "pricing"],
      research: { status: "complete", snapshot: { sources: [{ url: "https://evil.example" }] } },
      competitors: [{ name: "Injected Co", website: "https://evil.example" }],
      pricingEvidence: { research: "complete", competitors: [{ name: "Injected Co" }] },
    });
    expect(res.status).toBe(200);
    const saved = (await getBusiness(db, "alice", id))!.package!;
    expect(JSON.stringify(saved)).not.toMatch(/evil\.example|Injected Co/);
    expect(saved.competitors.status).toBe("no-results");
    expect(saved.pricing.grounding?.evidence).toBe("unavailable");
  });

  it("does not run research when no selected section uses it", async () => {
    const { id } = await readyBusinessFor("alice");
    const res = await post(id, { sections: ["design"] });
    expect(res.status).toBe(200);
    expect(state.providerLookups).toBe(0);
  });

  it("does not run a paid research run for template-only sections that never read it", async () => {
    const { id } = await readyBusinessFor("alice");
    const res = await post(id, { sections: ["seo", "whatsapp", "launch"] });
    expect(res.status).toBe(200);
    expect(state.providerLookups).toBe(0);
    expect(state.liveSearches).toBe(0);
  });

  it("keeps regenerating when research fails, reporting the failure instead of inventing evidence", async () => {
    const { id, pkg } = await readyBusinessFor("alice");
    state.provider = scriptedProvider({ input, failing: [...planResearch(input).queries.map((q) => q.id)] });
    const res = await post(id, { sections: ["competitor", "pricing"] });
    expect(res.status).toBe(200);
    const saved = (await getBusiness(db, "alice", id))!.package!;
    expect(state.liveSearches).toBe(0);
    expect(saved.competitors).toMatchObject({ status: "error", competitors: [] });
    expect(saved.pricing.grounding?.evidence).toBe("researchFailed");
    expect(saved.brand).toEqual(pkg.brand);
  });

  it("rate limits per session user before researching or regenerating anything", async () => {
    vi.stubEnv("RATE_LIMIT_REGENERATE_PER_HOUR", "1");
    await createUser(db, "carol");
    state.user = { id: "carol", name: "carol", email: "carol@example.test", image: null, emailVerified: true };
    const { id } = await readyBusinessFor("carol");
    expect((await post(id, { sections: ["pricing"] })).status).toBe(200);

    state.providerLookups = 0;
    const callsBefore = providerCalls();
    const before = (await getBusiness(db, "carol", id))!.package!;
    const res = await post(id, { sections: ["pricing"], userId: "bob" });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await res.json()).toMatchObject({ error: "rateLimited" });
    expect(state.providerLookups).toBe(0);
    expect(providerCalls()).toBe(callsBefore);
    expect((await getBusiness(db, "carol", id))!.package).toEqual(before);

    const { id: bobs } = await readyBusinessFor("bob");
    state.user = { id: "bob", name: "bob", email: "bob@example.test", image: null, emailVerified: true };
    expect((await post(bobs, { sections: ["design"] })).status).toBe(200);
  });
});
