import { z } from "zod";
import { apiError, apiJson, enforceRateLimit, logFailure, readJsonBody, withUser } from "@/lib/api";
import { getBusiness, saveScopedRegeneration } from "@/lib/businesses/repository";
import { normalizeSectionSelection, regenerateSelectedSections, regenerationNeedsResearch } from "@/lib/regenerate";
import { researchForGeneration } from "@/lib/research/generation";
import { businessAssetStore, pruneUnreferencedAssets } from "@/lib/businesses/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };

const idSchema = z.string().min(1).max(200);
const bodySchema = z.object({
  sections: z.array(z.string()).min(1).max(32),
});

/**
 * Scoped regeneration: regenerates only the requested generated sections for
 * an owned ready business, merges successful results, and preserves everything else.
 * When any selected section consumes research, one fresh research run is made
 * from the stored business input and shared by every selected section; the
 * body only ever selects sections.
 */
export async function POST(req: Request, { params }: Context) {
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return apiError(404, "notFound");

  const body = await readJsonBody(req, { maxBytes: 16 * 1024 });
  if (!body.ok) return body.response;

  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return apiError(400, "invalidInput");

  const normalized = normalizeSectionSelection(parsed.data.sections);
  if (!normalized.ok) return apiError(400, "invalidInput");

  return withUser(async (user, db) => {
    const detail = await getBusiness(db, user.id, id.data);
    if (!detail) return apiError(404, "notFound");
    if (detail.status !== "ready" || !detail.package) return apiError(409, "notReady");

    const limited = await enforceRateLimit(db, "regenerate", user.id);
    if (limited) return limited;

    const input = detail.package.input;
    const research = regenerationNeedsResearch(normalized.sections) ? await researchForGeneration(input) : undefined;
    const storeAsset = businessAssetStore(db, user.id, id.data);
    const generated = await regenerateSelectedSections(detail.package, normalized.sections, undefined, { research, storeAsset });
    const saved = await saveScopedRegeneration(db, user.id, id.data, generated.patches, generated.outcomes);

    if (!saved.ok) {
      if (saved.reason === "notFound") return apiError(404, "notFound");
      if (saved.reason === "notReady") return apiError(409, "notReady");
      return apiError(400, "invalidInput");
    }

    await pruneUnreferencedAssets(db, user.id, id.data).catch((err) => logFailure("asset-prune", err));

    return apiJson({
      business: { ...saved.summary, package: saved.package },
      outcomes: saved.outcomes,
      succeeded: saved.succeeded,
      failed: saved.failed,
    });
  }, req);
}
