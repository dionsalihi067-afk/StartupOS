import { z } from "zod";
import { apiError, apiJson, readJsonBody, withUser } from "@/lib/api";
import {
  deleteBusiness,
  findByLegacyId,
  getBusiness,
  setChecklistItem,
  updateBrand,
  saveWebsiteBrief,
  updateBusinessContext,
} from "@/lib/businesses/repository";
import { ownsAssetUrl } from "@/lib/businesses/assets";
import { businessInputSchema } from "@/lib/schemas";
import { websiteBriefSchema } from "@/lib/website/brief";
import { applyWebsiteBrief } from "@/lib/website/setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const idSchema = z.string().min(1).max(200);

const brandText = z.string().trim().min(1);

const brandEditSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("name"), value: brandText.max(80) }),
  z.object({ field: z.literal("slogan"), value: brandText.max(160) }),
  z.object({ field: z.literal("description"), value: brandText.max(1200) }),
  z.object({ field: z.literal("personality"), value: z.array(z.string().trim().min(1).max(40)).max(8) }),
  z.object({
    field: z.literal("color"),
    index: z.number().int().min(0).max(20),
    hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
]);

const patchSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("setChecklistItem"), index: z.number().int().min(0).max(1000), done: z.boolean() }),
  z.object({ op: z.literal("updateBrand"), edit: brandEditSchema }),
  /** Source business context only — never regenerates package output. */
  z.object({ op: z.literal("updateBusinessContext"), input: businessInputSchema }),
  /** Website setup answers; rebuilds the website and its SEO deterministically (no AI call). */
  z.object({ op: z.literal("updateWebsiteBrief"), brief: websiteBriefSchema }),
]);

export async function GET(_req: Request, { params }: Context) {
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return apiError(404, "notFound");
  return withUser(async (user, db) => {
    const found = await getBusiness(db, user.id, id.data);
    if (found) return apiJson({ business: found });
    // Old bookmarks may still use the browser-local id of an imported project.
    const movedTo = await findByLegacyId(db, user.id, id.data);
    return apiError(404, "notFound", movedTo ? { movedTo } : {});
  });
}

export async function PATCH(req: Request, { params }: Context) {
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return apiError(404, "notFound");
  const body = await readJsonBody(req);
  if (!body.ok) return body.response;
  const parsed = patchSchema.safeParse(body.value);
  if (!parsed.success) return apiError(400, "invalidInput");

  return withUser(async (user, db) => {
    const op = parsed.data;
    // A hero photo must be one this owner uploaded for this business.
    if (op.op === "updateWebsiteBrief" && op.brief.heroImage && !(await ownsAssetUrl(db, user.id, id.data, op.brief.heroImage))) {
      return apiError(400, "invalidInput");
    }
    const result =
      op.op === "setChecklistItem"
        ? await setChecklistItem(db, user.id, id.data, op.index, op.done)
        : op.op === "updateBrand"
          ? await updateBrand(db, user.id, id.data, op.edit)
          : op.op === "updateWebsiteBrief"
            ? await saveWebsiteBrief(db, user.id, id.data, (current) => applyWebsiteBrief(current, op.brief))
            : await updateBusinessContext(db, user.id, id.data, op.input);
    if (result.ok) return apiJson({ business: { ...result.summary, package: result.package } });
    if (result.reason === "notFound") return apiError(404, "notFound");
    if (result.reason === "notReady") return apiError(409, "notReady");
    return apiError(400, "invalidInput");
  }, req);
}

export async function DELETE(req: Request, { params }: Context) {
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return apiError(404, "notFound");
  return withUser(async (user, db) => {
    const deleted = await deleteBusiness(db, user.id, id.data);
    return deleted ? new Response(null, { status: 204 }) : apiError(404, "notFound");
  }, req);
}
