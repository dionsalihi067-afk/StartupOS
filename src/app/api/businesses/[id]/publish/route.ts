import { z } from "zod";
import { apiError, apiJson, readJsonBody, withUser } from "@/lib/api";
import {
  getBusiness,
  publishWebsiteLive,
  saveWebsitePublication,
  unpublishWebsite,
} from "@/lib/businesses/repository";
import { getAppOrigin } from "@/lib/env";
import {
  buildPublishableWebsite,
  publicationStatus,
  publicSiteUrl,
  resolvePublishedPage,
} from "@/lib/website/publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const idSchema = z.string().min(1).max(200);
const pathSchema = z.string().max(200).default("/");
const bodySchema = z.union([
  z.object({}).strict(),
  z.object({ op: z.literal("prepare") }).strict(),
  z.object({ op: z.literal("publish") }).strict(),
  z.object({ op: z.literal("unpublish") }).strict(),
]);

/**
 * Resolves one page of an owned business's draft website for the workspace.
 * Not the public route — authentication and ownership are required.
 */
export async function GET(req: Request, { params }: Context) {
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return apiError(404, "notFound");
  const path = pathSchema.safeParse(new URL(req.url).searchParams.get("path") ?? undefined);
  if (!path.success) return apiError(400, "invalidInput");

  return withUser(async (user, db) => {
    const detail = await getBusiness(db, user.id, id.data);
    if (!detail) return apiError(404, "notFound");
    if (detail.status !== "ready" || !detail.package) return apiError(409, "notReady");

    const built = buildPublishableWebsite(detail.package.website.spec);
    if (!built.ok) return apiError(422, "invalidWebsite");
    const resolved = resolvePublishedPage(built.site, path.data);
    if (!resolved.ok) return apiError(404, "notFound");

    const { pages, ...shell } = built.site;
    const pub = detail.package.website.publication;
    const origin = getAppOrigin();
    return apiJson({
      site: shell,
      slugs: pages.map((p) => p.slug),
      page: resolved.page,
      status: publicationStatus(detail.package.website),
      publicSlug: pub?.publicSlug ?? null,
      publicUrl: pub?.publicSlug && pub.live ? publicSiteUrl(pub.publicSlug, "/", origin) : null,
      live: pub?.live === true,
    });
  });
}

/**
 * Owner publication operations:
 * - prepare (default / empty body): validate and mark draft as prepared
 * - publish: make the current website publicly available at `/s/<slug>`
 * - unpublish: remove public availability
 */
export async function POST(req: Request, { params }: Context) {
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return apiError(404, "notFound");

  const body = await readJsonBody(req, { maxBytes: 4 * 1024, whenEmpty: {} });
  if (!body.ok) return body.response;
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return apiError(400, "invalidInput");
  const op = "op" in parsed.data ? parsed.data.op : "prepare";

  return withUser(async (user, db) => {
    if (op === "prepare") {
      const saved = await saveWebsitePublication(db, user.id, id.data);
      if (!saved.ok) {
        if (saved.reason === "notFound") return apiError(404, "notFound");
        if (saved.reason === "notReady") return apiError(409, "notReady");
        if (saved.reason === "needsFixes") return apiError(422, "websiteNeedsFixes");
        return apiError(422, "invalidWebsite");
      }
      return apiJson({
        business: { ...saved.summary, package: saved.package },
        publication: saved.package.website.publication,
        status: publicationStatus(saved.package.website),
        changed: saved.changed,
      });
    }

    if (op === "publish") {
      const saved = await publishWebsiteLive(db, user.id, id.data);
      if (!saved.ok) {
        if (saved.reason === "notFound") return apiError(404, "notFound");
        if (saved.reason === "notReady") return apiError(409, "notReady");
        if (saved.reason === "slugUnavailable") return apiError(503, "unavailable");
        if (saved.reason === "needsFixes") return apiError(422, "websiteNeedsFixes");
        return apiError(422, "invalidWebsite");
      }
      const origin = getAppOrigin();
      const publicUrl = publicSiteUrl(saved.publicSlug, "/", origin);
      return apiJson({
        business: { ...saved.summary, package: saved.package },
        publication: saved.package.website.publication,
        status: "published",
        publicSlug: saved.publicSlug,
        publicUrl,
        publicPath: publicSiteUrl(saved.publicSlug, "/"),
        changed: saved.changed,
      });
    }

    const saved = await unpublishWebsite(db, user.id, id.data);
    if (!saved.ok) {
      if (saved.reason === "notFound") return apiError(404, "notFound");
      if (saved.reason === "notReady") return apiError(409, "notReady");
      return apiError(409, "notPublished");
    }
    return apiJson({
      business: { ...saved.summary, package: saved.package },
      publication: saved.package.website.publication,
      status: publicationStatus(saved.package.website),
      changed: saved.changed,
    });
  }, req);
}
