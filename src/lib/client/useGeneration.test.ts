import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import sq from "@/messages/sq.json";
import type { BusinessInput, BusinessPackage, OrchestrationEvent } from "@/lib/types";

vi.mock("@/lib/client/businesses", () => ({
  businessCreated: vi.fn(),
  redirectToLogin: vi.fn(),
  refreshBusinesses: vi.fn(() => Promise.resolve()),
}));

const { businessCreated, refreshBusinesses } = await import("@/lib/client/businesses");
const { getGenerationState, parseRetryAfter, retryAfterMinutes, startGeneration } = await import("./useGeneration");

const input = { idea: "A neighbourhood bakery in Tirana" } as BusinessInput;

function rateLimitedResponse(retryAfter: string | null) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (retryAfter !== null) headers.set("Retry-After", retryAfter);
  return new Response(JSON.stringify({ error: "rateLimited", retryAfter: Number(retryAfter) }), { status: 429, headers });
}

function sseResponse(events: unknown[]) {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  });
}

const miniResult = {
  id: "biz_stream_1",
  meta: { quality: { outcome: "degraded", limitations: ["criticalFallback"] } },
} as BusinessPackage;

describe("parseRetryAfter", () => {
  it("reads whole seconds and ignores anything else", () => {
    expect(parseRetryAfter("3477")).toBe(3477);
    expect(parseRetryAfter(" 60 ")).toBe(60);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("")).toBeNull();
    expect(parseRetryAfter("0")).toBeNull();
    expect(parseRetryAfter("-5")).toBeNull();
    expect(parseRetryAfter("1.5")).toBeNull();
    expect(parseRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT")).toBeNull();
    expect(parseRetryAfter("999999999")).toBeNull();
  });

  it("rounds minutes up so the user is never told to retry too early", () => {
    expect(retryAfterMinutes(1)).toBe(1);
    expect(retryAfterMinutes(60)).toBe(1);
    expect(retryAfterMinutes(61)).toBe(2);
    expect(retryAfterMinutes(3477)).toBe(58);
  });
});

describe("rate-limited generation", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ends in a rateLimited error with the server's retry time, sending the request once", async () => {
    fetchMock.mockResolvedValueOnce(rateLimitedResponse("3477"));
    const seen: string[] = [];
    const run = startGeneration(input);
    seen.push(getGenerationState().status);
    await run;
    const state = getGenerationState();

    expect(seen).toEqual(["running"]);
    expect(state.status).toBe("error");
    expect(state.error).toBe("rateLimited");
    expect(state.retryAfterSeconds).toBe(3477);
    expect(state.result).toBeNull();
    expect(state.businessId).toBeNull();
    expect(state.agents.every((a) => a.status === "pending")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the generic message when no retry time is given", async () => {
    fetchMock.mockResolvedValueOnce(rateLimitedResponse(null));
    await startGeneration(input);
    expect(getGenerationState().error).toBe("rateLimited");
    expect(getGenerationState().retryAfterSeconds).toBeNull();
  });

  it("ignores a second submit while a request is in flight", async () => {
    let respond!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (respond = r)));
    const first = startGeneration(input);
    await startGeneration(input);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    respond(rateLimitedResponse("120"));
    await first;
    expect(getGenerationState().status).toBe("error");
    expect(getGenerationState().retryAfterSeconds).toBe(120);
  });

  it("clears the previous rate-limit details when a new run starts", async () => {
    fetchMock.mockResolvedValueOnce(rateLimitedResponse("120"));
    await startGeneration(input);
    let respond!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (respond = r)));
    const next = startGeneration(input);
    expect(getGenerationState()).toMatchObject({ status: "running", error: null, retryAfterSeconds: null });
    respond(rateLimitedResponse("60"));
    await next;
  });
});

describe("rate-limit messages", () => {
  it("exist in English and Albanian with the minutes placeholder", () => {
    for (const messages of [en, sq]) {
      const generation = messages.errors.generation;
      expect(generation.rateLimited.length).toBeGreaterThan(10);
      expect(generation.rateLimitedRetry).toContain("{minutes}");
    }
    expect(sq.errors.generation.rateLimitedRetry).not.toBe(en.errors.generation.rateLimitedRetry);
  });
});

