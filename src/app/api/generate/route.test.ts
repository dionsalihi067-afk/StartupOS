import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SessionUser } from "@/lib/auth/session";
import type { ResearchSearchProvider } from "@/lib/research/provider";

const state = vi.hoisted(() => ({
  user: null as SessionUser | null,
  db: null as unknown,
  provider: null as ResearchSearchProvider | null,
  providerLookups: 0,
  liveSearches: 0,
  failOrchestrate: false,
  /** When true, orchestrate yields a valid complete then throws (late failure). */
  throwAfterComplete: false,
  beforeComplete: null as (() => Promise<void>) | null,
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
vi.mock("@/lib/orchestrator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orchestrator")>();
  return {
    ...actual,
    orchestrate: (...args: Parameters<typeof actual.orchestrate>) => {
      if (state.failOrchestrate) {
        return (async function* () {
          yield { type: "agent-start", agent: "brand", label: "Brand Agent", progress: 5 } as const;
          throw new Error("upstream rejected key sk-test-secret");
        })();
      }
      if (!state.throwAfterComplete) return actual.orchestrate(...args);
      return (async function* () {
        for await (const event of actual.orchestrate(...args)) {
          yield event;
          if (event.type === "complete") throw new Error("late worker fault after assemble");
        }
      })();
    },
  };
});
vi.mock("@/lib/businesses/repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/businesses/repository")>();
  return {
    ...actual,
    completeGeneration: async (...args: Parameters<typeof actual.completeGeneration>) => {
      if (state.beforeComplete) await state.beforeComplete();
      return actual.completeGeneration(...args);
    },
  };
});

import { POST } from "./route";
import { deleteBusiness, getBusiness, listBusinesses } from "@/lib/businesses/repository";
import { requestQuota } from "@/lib/db/schema";
import { parseBusinessPackage } from "@/lib/package-schema";
import { planResearch } from "@/lib/research/planner";
import type { BusinessPackage } from "@/lib/types";
import { createTestDb, createUser, type TestDb } from "@/test/db";
import { competitorResults, sampleInput, scriptedProvider } from "@/test/research";

let db: TestDb;
let close: () => Promise<void>;
const input = sampleInput();
const plannedQueries = planResearch(input).queries.length;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  state.db = db;
  for (const id of ["alice", "carol", "dave", "erin", "frank", "gina", "hank", "ivy", "jude"]) await createUser(db, id);
});

afterAll(async () => {
  await close();
});

beforeEach(() => {
  for (const key of ["OPENAI_API_KEY", "TAVILY_API_KEY", "SERPER_API_KEY", "BRAVE_API_KEY"]) vi.stubEnv(key, "");
  state.user = { id: "alice", name: "alice", email: "alice@example.test", image: null, emailVerified: true };
  state.provider = null;
  state.providerLookups = 0;
  state.liveSearches = 0;
  state.failOrchestrate = false;
  state.throwAfterComplete = false;
  state.beforeComplete = null;
});

const signIn = (id: string) => {
  state.user = { id, name: id, email: `${id}@example.test`, image: null, emailVerified: true };
};

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Posts a generation request and reads the event stream to the end. */
async function generate(
  body: unknown,
): Promise<{ status: number; headers: Headers; text: string; events: { type: string; businessId?: string }[] }> {
  const res = await POST(new NextRequest("http://localhost/api/generate", { method: "POST", body: JSON.stringify(body) }));
  if (!res.body) return { status: res.status, headers: res.headers, text: "", events: [] };
  const text = await res.text();
  const events = text
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice(6)) as { type: string; businessId?: string });
  return { status: res.status, headers: res.headers, text, events };
}

async function storedPackage(events: { type: string; businessId?: string }[]): Promise<BusinessPackage> {
  const businessId = events.find((e) => e.type === "created")?.businessId;
  expect(businessId).toBeDefined();
  expect(events.at(-1)?.type).toBe("complete");
  const detail = await getBusiness(db, "alice", businessId!);
  expect(detail?.status).toBe("ready");
  return detail!.package!;
}

