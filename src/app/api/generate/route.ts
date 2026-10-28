import { NextRequest } from "next/server";
import { businessInputSchema } from "@/lib/schemas";
import { orchestrate } from "@/lib/orchestrator";
import { apiError, enforceRateLimit, logFailure, readJsonBody } from "@/lib/api";
import { denyUntrustedMutationOrigin } from "@/lib/auth/request-origin";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { getDb, type Database } from "@/lib/db";
import {
  completeGeneration,
  createGeneratingBusiness,
  createGeneratingHeartbeat,
  failGeneration,
  GENERATION_SOFT_DEADLINE_MS,
  touchGeneratingBusiness,
} from "@/lib/businesses/repository";
import { researchForGeneration } from "@/lib/research/generation";
import { businessAssetStore } from "@/lib/businesses/assets";
import { resolveLlmProvider } from "@/lib/ai/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Streaming generation endpoint. The business record is created for the
 * signed-in user before generation starts, and the validated package is saved
 * to that record when it completes. Progress streams as Server-Sent Events;
 * saving does not depend on the browser staying connected. Research runs once,
 * server-side, from the validated input (unknown body fields such as research,
 * competitors, pricing or userId are stripped by the schema) and is shared by
 * every agent through the generation context. Requests are rate limited per
 * session user before any record or paid work is created.
 *
 * Platform note: work still runs inside this request (`maxDuration`). The soft
 * deadline fails the job honestly before the host kills the process — it is not
 * a durable background worker and does not continue after the request ends.
 */
export async function POST(req: NextRequest) {
  const originDenied = denyUntrustedMutationOrigin(req);
  if (originDenied) return originDenied;

  let user: SessionUser | null;
  try {
    user = await getCurrentUser();
  } catch (err) {
    logFailure("auth", err);
    return apiError(503, "unavailable");
  }
  if (!user) return apiError(401, "unauthorized");

  const body = await readJsonBody(req);
  if (!body.ok) return body.response;

  const parsed = businessInputSchema.safeParse(body.value);
  if (!parsed.success) {
    return Response.json({ error: "invalidInput", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  // When the operator requires OpenAI, refuse to start a deterministic "AI" run.
  const llm = resolveLlmProvider();
  if (llm.preference === "openai" && !llm.configured) {
    return Response.json(
      {
        error: "openaiNotConfigured",
        reason: llm.reason ?? "openai-required",
        selectionReason: llm.selectionReason,
      },
      { status: 503 },
    );
  }

  const userId = user.id;
  let db: Database;
  let businessId: string;
  try {
    db = getDb();
    const limited = await enforceRateLimit(db, "generate", userId);
    if (limited) return limited;
    businessId = await createGeneratingBusiness(db, userId, parsed.data);
  } catch (err) {
    logFailure("generate", err);
    return apiError(503, "unavailable");
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (data: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          open = false;
        }
      };

      send({ type: "created", businessId });
      let settled = false;
      const heartbeat = createGeneratingHeartbeat(() => touchGeneratingBusiness(db, userId, businessId));
      try {
        if (!(await heartbeat.pulse(true))) {
          settled = true;
          send({ type: "error", businessId });
          return;
        }
        const research = await researchForGeneration(parsed.data);
        if (!(await heartbeat.pulse(true))) {
          settled = true;
          send({ type: "error", businessId });
          return;
        }
        const storeAsset = businessAssetStore(db, userId, businessId);
        // Soft deadline exists to fail honestly before the Vercel/platform hard kill.
        // Local `next dev` / Node has no such hard kill — applying 255s here aborts
        // otherwise-successful ~4–5 minute OpenAI quality runs. Only arm on Vercel.
        const deadlineAt =
          process.env.VERCEL === "1" ? Date.now() + GENERATION_SOFT_DEADLINE_MS : undefined;
        for await (const event of orchestrate(parsed.data, { research, storeAsset, businessId, deadlineAt })) {
          if (!(await heartbeat.pulse())) {
            settled = true;
            send({ type: "error", businessId });
            return;
          }
          if (event.type === "error") {
            // Soft deadline or orchestrator abort — persist interrupted, do not claim success.
            settled = true;
            await failGeneration(db, userId, businessId, "interrupted");
            send({ type: "error", businessId, message: event.message });
            return;
          }
          if (event.type === "complete" && event.result) {
            const stored = await completeGeneration(db, userId, businessId, event.result);
            if (stored) {
              settled = true;
              send({ ...event, result: stored });
            } else {
              // Invalid packages are already marked failed; otherwise the row is gone or was settled elsewhere.
              settled = true;
              logFailure("generate", { name: "PersistFailed", message: `package not stored (business ${businessId})` });
              send({ type: "error", businessId });
            }
          } else {
            send(event);
          }
        }
        if (!settled) {
          await failGeneration(db, userId, businessId, "generationFailed");
          send({ type: "error", businessId });
        }
      } catch (err) {
        logFailure("generate", err);
        // A late throw after a successful persist must not reverse the terminal
        // ready state or contradict the complete event already sent to the client.
        if (!settled) {
          await failGeneration(db, userId, businessId, "generationFailed").catch((e) => logFailure("generate", e));
          send({ type: "error", businessId });
        }
      } finally {
        if (open) {
          try {
            controller.close();
          } catch {
            /* already closed by the client */
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
