import { apiError, apiJson, withUser } from "@/lib/api";
import { decodeListCursor, listBusinesses } from "@/lib/businesses/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lightweight list of the signed-in user's businesses (no package data), one page at a time. */
export async function GET(req: Request) {
  const cursor = new URL(req.url).searchParams.get("cursor");
  if (cursor !== null && !decodeListCursor(cursor)) return apiError(400, "invalidInput");
  return withUser(async (user, db) => apiJson(await listBusinesses(db, user.id, { cursor })));
}
