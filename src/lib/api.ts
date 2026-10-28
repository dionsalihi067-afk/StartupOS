import "server-only";
import { denyUntrustedMutationOrigin } from "@/lib/auth/request-origin";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { getDb, type Database } from "@/lib/db";
import { consumeRateLimit, type RateLimitPolicy } from "@/lib/rate-limit";

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "invalidInput"
  | "notReady"
  | "tooLarge"
  | "unavailable"
  | "invalidWebsite"
  | "websiteNeedsFixes"
  | "notPublished"
  | "unsupportedType"
  | "rateLimited";

export function apiError(status: number, error: ApiErrorCode, extra: Record<string, unknown> = {}): Response {
  return Response.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Counts an expensive request for the session user. Returns a 429 response when the user is over the
 * limit, or null when the request may proceed. Limiter storage errors throw so callers fail closed.
 */
export async function enforceRateLimit(db: Database, policy: RateLimitPolicy, userId: string): Promise<Response | null> {
  const decision = await consumeRateLimit(db, policy, userId);
  if (decision.allowed) return null;
  return Response.json(
    { error: "rateLimited" satisfies ApiErrorCode, retryAfter: decision.retryAfterSeconds },
    { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(decision.retryAfterSeconds) } },
  );
}

/** Default cap for JSON request bodies; every accepted body schema is far smaller. */
export const MAX_JSON_BODY_BYTES = 256 * 1024;

export type JsonBody = { ok: true; value: unknown } | { ok: false; response: Response };

/** Reads a raw request body, never buffering more than `maxBytes` (413 past it, 400 if the stream breaks). */
export async function readBodyBytes(req: Request, maxBytes: number): Promise<{ ok: true; value: Buffer } | { ok: false; response: Response }> {
  const tooLarge = { ok: false, response: apiError(413, "tooLarge") } as const;
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) return tooLarge;
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (req.body) {
    const reader = req.body.getReader();
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        return { ok: false, response: apiError(400, "invalidInput") };
      }
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return tooLarge;
      }
      chunks.push(chunk.value);
    }
  }
  return { ok: true, value: Buffer.concat(chunks) };
}

/**
 * Reads and parses a JSON request body, never buffering more than `maxBytes` — route handlers have
 * no built-in body limit and chunked requests carry no Content-Length. An empty body yields
 * `whenEmpty` when given, otherwise it is invalid input.
 */
export async function readJsonBody(
  req: Request,
  { maxBytes = MAX_JSON_BODY_BYTES, whenEmpty }: { maxBytes?: number; whenEmpty?: unknown } = {},
): Promise<JsonBody> {
  const invalid = { ok: false, response: apiError(400, "invalidInput") } as const;
  const bytes = await readBodyBytes(req, maxBytes);
  if (!bytes.ok) return bytes;
  const text = new TextDecoder().decode(bytes.value);
  if (!text.trim()) return whenEmpty === undefined ? invalid : { ok: true, value: whenEmpty };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return invalid;
  }
}

export function apiJson(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, { ...init, headers: { "Cache-Control": "no-store", ...init.headers } });
}

/** Logs an operational failure without request bodies, credentials or stored content. */
export function logFailure(scope: string, err: unknown): void {
  const e = err as { name?: string; code?: string; message?: string } | null;
  console.error(`[${scope}]`, e?.name ?? "Error", e?.code ?? "", (e?.message ?? "").slice(0, 200));
}

/**
 * Runs a handler for the signed-in user. The user always comes from the
 * verified session; ids in the request body or URL are never used as identity.
 * Pass `request` for state-changing routes so cookie-authenticated cross-site
 * mutations are rejected before the handler runs (CSRF defense-in-depth).
 */
export async function withUser(
  handler: (user: SessionUser, db: Database) => Promise<Response>,
  request?: Request,
): Promise<Response> {
  if (request) {
    const denied = denyUntrustedMutationOrigin(request);
    if (denied) return denied;
  }
  let user: SessionUser | null;
  try {
    user = await getCurrentUser();
  } catch (err) {
    logFailure("auth", err);
    return apiError(503, "unavailable");
  }
  if (!user) return apiError(401, "unauthorized");
  try {
    return await handler(user, getDb());
  } catch (err) {
    logFailure("api", err);
    return apiError(503, "unavailable");
  }
}
