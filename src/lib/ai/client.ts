import "server-only";
import type { ZodTypeAny } from "zod";
import { resolveLlmProvider, type LlmProviderKind } from "@/lib/ai/provider";
import { isGpt6ChatModel } from "@/lib/ai/models";
import { estimateChatCostUsd } from "@/lib/ai/models";
import { resolveChatModelForTask, type AiTaskCategory, type ModelSelection } from "@/lib/ai/routing";
import { extractJson } from "@/lib/utils";

/**
 * Provider-agnostic LLM client (OpenAI-compatible /chat/completions).
 *
 * Works with OpenAI, Ollama Cloud (https://ollama.com/v1), local Ollama
 * (http://127.0.0.1:11434/v1), and other OpenAI-compatible hosts.
 *
 * Design goals:
 *  - Never throw to callers. Every failure resolves to `data: null` with a
 *    typed note so the deterministic engine can take over and the reason is logged.
 *  - Hard timeout + bounded retries, only for failures a retry can fix
 *    (rate limits, server errors, dropped connections).
 *  - JSON-mode requests with a resilient parser for messy model output.
 *  - Optional Zod schema rejects structurally invalid payloads (llm-invalid-schema).
 *  - OpenAI is optional: Ollama Cloud (OLLAMA_API_KEY) or local Ollama also configure the client.
 */

/** Token usage when the provider returns it — never invented. */
export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Cached prompt tokens when the provider reports them (OpenAI prompt_tokens_details). */
  cachedTokens?: number;
}

export interface LlmCostEstimate {
  usd: number;
  estimated: true;
  modelId: string;
  verifiedOn: string;
  sourceUrl: string;
}

export interface LlmResult<T> {
  data: T | null;
  source: "llm" | "none";
  /**
   * Why there is no data: `llm-unavailable:<reason>` (provider not reached or refused the
   * request), `llm-truncated` (output hit the token limit), `llm-unparseable`,
   * or `llm-invalid-schema` (JSON parsed but failed the agent schema).
   */
  note?: string;
  /** Present only when the provider returned numeric usage fields. */
  usage?: LlmUsage;
  /** Which model was selected and why (no secrets). */
  selection?: ModelSelection;
  /** Catalog-based USD estimate when usage + documented pricing exist — never an invoice. */
  costEstimate?: LlmCostEstimate;
}

const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 2;
/** Consecutive local-Ollama timeouts before remaining agents skip the provider. */
const LOCAL_TIMEOUT_STREAK_OPEN = 2;

/**
 * Permanent provider failures (bad key, inactive billing, exhausted quota) do not
 * recover within a generation run. After the first one, remaining agents in this
 * process skip the provider for a short window instead of each making a doomed
 * request — the failure reason is preserved so every step reports it honestly.
 * Local Ollama also opens after a short streak of timeouts (CPU-bound models
 * rarely recover mid-run; waiting 60–120s per remaining agent only burns the
 * platform time budget).
 */
const CIRCUIT_OPEN_MS = 5 * 60_000;
let circuit: { reason: string; until: number } | null = null;
let localTimeoutStreak = 0;

export interface LlmProviderHealth {
  configured: boolean;
  /** Sanitized permanent-failure reason while the circuit is open, otherwise null. */
  blockedReason: string | null;
  kind: LlmProviderKind | null;
  model: string | null;
  /** Non-secret reason when not configured (e.g. localhost refused in production). */
  configReason: string | null;
  /** How the provider was chosen (no secrets). */
  selectionReason: string | null;
  /** Operator preference: auto | openai | ollama-local | ollama-cloud. */
  preference: string | null;
  /** True when a local OPENAI_BASE_URL was ignored in favor of OpenAI. */
  ignoredLocalBase: boolean;
}

export function getLlmProviderHealth(now = Date.now()): LlmProviderHealth {
  if (circuit && now >= circuit.until) circuit = null;
  const cfg = resolveLlmProvider();
  return {
    configured: cfg.configured,
    blockedReason: circuit?.reason ?? null,
    kind: cfg.configured ? cfg.kind : null,
    model: cfg.configured ? cfg.model : null,
    configReason: cfg.configured ? null : (cfg.reason ?? "not-configured"),
    selectionReason: cfg.selectionReason,
    preference: cfg.preference,
    ignoredLocalBase: Boolean(cfg.ignoredLocalBase),
  };
}

/** Test hook and manual recovery after fixing provider configuration in-process. */
export function resetLlmCircuitBreaker(): void {
  circuit = null;
  localTimeoutStreak = 0;
}

function openCircuit(reason: string): void {
  circuit = { reason, until: Date.now() + CIRCUIT_OPEN_MS };
}

