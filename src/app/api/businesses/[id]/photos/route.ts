import { z } from "zod";
import { apiError, apiJson, enforceRateLimit, readBodyBytes, withUser } from "@/lib/api";
import { MAX_PHOTO_BYTES, saveOwnerPhoto } from "@/lib/businesses/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const idSchema = z.string().min(1).max(200);

/**
 * Uploads one photo for the owner's business website (the raw image is the request body).
 * The image type is read from the file itself; only PNG, JPEG and WebP are stored. The photo
 * stays private to the owner until a live published website uses it.
 */
export async function POST(req: Request, { params }: Context) {
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return apiError(404, "notFound");

  return withUser(async (user, db) => {
    const body = await readBodyBytes(req, MAX_PHOTO_BYTES);
    if (!body.ok) return body.response;
    if (body.value.length === 0) return apiError(400, "invalidInput");
    const limited = await enforceRateLimit(db, "upload", user.id);
    if (limited) return limited;

    const saved = await saveOwnerPhoto(db, user.id, id.data, body.value);
    if (saved.ok) return apiJson({ url: saved.url }, { status: 201 });
    if (saved.reason === "notFound") return apiError(404, "notFound");
    if (saved.reason === "tooLarge") return apiError(413, "tooLarge");
    return apiError(415, "unsupportedType");
  }, req);
}
