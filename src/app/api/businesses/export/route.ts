import { logFailure, withUser } from "@/lib/api";
import { exportBusinesses } from "@/lib/businesses/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Downloads every ready business owned by the signed-in user, streamed in small batches. */
export async function GET() {
  return withUser(async (user, db) => {
    const packages = exportBusinesses(db, user.id);
    // Read the first batch before answering, so a database failure is a 503 rather than a truncated file.
    const first = await packages.next();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("["));
        if (!first.done) controller.enqueue(encoder.encode(`\n${JSON.stringify(first.value, null, 2)}`));
      },
      async pull(controller) {
        try {
          const next = first.done ? first : await packages.next();
          if (next.done) {
            controller.enqueue(encoder.encode("\n]\n"));
            controller.close();
            return;
          }
          controller.enqueue(encoder.encode(`,\n${JSON.stringify(next.value, null, 2)}`));
        } catch (err) {
          logFailure("export", err);
          controller.error(err);
        }
      },
      async cancel() {
        await packages.return(undefined);
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="startupos-businesses.json"',
        "Cache-Control": "no-store",
      },
    });
  });
}
