import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SessionUser } from "@/lib/auth/session";

const state = vi.hoisted(() => ({
  user: null as SessionUser | null,
  reachedDb: false,
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => state.user,
}));

vi.mock("@/lib/db", () => ({
  getDb: () => {
    state.reachedDb = true;
    throw new Error("stop after auth gate");
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  consumeRateLimit: async () => ({ allowed: true }),
}));

import { POST } from "./route";

beforeEach(() => {
  state.reachedDb = false;
  state.user = {
    id: "alice",
    name: "alice",
    email: "alice@example.test",
    image: null,
    emailVerified: false,
  };
});

afterEach(() => {
  state.user = null;
});

describe("POST /api/generate without email verification gate", () => {
  it("rejects unauthenticated requests", async () => {
    state.user = null;
    const res = await POST(
      new NextRequest("http://localhost/api/generate", {
        method: "POST",
        body: JSON.stringify({
          idea: "Test cafe",
          audience: "locals",
          budget: "5000",
          location: "Prishtina",
        }),
      }),
    );
    expect(res.status).toBe(401);
    expect(state.reachedDb).toBe(false);
  });

  it("does not reject signed-in users for emailVerified=false", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/generate", {
        method: "POST",
        body: JSON.stringify({
          idea: "Test cafe",
          audience: "locals",
          budget: "5000",
          location: "Prishtina",
        }),
      }),
    );
    // Auth passed; mock DB throws → handler surfaces 503 unavailable (or 422 if schema fails first).
    expect(res.status).not.toBe(403);
    expect([422, 503]).toContain(res.status);
  });
});