describe("forbidden (CSRF / origin) generation response", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("maps HTTP 403 to forbidden, not the generic requestFailed message", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }));
    await startGeneration(input);
    expect(getGenerationState()).toMatchObject({ status: "error", error: "forbidden", result: null });
    expect(en.errors.generation.forbidden.length).toBeGreaterThan(10);
    expect(sq.errors.generation.forbidden).toContain("sigurie");
    expect(sq.errors.generation.forbidden).not.toBe(en.errors.generation.forbidden);
  });
});

describe("SSE consumption lifecycle", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.mocked(businessCreated).mockClear();
    vi.mocked(refreshBusinesses).mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("applies created → progress → complete without fabricating success from progress alone", async () => {
    const events: OrchestrationEvent[] = [
      { type: "created", businessId: "biz_stream_1" },
      { type: "agent-start", agent: "brand", label: "Brand Agent", progress: 10 },
      { type: "agent-complete", agent: "brand", label: "Brand Agent", progress: 20, source: "deterministic" },
      { type: "complete", progress: 100, result: miniResult },
    ];
    fetchMock.mockResolvedValueOnce(sseResponse(events));
    await startGeneration(input);

    const state = getGenerationState();
    expect(state.status).toBe("complete");
    expect(state.progress).toBe(100);
    expect(state.result?.id).toBe("biz_stream_1");
    expect(state.result?.meta.quality?.outcome).toBe("degraded");
    expect(state.error).toBeNull();
    expect(state.agents.find((a) => a.key === "brand")?.status).toBe("done");
    expect(businessCreated).toHaveBeenCalledWith("biz_stream_1");
  });

  it("marks recovery steps as fallback in the UI, not as clean AI success", async () => {
    const events: OrchestrationEvent[] = [
      { type: "created", businessId: "biz_fb" },
      {
        type: "agent-complete",
        agent: "marketing",
        label: "Marketing Agent",
        progress: 50,
        source: "deterministic",
        fallback: true,
      },
      { type: "complete", progress: 100, result: miniResult },
    ];
    fetchMock.mockResolvedValueOnce(sseResponse(events));
    await startGeneration(input);
    expect(getGenerationState().agents.find((a) => a.key === "marketing")?.status).toBe("error");
    expect(getGenerationState().status).toBe("complete");
  });

  it("does not treat progress or malformed frames as success", async () => {
    const body =
      `data: ${JSON.stringify({ type: "created", businessId: "biz_partial" })}\n\n` +
      `data: ${JSON.stringify({ type: "agent-start", agent: "brand", label: "Brand Agent", progress: 40 })}\n\n` +
      `data: {not-json}\n\n` +
      `data: ${JSON.stringify({ type: "agent-complete", agent: "brand", progress: 50 })}\n\n`;
    fetchMock.mockResolvedValueOnce(
      new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } }),
    );

    await startGeneration(input);
    const state = getGenerationState();
    expect(state.status).toBe("error");
    expect(state.error).toBe("detached");
    expect(state.businessId).toBe("biz_partial");
    expect(state.result).toBeNull();
    expect(businessCreated).not.toHaveBeenCalled();
  });

  it("maps a terminal stream error to server failure without a result", async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        { type: "created", businessId: "biz_fail" },
        { type: "agent-start", agent: "brand", label: "Brand Agent", progress: 5 },
        { type: "error", businessId: "biz_fail" },
      ]),
    );
    await startGeneration(input);
    expect(getGenerationState()).toMatchObject({ status: "error", error: "server", result: null, businessId: "biz_fail" });
  });

  it("ignores a late error after complete so persisted success is not erased", async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        { type: "created", businessId: "biz_stream_1" },
        { type: "complete", progress: 100, result: miniResult },
        { type: "error", businessId: "biz_stream_1" },
      ]),
    );
    await startGeneration(input);
    expect(getGenerationState()).toMatchObject({
      status: "complete",
      result: { id: "biz_stream_1" },
      error: null,
    });
    expect(businessCreated).toHaveBeenCalledWith("biz_stream_1");
  });

  it("marks detached when the stream ends after created without a terminal event", async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([{ type: "created", businessId: "biz_detached" }, { type: "agent-start", agent: "brand", progress: 5 }]),
    );
    await startGeneration(input);
    expect(getGenerationState()).toMatchObject({
      status: "error",
      error: "detached",
      businessId: "biz_detached",
      result: null,
    });
    // Client recovery: refresh list/detail from the authoritative API (server may still be generating).
    expect(refreshBusinesses).toHaveBeenCalled();
    expect(businessCreated).not.toHaveBeenCalled();
  });
});
