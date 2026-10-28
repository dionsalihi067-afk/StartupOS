import { logFailure } from "@/lib/api";
import { getDb } from "@/lib/db";
import { checkHealth } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Readiness probe: 200 when the database is reachable and fully migrated, 503 otherwise. */
export async function GET() {
  const report = await checkHealth(getDb, logFailure);
  return Response.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
