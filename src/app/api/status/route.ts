import { isLlmConfigured } from "@/lib/ai/client";
import { getSearchProvider } from "@/lib/services/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reports engine capabilities to the client (no secrets are exposed). */
export async function GET() {
  const llmConfigured = isLlmConfigured();
  const searchProvider = getSearchProvider();
  return Response.json({
    llmConfigured,
    model: llmConfigured ? process.env.OPENAI_MODEL || "gpt-4o-mini" : null,
    searchConfigured: searchProvider !== null,
    searchProvider,
    engine: llmConfigured ? "hybrid" : "deterministic",
  });
}
