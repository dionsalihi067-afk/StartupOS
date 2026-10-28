import { apiError, logFailure } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/session";
import { getGeneratedAsset, isAssetId } from "@/lib/businesses/assets";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Serves a stored generated image to the business owner, or to anyone once the business's
 * live published website uses it. Any other request gets the same 404 as an unknown id.
 * Public copies are cached briefly so unpublishing takes effect within a day.
 */
export async function GET(_req: Request, { params }: Context) {
  const { id } = await params;
  if (!isAssetId(id)) return apiError(404, "notFound");
  let viewerId: string | null = null;
  try {
    viewerId = (await getCurrentUser())?.id ?? null;
  } catch (err) {
    logFailure("assets-auth", err);
  }
  try {
    const asset = await getGeneratedAsset(getDb(), id, viewerId);
    if (!asset) return apiError(404, "notFound");
    return new Response(new Uint8Array(asset.bytes), {
      headers: {
        "Content-Type": asset.contentType,
        "Content-Length": String(asset.bytes.length),
        "Cache-Control": asset.audience === "owner" ? "private, max-age=31536000, immutable" : "public, max-age=86400",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch (err) {
    logFailure("assets", err);
    return apiError(503, "unavailable");
  }
}
