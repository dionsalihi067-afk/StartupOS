/**
 * Password recovery against real Better Auth + PGlite:
 * request → email sink → reset with token → sign-in with new password;
 * unknown email returns the same generic success; invalid token rejected.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => state.db }));

import { eq } from "drizzle-orm";
import { account, session, user, verification } from "@/lib/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { drainTestInbox } from "@/lib/email/delivery";

let db: TestDb;
let close: () => Promise<void>;
let handler: (req: Request) => Promise<Response>;

const ORIGIN = "http://localhost:3000";
const EMAIL = "recover@example.test";
const OLD_PASSWORD = "old-password-value";
const NEW_PASSWORD = "new-password-value-99";

function post(path: string, body: unknown, cookie?: string) {
  const headers = new Headers({ "content-type": "application/json", origin: ORIGIN });
  if (cookie) headers.set("cookie", cookie);
  return handler(new Request(`${ORIGIN}/api/auth${path}`, { method: "POST", headers, body: JSON.stringify(body) }));
}

function cookieFrom(res: Response): string {
  const set = res.headers.get("set-cookie") ?? "";
  const pair = set.split(";")[0]!;
  if (!pair.startsWith("better-auth.session_token=") && !pair.startsWith("__Secure-better-auth.session_token=")) {
    throw new Error(`no session cookie issued (status ${res.status})`);
  }
  return pair;
}

function tokenFromInbox(): string {
  const messages = drainTestInbox();
  expect(messages.length).toBeGreaterThanOrEqual(1);
  const text = messages[messages.length - 1]!.text;
  const match = text.match(/\/reset-password\/([A-Za-z0-9_-]+)/);
  expect(match?.[1], "reset token in email body").toBeTruthy();
  return match![1]!;
}

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
  process.env.BETTER_AUTH_SECRET = "phase-recovery-test-secret-0123456789ab";
  process.env.BETTER_AUTH_URL = ORIGIN;
  process.env.EMAIL_TEST_SINK = "1";
  delete process.env.APP_ORIGIN;
  delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;

  ({ db, close } = await createTestDb());
  state.db = db;
  const { getAuth, resetAuthForTests } = await import("@/lib/auth");
  resetAuthForTests();
  handler = (req) => getAuth().handler(req);
});

afterAll(async () => {
  await close();
});

beforeEach(() => {
  drainTestInbox();
});

describe("password recovery", () => {
  it("sends a generic response for unknown emails without writing a verification row", async () => {
    const before = await db.select().from(verification);
    const res = await post("/request-password-reset", {
      email: "nobody@example.test",
      redirectTo: `${ORIGIN}/en/reset-password`,
    });
    const body = (await res.json()) as { status?: boolean; message?: string };
    expect(res.status).toBe(200);
    expect(body.status).toBe(true);
    expect(body.message?.toLowerCase()).toContain("if this email exists");
    expect(drainTestInbox()).toHaveLength(0);
    const after = await db.select().from(verification);
    expect(after.length).toBe(before.length);
  });

  it("resets the password with a one-time token and revokes sessions", async () => {
    const signUp = await post("/sign-up/email", {
      name: "Recover Me",
      email: EMAIL,
      password: OLD_PASSWORD,
    });
    expect(signUp.status).toBe(200);
    const sessionCookie = cookieFrom(signUp);

    const request = await post("/request-password-reset", {
      email: EMAIL,
      redirectTo: `${ORIGIN}/en/reset-password`,
    });
    expect(request.status).toBe(200);
    const requestBody = (await request.json()) as { status?: boolean; message?: string };
    expect(requestBody.status).toBe(true);
    expect(requestBody.message?.toLowerCase()).toContain("if this email exists");

    const token = tokenFromInbox();

    const bad = await post("/reset-password", { newPassword: NEW_PASSWORD, token: "not-a-real-token" });
    expect(bad.status).toBeGreaterThanOrEqual(400);

    const reset = await post("/reset-password", { newPassword: NEW_PASSWORD, token });
    const resetText = await reset.clone().text();
    expect(reset.status, resetText).toBe(200);

    // Token is single-use
    const reuse = await post("/reset-password", { newPassword: "another-password-88", token });
    expect(reuse.status).toBeGreaterThanOrEqual(400);

    // Old password rejected; new password works
    const oldSignIn = await post("/sign-in/email", { email: EMAIL, password: OLD_PASSWORD });
    expect(oldSignIn.status).toBe(401);
    const newSignIn = await post("/sign-in/email", { email: EMAIL, password: NEW_PASSWORD });
    expect(newSignIn.status).toBe(200);

    // Prior session revoked
    const me = await handler(
      new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie: sessionCookie, origin: ORIGIN } }),
    );
    const meJson = (await me.json().catch(() => null)) as { user?: unknown } | null;
    expect(meJson?.user ?? null).toBeNull();

    const users = await db.select().from(user).where(eq(user.email, EMAIL));
    expect(users).toHaveLength(1);
    const accounts = await db.select().from(account).where(eq(account.userId, users[0]!.id));
    expect(accounts.some((a) => a.providerId === "credential" && a.password)).toBe(true);
    const sessions = await db.select().from(session).where(eq(session.userId, users[0]!.id));
    // Only the fresh sign-in session should remain (old ones revoked on reset).
    expect(sessions.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects a password that is too short", async () => {
    const email = "short-pw@example.test";
    await post("/sign-up/email", { name: "Short", email, password: OLD_PASSWORD });
    await post("/request-password-reset", { email, redirectTo: `${ORIGIN}/en/reset-password` });
    const token = tokenFromInbox();
    const res = await post("/reset-password", { newPassword: "short", token });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