export function isLlmConfigured(): boolean {
  return resolveLlmProvider().configured;
}

export interface ChatOptions {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /**
   * Task category for quality-aware routing (default mode is quality).
   * Per-task OPENAI_MODEL_* overrides always win. Defaults to structured.
   */
  task?: Exclude<AiTaskCategory, "image-premium" | "image-draft">;
  /** Explicit model ID — wins over routing and env task overrides. */
  model?: string;
  /**
   * When set, the parsed JSON object must satisfy this schema or the call
   * returns `data: null` with `note: "llm-invalid-schema"`. Agents that still
   * validate after the call remain correct; this closes the gap where raw JSON
   * was treated as a successful LLM payload.
   */
  schema?: ZodTypeAny;
}

type ChatResult =
  | { ok: true; content: string; truncated: boolean; usage?: LlmUsage; selection: ModelSelection }
  | { ok: false; reason: string; selection?: ModelSelection };

/** Reads OpenAI-compatible usage fields; returns undefined when absent or non-numeric. */
export function readLlmUsage(body: unknown): LlmUsage | undefined {
  const u = (
    body as {
      usage?: {
        prompt_tokens?: unknown;
        completion_tokens?: unknown;
        total_tokens?: unknown;
        prompt_tokens_details?: { cached_tokens?: unknown };
      };
    } | null
  )?.usage;
  if (!u) return undefined;
  const promptTokens = u.prompt_tokens;
  const completionTokens = u.completion_tokens;
  const totalTokens = u.total_tokens;
  if (
    typeof promptTokens !== "number" ||
    typeof completionTokens !== "number" ||
    typeof totalTokens !== "number" ||
    !Number.isFinite(promptTokens) ||
    !Number.isFinite(completionTokens) ||
    !Number.isFinite(totalTokens) ||
    promptTokens < 0 ||
    completionTokens < 0 ||
    totalTokens < 0
  ) {
    return undefined;
  }
  const cachedRaw = u.prompt_tokens_details?.cached_tokens;
  const cachedTokens =
    typeof cachedRaw === "number" && Number.isFinite(cachedRaw) && cachedRaw >= 0 ? cachedRaw : undefined;
  return { promptTokens, completionTokens, totalTokens, ...(cachedTokens != null ? { cachedTokens } : {}) };
}

/** Provider error codes are safe to log; provider messages are not (they can echo part of the key). */
/** The provider's machine-readable error code; its message is never read because it can echo the key. */
export function errorCode(body: unknown): string | null {
  const code = (body as { error?: { code?: unknown; type?: unknown } } | null)?.error;
  const value = typeof code?.code === "string" ? code.code : typeof code?.type === "string" ? code.type : null;
  return value && /^[a-z0-9_.-]{1,60}$/i.test(value) ? value : null;
}

