import "server-only";
import { extractJson } from "@/lib/utils";

/**
 * Provider-agnostic LLM client (OpenAI-compatible /chat/completions).
 *
 * Design goals:
 *  - Never throw to callers. Every failure resolves to `null` so the
 *    deterministic engine can seamlessly take over.
 *  - Hard timeout + bounded retries so a slow provider can't hang generation.
 *  - JSON-mode requests with a resilient parser for messy model output.
 */

export interface LlmResult<T> {
  data: T | null;
  source: "llm" | "none";
  note?: string;
}

const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 2;

export function isLlmConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0);
}

interface ChatOptions {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

async function chat(opts: ChatOptions): Promise<string | null> {
  if (!isLlmConfigured()) return null;

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const url = `${baseUrl}/chat/completions`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          temperature: opts.temperature ?? 0.7,
          max_tokens: opts.maxTokens ?? 2400,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content: opts.user },
          ],
        }),
      });

      clearTimeout(timeout);

      if (!res.ok) {
        // Retry on rate-limit / server errors only.
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          await delay(400 * (attempt + 1));
          continue;
        }
        return null;
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content;
      return typeof content === "string" ? content : null;
    } catch {
      clearTimeout(timeout);
      if (attempt < MAX_RETRIES) {
        await delay(400 * (attempt + 1));
        continue;
      }
      return null;
    }
  }
  return null;
}

/**
 * Requests structured JSON from the LLM and parses it. Returns `{ data: null }`
 * when the provider is unconfigured, unreachable, or returns unparseable text.
 */
export async function generateJson<T>(opts: ChatOptions): Promise<LlmResult<T>> {
  const raw = await chat({
    ...opts,
    system: `${opts.system}\n\nYou MUST respond with a single, valid JSON object. No prose, no markdown fences.`,
  });
  if (raw === null) return { data: null, source: "none", note: "llm-unavailable" };

  const parsed = extractJson<T>(raw);
  if (parsed === null) return { data: null, source: "none", note: "unparseable" };
  return { data: parsed, source: "llm" };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