describe("POST /api/generate with research", () => {
  it("rejects unauthenticated requests before any research runs", async () => {
    state.user = null;
    state.provider = scriptedProvider({ input, results: competitorResults() });
    const res = await generate(input);
    expect(res.status).toBe(401);
    expect(state.providerLookups).toBe(0);
  });

  it("runs research exactly once and grounds competitors and pricing in it", async () => {
    const provider = scriptedProvider({ input, results: competitorResults() });
    state.provider = provider;
    const pkg = await storedPackage((await generate(input)).events);

    expect(state.providerLookups).toBe(1);
    expect(provider.calls).toHaveLength(plannedQueries);
    expect(new Set(provider.calls.map((c) => c.query)).size).toBe(plannedQueries);
    expect(state.liveSearches).toBe(0);

    expect(pkg.competitors.status).toBe("ok");
    expect(pkg.competitors.competitors.map((c) => c.name)).toEqual(["Rio Café", "Nomad Hub", "Tea House Tirana", "Mulliri Vjetër"]);
    expect(JSON.stringify(pkg.competitors)).not.toMatch(/guide\.example\.org|beans-wholesale|cars\.al|instagram/);

    expect(pkg.pricing.grounding?.evidence).toBe("observed");
    expect(pkg.pricing.grounding?.observations.map((o) => o.price)).toEqual(["150 ALL", "€8/day"]);
    expect(pkg.pricing.tiers.map((t) => t.price)).toEqual(["90 ALL", "150 ALL", "270 ALL"]);

    expect(pkg.marketResearch.status).toBe("ok");
    const retrieved = new Set(["https://example.com/demand-0", "https://example.com/demand-1", "https://example.com/trends-0", "https://example.com/trends-1"]);
    expect(pkg.marketResearch.sources.every((s) => retrieved.has(s.url))).toBe(true);
  });

  it("ignores research, competitors, pricing and user ids supplied in the body", async () => {
    const provider = scriptedProvider({ input });
    state.provider = provider;
    const injected = {
      ...input,
      userId: "bob",
      research: { status: "complete", snapshot: { sources: [{ url: "https://evil.example" }] } },
      competitors: [{ name: "Injected Co", website: "https://evil.example" }],
      pricingEvidence: { research: "complete", competitors: [{ name: "Injected Co", points: [{ original: "€1" }] }] },
    };
    const pkg = await storedPackage((await generate(injected)).events);
    expect(JSON.stringify(pkg)).not.toMatch(/evil\.example|Injected Co/);
    expect(pkg.pricing.grounding?.evidence).toBe("unavailable");
    expect(provider.calls).toHaveLength(plannedQueries);
  });

  it("completes generation when every research query fails, without inventing evidence", async () => {
    state.provider = scriptedProvider({ input, failing: [...planResearch(input).queries.map((q) => q.id)] });
    const pkg = await storedPackage((await generate(input)).events);
    expect(state.liveSearches).toBe(0);
    expect(pkg.competitors).toMatchObject({ status: "error", competitors: [], sources: [] });
    expect(pkg.marketResearch).toMatchObject({ status: "error", sources: [] });
    expect(pkg.pricing.grounding?.evidence).toBe("researchFailed");
    expect(pkg.pricing.tiers.every((t) => t.price === "To be validated")).toBe(true);
  });

  it("completes generation when no search provider is configured", async () => {
    const pkg = await storedPackage((await generate(input)).events);
    expect(state.providerLookups).toBe(1);
    expect(state.liveSearches).toBe(0);
    expect(pkg.competitors.status).toBe("search-not-configured");
    expect(pkg.marketResearch.status).toBe("search-not-configured");
    expect(pkg.pricing.grounding?.evidence).toBe("researchFailed");
  });

  it("completes generation when the provider throws unexpectedly", async () => {
    state.provider = {
      name: "broken",
      search: () => {
        throw new TypeError("provider bug");
      },
    };
    const pkg = await storedPackage((await generate(input)).events);
    expect(pkg.competitors.competitors).toEqual([]);
    expect(pkg.pricing.grounding?.evidence).toBe("researchFailed");
  });

  it("uses partial research without presenting it as complete", async () => {
    state.provider = scriptedProvider({ input, results: competitorResults(), failing: ["trends", "pricing"] });
    const pkg = await storedPackage((await generate(input)).events);
    expect(pkg.competitors.status).toBe("ok");
    expect(pkg.marketResearch.summary).toContain("Research was partial");
    expect(pkg.pricing.grounding?.limitations).toContain("Research was partial, so some competitor prices may be missing.");
  });
});

