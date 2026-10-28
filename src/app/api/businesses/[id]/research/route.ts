import { z } from "zod";
import { apiError, apiJson, enforceRateLimit, withUser } from "@/lib/api";
import { getBusiness } from "@/lib/businesses/repository";
import { runResearch } from "@/lib/research/engine";
import { getResearchProvider } from "@/lib/research/web-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

const idSchema = z.string().min(1).max(200);

/**
 * Runs a fresh research pass for one of the signed-in user's businesses and
 * returns the result (snapshot or explicit failure). The request body is
 * ignored: provider, queries and limits are decided on the server. Nothing is
 * persisted and no generated content changes.
 */
export async function POST(req: Request, { params }: Context) {
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return apiError(404, "notFound");

  return withUser(async (user, db) => {
    const business = await getBusiness(db, user.id, id.data);
    if (!business) return apiError(404, "notFound");
    if (business.status !== "ready" || !business.package) return apiError(409, "notReady");

    const limited = await enforceRateLimit(db, "research", user.id);
    if (limited) return limited;

    const research = await runResearch(business.package.input, getResearchProvider());
    return apiJson({ research });
  }, req);
}
