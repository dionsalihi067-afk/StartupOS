import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { consumeRateLimit, rateLimitFor, RATE_LIMIT_POLICIES } from "./rate-limit";
import { createTestDb, type TestDb } from "@/test/db";

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});

afterAll(async () => {
  await close();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const HOUR = RATE_LIMIT_POLICIES.generate.windowMs;

describe("rateLimitFor", () => {
  it("uses safe defaults and accepts valid overrides", () => {
    expect(rateLimitFor("generate", {})).toBe(10);
    expect(rateLimitFor("regenerate", {})).toBe(30);
    expect(rateLimitFor("research", {})).toBe(20);
    expect(rateLimitFor("generate", { RATE_LIMIT_GENERATE_PER_HOUR: " 3 " })).toBe(3);
  });

  it("never lets configuration disable or break the limit", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const value of ["0", "-1", "1.5", "abc", "100000", "Infinity", "1e3"]) {
      expect(rateLimitFor("generate", { RATE_LIMIT_GENERATE_PER_HOUR: value })).toBe(10);
    }
  });
});

describe("consumeRateLimit", () => {
  it("allows requests up to the limit, then rejects with the time until the window resets", async () => {
    vi.stubEnv("RATE_LIMIT_GENERATE_PER_HOUR", "2");
    const start = new Date("2026-01-01T10:00:00Z");
    expect(await consumeRateLimit(db, "generate", "u-limit", start)).toEqual({ allowed: true, remaining: 1 });
    expect(await consumeRateLimit(db, "generate", "u-limit", new Date(start.getTime() + 1000))).toEqual({ allowed: true, remaining: 0 });
    expect(await consumeRateLimit(db, "generate", "u-limit", new Date(start.getTime() + 10 * 60_000))).toEqual({
      allowed: false,
      retryAfterSeconds: 50 * 60,
    });
  });

  it("starts a fresh window once the previous one has expired", async () => {
    vi.stubEnv("RATE_LIMIT_GENERATE_PER_HOUR", "1");
    const start = new Date("2026-01-01T10:00:00Z");
    expect((await consumeRateLimit(db, "generate", "u-window", start)).allowed).toBe(true);
    expect((await consumeRateLimit(db, "generate", "u-window", new Date(start.getTime() + 1000))).allowed).toBe(false);
    expect((await consumeRateLimit(db, "generate", "u-window", new Date(start.getTime() + HOUR))).allowed).toBe(true);
  });

  it("keeps separate counters per user and per operation", async () => {
    vi.stubEnv("RATE_LIMIT_GENERATE_PER_HOUR", "1");
    const now = new Date("2026-01-01T10:00:00Z");
    expect((await consumeRateLimit(db, "generate", "u-a", now)).allowed).toBe(true);
    expect((await consumeRateLimit(db, "generate", "u-a", now)).allowed).toBe(false);
    expect((await consumeRateLimit(db, "generate", "u-b", now)).allowed).toBe(true);
    expect((await consumeRateLimit(db, "research", "u-a", now)).allowed).toBe(true);
  });

  it("counts concurrent requests atomically", async () => {
    vi.stubEnv("RATE_LIMIT_RESEARCH_PER_HOUR", "3");
    const now = new Date("2026-01-01T10:00:00Z");
    const results = await Promise.all(Array.from({ length: 8 }, () => consumeRateLimit(db, "research", "u-burst", now)));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
  });

  it("propagates storage failures so callers fail closed", async () => {
    const broken = { insert: () => { throw new Error("connection refused"); } } as unknown as TestDb;
    await expect(consumeRateLimit(broken, "generate", "u-x")).rejects.toThrow("connection refused");
  });
});
