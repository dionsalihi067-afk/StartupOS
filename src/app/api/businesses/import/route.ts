import { apiJson, logFailure, readJsonBody, withUser } from "@/lib/api";
import { importLegacyProject } from "@/lib/businesses/repository";
import { MAX_PACKAGE_BYTES } from "@/lib/package-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Imports one browser-local project into the signed-in user's account. The
 * client sends projects one at a time and only marks a project as migrated
 * after this endpoint confirms it was stored (or already existed).
 */
export async function POST(req: Request) {
  const body = await readJsonBody(req, { maxBytes: MAX_PACKAGE_BYTES });
  if (!body.ok) return body.response;
  const value = body.value;
  const project = value && typeof value === "object" && "project" in value ? value.project : undefined;

  return withUser(async (user, db) => {
    const result = await importLegacyProject(db, user.id, project);
    if (result.status === "invalid" || result.status === "failed") {
      logFailure("migration", { name: "ImportRejected", code: result.status, message: "local project not imported" });
    }
    return apiJson({ result });
  }, req);
}
