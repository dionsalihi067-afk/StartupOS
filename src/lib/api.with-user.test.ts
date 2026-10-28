import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth/session";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn(() => ({ tag: "db" })));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser }));
vi.mock("@/lib/db", () => ({ getDb }));

import { withUser } from "@/lib/api";

const PREV_URL = process.env.BETTER_AUTH_URL;

afterEach(() => {
  getCurrentUser.mockReset();
  getDb.mockClear();
  if (PREV_URL === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = PREV_URL;
});

describe("withUser", () => {
  it("returns 401 when there is no session", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await withUser(async () => new Response("ok"));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("allows signed-in users regardless of emailVerified", async () => {
    const user: SessionUser = {
      id: "u1",
      name: "Ada",
      email: "ada@example.com",
      image: null,
      emailVerified: false,
    };
    getCurrentUser.mockResolvedValue(user);
    const res = await withUser(async (u) => {
      expect(u.id).toBe("u1");
      expect(u.emailVerified).toBe(false);
      return new Response("ok");
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("runs the handler for verified users", async () => {
    const user: SessionUser = {
      id: "u1",
      name: "Ada",
      email: "ada@example.com",
      image: null,
      emailVerified: true,
    };
    getCurrentUser.mockResolvedValue(user);
    const res = await withUser(async () => new Response("ok"));
    expect(res.status).toBe(200);
  });

  it("rejects cross-site cookie mutations before invoking the handler", async () => {
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    getCurrentUser.mockResolvedValue({
      id: "u1",
      name: "Ada",
      email: "ada@example.com",
      image: null,
      emailVerified: true,
    } satisfies SessionUser);
    const handler = vi.fn(async () => new Response("ok"));
    const req = new Request("http://localhost:3000/api/x", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        cookie: "better-auth.session_token=x",
      },
    });
    const res = await withUser(handler, req);
    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
    expect(getCurrentUser).not.toHaveBeenCalled();
  });
});
