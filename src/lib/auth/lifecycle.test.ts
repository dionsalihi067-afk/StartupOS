/**
 * Phase 15 — real Better Auth lifecycle against the real (PGlite) database:
 * sign-up → persisted user/account/session → sign-in → session retrieval →
 * wrong-password rejection → sign-out invalidation.
 * Uses the app's actual `getAuth()` configuration; only the DB handle is swapped.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => state.db }));

import { eq } from "drizzle-orm";
import { account, session, user } from "@/lib/db/schema";
import { createTestDb, type TestDb } from "@/test/db";

let db: TestDb;
let close: () => Promise<void>;
let handler: (req: Request) => Promise<Response>;

const ORIGIN = "http://localhost:3000";
const EMAIL = "new-founder@example.test";
const PASSWORD = "correct horse battery";

function post(path: string, body: unknown, cookie?: string) {
  const headers = new Headers({ "content-type": "application/json", origin: ORIGIN });
  if (cookie) headers.set("cookie", cookie);
  return handler(
    new Request(`${ORIGIN}/api/auth${path}`, { method: "POST", headers, body: JSON.stringify(body) }),
  );
}

function cookieFrom(res: Response): string {
  const set = res.headers.get("set-cookie") ?? "";
  const pair = set.split(";")[0]!;
  if (!pair.startsWith("better-auth.session_token=") && !pair.startsWith("__Secure-better-auth.session_token=")) {
    throw new Error(`no session cookie issued (status ${res.status})`);
  }
  return pair;
}

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
  process.env.BETTER_AUTH_SECRET = "phase15-lifecycle-test-secret-0123456789";
  process.env.BETTER_AUTH_URL = ORIGIN;
  delete process.env.APP_ORIGIN;
  delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;

  ({ db, close } = await createTestDb());
  state.db = db;
  const { getAuth } = await import("@/lib/auth");
  handler = (req) => getAuth().handler(req);
});

afterAll(async () => {
  await close();
});

describe("Better Auth email/password lifecycle", () => {
  it("registers, persists credentials, signs in, serves the session, and signs out", async () => {
    // --- sign up ---
    const signUp = await post("/sign-up/email", { name: "New Founder", email: EMAIL, password: PASSWORD });
    const signUpText = await signUp.clone().text();
    expect(signUp.status, signUpText).toBe(200);
    const signUpCookie = cookieFrom(signUp);

    // user + credential account persisted, password never plaintext
    const users = await db.select().from(user).where(eq(user.email, EMAIL));
    expect(users).toHaveLength(1);
    expect(users[0]!.emailVerified).toBe(false);
    const accounts = await db.select().from(account).where(eq(account.userId, users[0]!.id));
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.providerId).toBe("credential");
    expect(accounts[0]!.password).toBeTruthy();
    expect(accounts[0]!.password).not.toContain(PASSWORD);

    // session from sign-up is valid
    const sessions = await db.select().from(session).where(eq(session.userId, users[0]!.id));
    expect(sessions.length).toBeGreaterThanOrEqual(1);

    // --- session retrieval (what getCurrentUser relies on) ---
    const me = await handler(
      new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie: signUpCookie, origin: ORIGIN } }),
    );
    expect(me.status).toBe(200);
    const meJson = (await me.json()) as { user?: { email?: string } } | null;
    expect(meJson?.user?.email).toBe(EMAIL);

    // --- duplicate registration rejected ---
    const dup = await post("/sign-up/email", { name: "Copy", email: EMAIL, password: PASSWORD });
    expect(dup.status).toBe(422);

    // --- wrong password rejected ---
    const wrong = await post("/sign-in/email", { email: EMAIL, password: "wrong-password-1" });
    expect(wrong.status).toBe(401);

    // --- sign in with the same credentials ---
    const signIn = await post("/sign-in/email", { email: EMAIL, password: PASSWORD });
    const signInText = await signIn.clone().text();
    expect(signIn.status, signInText).toBe(200);
    const signInCookie = cookieFrom(signIn);

    const me2 = await handler(
      new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie: signInCookie, origin: ORIGIN } }),
    );
    expect(((await me2.json()) as { user?: { email?: string } } | null)?.user?.email).toBe(EMAIL);

    // --- sign out invalidates the session ---
    const out = await post("/sign-out", {}, signInCookie);
    expect(out.status).toBe(200);
    const after = await handler(
      new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie: signInCookie, origin: ORIGIN } }),
    );
    const afterJson = (await after.json().catch(() => null)) as { user?: unknown } | null;
    expect(afterJson?.user ?? null).toBeNull();
  });

  it("rejects invalid registration data without creating a user", async () => {
    const bad = await post("/sign-up/email", { name: "Bad", email: "not-an-email", password: PASSWORD });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    const short = await post("/sign-up/email", { name: "Bad", email: "short@example.test", password: "short" });
    expect(short.status).toBeGreaterThanOrEqual(400);
    expect(await db.select().from(user).where(eq(user.email, "short@example.test"))).toHaveLength(0);
  });
});