describe("POST /api/generate rate limiting", () => {
  it("rejects requests over the per-user limit before creating a business or researching", async () => {
    vi.stubEnv("RATE_LIMIT_GENERATE_PER_HOUR", "1");
    signIn("carol");
    expect((await generate(input)).events.at(-1)?.type).toBe("complete");
    state.providerLookups = 0;

    const limited = await generate(input);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(JSON.parse(limited.text)).toEqual({ error: "rateLimited", retryAfter: Number(limited.headers.get("Retry-After")) });
    expect(state.providerLookups).toBe(0);
    expect((await listBusinesses(db, "carol")).businesses).toHaveLength(1);
  });

  it("takes identity only from the session, so body user ids cannot borrow another quota", async () => {
    vi.stubEnv("RATE_LIMIT_GENERATE_PER_HOUR", "1");
    signIn("dave");
    expect((await generate(input)).status).toBe(200);
    expect((await generate({ ...input, userId: "erin" })).status).toBe(429);
    expect((await listBusinesses(db, "erin")).businesses).toHaveLength(0);

    signIn("erin");
    expect((await generate(input)).events.at(-1)?.type).toBe("complete");
  });

  it("fails closed without exposing details when the limiter storage is unavailable", async () => {
    signIn("frank");
    state.db = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === "insert") {
          return (table: unknown) => {
            if (table === requestQuota) throw new Error("connect ECONNREFUSED postgres://user:secret@db");
            return target.insert(table as never);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await generate(input);
      expect(res.status).toBe(503);
      expect(JSON.parse(res.text)).toEqual({ error: "unavailable" });
      expect(state.providerLookups).toBe(0);
    } finally {
      state.db = db;
      errors.mockRestore();
    }
    expect((await listBusinesses(db, "frank")).businesses).toHaveLength(0);
  });
});

describe("POST /api/generate lifecycle", () => {
  it("marks the business failed with a safe error when generation throws", async () => {
    signIn("gina");
    state.failOrchestrate = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await generate(input);
    errors.mockRestore();

    const businessId = res.events.find((e) => e.type === "created")?.businessId;
    expect(res.events.at(-1)).toEqual({ type: "error", businessId });
    expect(res.text).not.toContain("sk-test-secret");
    expect(await getBusiness(db, "gina", businessId!)).toMatchObject({ status: "failed", errorCode: "generationFailed", package: null });
  });

  it("marks the business failed when saving the generated package fails", async () => {
    signIn("gina");
    state.beforeComplete = async () => {
      throw new Error("write failed: connection reset");
    };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await generate(input);
    errors.mockRestore();

    const businessId = res.events.find((e) => e.type === "created")?.businessId;
    expect(res.events.some((e) => e.type === "complete")).toBe(false);
    expect(res.events.at(-1)).toEqual({ type: "error", businessId });
    expect(res.text).not.toContain("connection reset");
    expect(await getBusiness(db, "gina", businessId!)).toMatchObject({ status: "failed", errorCode: "generationFailed" });
  });

  it("never reports success when the business was deleted before the package was saved", async () => {
    signIn("hank");
    let businessId: string | undefined;
    state.beforeComplete = async () => {
      businessId = (await listBusinesses(db, "hank")).businesses[0]?.id;
      await deleteBusiness(db, "hank", businessId!);
    };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await generate(input);
    errors.mockRestore();

    expect(res.events.some((e) => e.type === "complete")).toBe(false);
    expect(res.events.at(-1)).toEqual({ type: "error", businessId });
    expect(await getBusiness(db, "hank", businessId!)).toBeNull();
    expect((await listBusinesses(db, "hank")).businesses).toHaveLength(0);
  });

  it("keeps ready + complete when a late throw happens after successful persistence", async () => {
    signIn("hank");
    state.throwAfterComplete = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await generate(input);
    errors.mockRestore();

    const businessId = res.events.find((e) => e.type === "created")?.businessId;
    expect(businessId).toBeDefined();
    expect(res.events.some((e) => e.type === "complete")).toBe(true);
    expect(res.events.some((e) => e.type === "error")).toBe(false);
    const detail = await getBusiness(db, "hank", businessId!);
    expect(detail).toMatchObject({ status: "ready" });
    expect(detail?.package?.meta.quality?.outcome).toMatch(/^(success|provisional|degraded)$/);
    expect(await deleteBusiness(db, "hank", businessId!)).toBe(true);
  });

  it("streams created → agent progress → complete and closes without a trailing error", async () => {
    signIn("alice");
    const res = await generate(input);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/event-stream/);
    expect(res.events[0]?.type).toBe("created");
    expect(res.events[0]?.businessId).toMatch(/^biz_/);
    expect(res.events.some((e) => e.type === "agent-start")).toBe(true);
    expect(res.events.some((e) => e.type === "agent-complete")).toBe(true);
    expect(res.events.at(-1)?.type).toBe("complete");
    expect(res.events.filter((e) => e.type === "complete")).toHaveLength(1);
    expect(res.events.some((e) => e.type === "error")).toBe(false);

    const complete = res.events.find((e) => e.type === "complete") as { type: string; result?: BusinessPackage };
    expect(complete.result?.id).toBe(res.events[0]?.businessId);
    expect(complete.result?.meta.quality?.outcome).toMatch(/^(success|provisional|degraded)$/);
  });
});