async function chat(opts: ChatOptions, fetchImpl: typeof fetch): Promise<ChatResult> {
  const cfg = resolveLlmProvider();
  const task = opts.task ?? "structured";
  const selection = resolveChatModelForTask(task, { provider: cfg, explicitModel: opts.model });
  if (!cfg.configured) {
    return {
      ok: false,
      reason: cfg.reason === "localhost-in-production" ? "localhost-in-production" : "not-configured",
      selection,
    };
  }
  const health = getLlmProviderHealth();
  if (health.blockedReason) return { ok: false, reason: health.blockedReason, selection };

  const url = `${cfg.baseUrl}/chat/completions`;
  // Agents often pass 60s; local Ollama defaults to 120s for CPU inference — never
  // shorten below the provider default for ollama-local (that caused systematic timeouts
  // with gemma3:1b while still burning the full agent timeout).
  const requested = opts.timeoutMs ?? cfg.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutMs =
    cfg.kind === "ollama-local" ? Math.max(requested, cfg.defaultTimeoutMs) : requested;
  let last: ChatResult = { ok: false, reason: "network", selection };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

      // GPT-6 / reasoning models reject `max_tokens` — use `max_completion_tokens`.
      // They also reject non-default temperature; omit it (API default = 1).
      // Reasoning tokens consume the completion budget — leave headroom for visible JSON.
      const baseMax = opts.maxTokens ?? 2400;
      const effort = selection.reasoningEffort;
      // Reasoning tokens share max_completion_tokens with visible JSON. Too little
      // headroom yields finish_reason=length and honest llm-truncated failures.
      const reasoningHeadroom =
        effort && effort !== "none"
          ? effort === "high" || effort === "xhigh" || effort === "max"
            ? 8_000
            : effort === "medium"
              ? 3_000
              : 1_200
          : 0;
      const tokenCap = baseMax + reasoningHeadroom;
      const gpt6 = isGpt6ChatModel(selection.modelId);
      const body: Record<string, unknown> = {
        model: selection.modelId,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      };
      if (gpt6) {
        body.max_completion_tokens = tokenCap;
      } else {
        body.max_tokens = tokenCap;
      }
      if (effort) {
        body.reasoning_effort = effort;
      }
      // Legacy chat models: temperature is fine. GPT-6: omit (only default 1 is accepted).
      if (!gpt6 && (!effort || effort === "none")) {
        body.temperature = opts.temperature ?? 0.7;
      }

      const res = await fetchImpl(url, {
        method: "POST",
        signal: controller.signal,
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const code = errorCode(await res.json().catch(() => null));
        last = { ok: false, reason: `http-${res.status}${code ? `:${code}` : ""}`, selection };
        // Exhausted quotas and spend limits also answer 429 but do not recover by waiting.
        const transient = (res.status === 429 && (code === null || code.includes("rate_limit"))) || res.status >= 500;
        if (transient && attempt < MAX_RETRIES) {
          await delay(400 * (attempt + 1));
          continue;
        }
        // Permanent failures open the circuit so the rest of this process's
        // agents report the same reason immediately instead of re-calling.
        if (res.status === 401 || res.status === 403 || (res.status === 429 && !transient)) {
          openCircuit(last.reason);
        }
        return last;
      }

      const json = (await res.json().catch(() => null)) as {
        choices?: { message?: { content?: string }; finish_reason?: string }[];
        usage?: unknown;
      } | null;
      const choice = json?.choices?.[0];
      const content = choice?.message?.content;
      if (typeof content !== "string") return { ok: false, reason: "empty-response", selection };
      circuit = null;
      localTimeoutStreak = 0;
      const usage = readLlmUsage(json);
      return { ok: true, content, truncated: choice?.finish_reason === "length", selection, ...(usage ? { usage } : {}) };
    } catch {
      // A timed-out request is not retried: further full waits would stall the whole generation.
      if (controller.signal.aborted) {
        if (cfg.kind === "ollama-local") {
          localTimeoutStreak += 1;
          if (localTimeoutStreak >= LOCAL_TIMEOUT_STREAK_OPEN) openCircuit("timeout");
        }
        return { ok: false, reason: "timeout", selection };
      }
      last = { ok: false, reason: "network", selection };
      if (attempt < MAX_RETRIES) {
        await delay(400 * (attempt + 1));
        continue;
      }
      return last;
    } finally {
      clearTimeout(timeout);
    }
  }
  return last;
}

/**
 * Requests structured JSON from the LLM and parses it. Returns `{ data: null }` with
 * the reason when the provider is unconfigured, unreachable, refuses the request,
 * cuts the output off at the token limit, or returns unparseable text.
 */
function withMeta<T>(base: { data: T | null; source: "llm" | "none"; note?: string }, res: ChatResult): LlmResult<T> {
  const selection = res.selection;
  const usage = res.ok ? res.usage : undefined;
  const costEstimate =
    usage && selection ? estimateChatCostUsd(selection.modelId, usage) ?? undefined : undefined;
  return {
    data: base.data,
    source: base.source,
    ...(base.note ? { note: base.note } : {}),
    ...(selection ? { selection } : {}),
    ...(usage ? { usage } : {}),
    ...(costEstimate ? { costEstimate } : {}),
  };
}

export async function generateJson<T>(opts: ChatOptions, fetchImpl: typeof fetch = fetch): Promise<LlmResult<T>> {
  const res = await chat(
    {
      ...opts,
      system: `${opts.system}\n\nYou MUST respond with a single, valid JSON object. No prose, no markdown fences.`,
    },
    fetchImpl,
  );
  if (!res.ok) return withMeta<T>({ data: null, source: "none", note: `llm-unavailable:${res.reason}` }, res);
  // Truncated JSON can still parse after repair, but it would silently drop the missing fields.
  if (res.truncated) return withMeta<T>({ data: null, source: "none", note: "llm-truncated" }, res);
  if (!res.content.trim()) return withMeta<T>({ data: null, source: "none", note: "llm-unavailable:empty-response" }, res);

  const parsed = extractJson<unknown>(res.content);
  // Contract is a single JSON object. Arrays/primitives/`null` are not valid agent payloads.
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return withMeta<T>({ data: null, source: "none", note: "llm-unparseable" }, res);
  }
  if (opts.schema) {
    const validated = opts.schema.safeParse(parsed);
    if (!validated.success) {
      return withMeta<T>({ data: null, source: "none", note: "llm-invalid-schema" }, res);
    }
    return withMeta<T>({ data: validated.data as T, source: "llm" }, res);
  }
  return withMeta<T>({ data: parsed as T, source: "llm" }, res);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