/**
 * Phase 8 — client SSE disconnect while server generation continues.
 * Not a real browser: Vitest has no Playwright/Cypress. This exercises the same
 * boundary (cancel the response body reader after SSE is active) against the real
 * route + PGlite persistence + getBusiness/listBusinesses recovery path.
 */
describe("POST /api/generate disconnect recovery", () => {
  async function readUntilProgress(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let businessId: string | undefined;
    let sawProgress = false;
    const events: { type: string; businessId?: string }[] = [];

    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        if (!chunk.startsWith("data: ")) continue;
        const event = JSON.parse(chunk.slice(6)) as { type: string; businessId?: string };
        events.push(event);
        if (event.type === "created") businessId = event.businessId;
        if (event.type === "agent-start" || event.type === "agent-complete") sawProgress = true;
      }
      if (businessId && sawProgress) return { reader, businessId, events };
    }
    await reader.cancel().catch(() => undefined);
    throw new Error(`SSE did not become active in time (businessId=${businessId}, progress=${sawProgress})`);
  }

  async function waitForTerminal(userId: string, businessId: string, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const detail = await getBusiness(db, userId, businessId);
      if (detail && (detail.status === "ready" || detail.status === "failed")) return detail;
      await new Promise((r) => setTimeout(r, 40));
    }
    throw new Error(`timed out waiting for terminal state of ${businessId}`);
  }

  it("keeps generating after the client cancels the SSE reader, then recovers ready via getBusiness", async () => {
    signIn("ivy");
    const beforeCount = (await listBusinesses(db, "ivy")).businesses.length;

    let releasePersist!: () => void;
    const persistGate = new Promise<void>((resolve) => {
      releasePersist = resolve;
    });
    state.beforeComplete = async () => {
      await persistGate;
    };

    const res = await POST(new NextRequest("http://localhost/api/generate", { method: "POST", body: JSON.stringify(input) }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/event-stream/);
    expect(res.body).not.toBeNull();

    const { reader, businessId, events } = await readUntilProgress(res.body!);
    expect(businessId).toMatch(/^biz_/);
    expect(events[0]?.type).toBe("created");
    expect(events.some((e) => e.type === "agent-start" || e.type === "agent-complete")).toBe(true);

    // Interrupt only the client consumer — do not fail/delete the row or stop the server work.
    await reader.cancel();
    expect((await getBusiness(db, "ivy", businessId))?.status).toBe("generating");

    releasePersist();
    const detail = await waitForTerminal("ivy", businessId);
    expect(detail.status).toBe("ready");
    expect(detail.package).not.toBeNull();
    expect(detail.package!.id).toBe(businessId);

    const parsed = parseBusinessPackage(detail.package);
    expect(parsed).not.toBeNull();
    expect(parsed!.brand.name.length).toBeGreaterThan(0);
    expect(parsed!.input.idea).toBe(input.idea);
    expect(parsed!.meta.quality?.outcome).toMatch(/^(success|provisional|degraded)$/);

    const listed = (await listBusinesses(db, "ivy")).businesses.filter((b) => b.id === businessId);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.status).toBe("ready");
    expect((await listBusinesses(db, "ivy")).businesses.length).toBe(beforeCount + 1);

    expect(await deleteBusiness(db, "ivy", businessId)).toBe(true);
  });

  it("does not report ready after disconnect when generation genuinely fails", async () => {
    signIn("jude");
    state.failOrchestrate = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(new NextRequest("http://localhost/api/generate", { method: "POST", body: JSON.stringify(input) }));
    expect(res.body).not.toBeNull();
    const { reader, businessId } = await readUntilProgress(res.body!);
    await reader.cancel();
    errors.mockRestore();

    const detail = await waitForTerminal("jude", businessId);
    expect(detail.status).toBe("failed");
    expect(detail.package).toBeNull();
    expect(detail.errorCode).toBe("generationFailed");
    expect((await listBusinesses(db, "jude")).businesses.filter((b) => b.id === businessId)).toHaveLength(1);
    expect(await deleteBusiness(db, "jude", businessId)).toBe(true);
  });
});
