import "server-only";
import { errorCode } from "@/lib/ai/client";
import { isOllamaBaseUrl, resolveLlmProvider } from "@/lib/ai/provider";
import { resolveImageModelForTask, type ImageModelSelection } from "@/lib/ai/routing";
import { fetchSafeHttpsImageBytes, type LookupFn } from "@/lib/ai/safe-image-url";

/**
 * OpenAI image-generation client for logo and brand assets.
 *
 *  - Never throws: every failure resolves to a typed reason so the Logo Agent
 *    can report exactly why no logo exists instead of showing a placeholder.
 *  - Hard timeout + one bounded retry on rate limits, server and network errors.
 *  - Returns validated image bytes; persisting them is the caller's job.
 *  - Ollama (local or cloud) is not image-capable for logos on this stack.
 *  - Default model is GPT Image 2.5 Sunburst (gpt-image-1 shut down 2026-10-23).
 *  - Quality-first: premium tasks use high quality; drafts may use Flare + medium.
 */

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 1;
/** Generated logos are well under this; anything larger is rejected rather than stored. */
export const MAX_IMAGE_BYTES = 8_000_000;

/**
 * True only when a real OpenAI-compatible *image* endpoint is configured.
 * Pointing chat at Ollama must not enable logo generation.
 * Uses the resolved chat provider — an unconfigured / refused provider is not image-capable.
 */
export function isImageGenConfigured(): boolean {
  const chat = resolveLlmProvider();
  if (!chat.configured || !chat.apiKey) return false;
  // If chat is wired to Ollama, do not call /images/generations on that host.
  if (chat.kind === "ollama-local" || chat.kind === "ollama-cloud") return false;
  if (isOllamaBaseUrl(chat.baseUrl)) return false;
  return true;
}

/** Resolves the image model for a premium (default) or draft asset. */
export function imageModel(task: "image-premium" | "image-draft" = "image-premium"): string {
  return resolveImageModelForTask(task).modelId;
}

export function selectImageModel(task: "image-premium" | "image-draft" = "image-premium"): ImageModelSelection {
  return resolveImageModelForTask(task);
}

export type ImageFailure =
  | "not-configured"
  | "rate-limited"
  | "rejected"
  | "provider-error"
  | "timeout"
  | "network"
  | "invalid-response";

export type ImageResult =
  | { ok: true; bytes: Buffer; contentType: "image/png"; model: string; selection: ImageModelSelection }
  | { ok: false; reason: ImageFailure; status?: number; selection?: ImageModelSelection };

interface GenerateOptions {
  prompt: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024";
  background?: "transparent" | "opaque" | "auto";
  timeoutMs?: number;
  /** Premium final assets vs draft/preview — drives model + quality. */
  task?: "image-premium" | "image-draft";
  /** Override quality; defaults from task routing (high for premium, medium for draft). */
  quality?: "low" | "medium" | "high" | "auto";
  /** Test hook for SSRF DNS checks when a provider returns an image URL. */
  lookup?: LookupFn;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function isPng(bytes: Buffer): boolean {
  return bytes.length > PNG_SIGNATURE.length && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}

/** Generates one PNG image. Returns its bytes, or why none was produced. */
export async function generateImage(opts: GenerateOptions, fetchImpl: typeof fetch = fetch): Promise<ImageResult> {
  const selection = resolveImageModelForTask(opts.task ?? "image-premium");
  if (!isImageGenConfigured()) return { ok: false, reason: "not-configured", selection };

  // Use the resolved chat provider base/key so a leftover local OPENAI_BASE_URL
  // cannot divert image calls when OpenAI is primary.
  const chat = resolveLlmProvider();
  const baseUrl = chat.baseUrl.replace(/\/$/, "");
  const apiKey = chat.apiKey ?? process.env.OPENAI_API_KEY ?? "";
  const model = selection.modelId;
  const quality = opts.quality ?? selection.quality;
  let last: ImageResult = { ok: false, reason: "network", selection };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${baseUrl}/images/generations`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          prompt: opts.prompt,
          n: 1,
          size: opts.size ?? "1024x1024",
          background: opts.background ?? "transparent",
          output_format: "png",
          quality,
        }),
      });

      if (!res.ok) {
        // A 429 is also used for an exhausted quota or spending limit, which a retry cannot fix.
        const code = res.status === 429 ? errorCode(await res.json().catch(() => null)) : null;
        const rateLimited = res.status === 429 && (code === null || code.includes("rate_limit"));
        last = {
          ok: false,
          reason: rateLimited ? "rate-limited" : res.status >= 500 ? "provider-error" : "rejected",
          status: res.status,
          selection,
        };
        if ((rateLimited || res.status >= 500) && attempt < MAX_RETRIES) {
          await delay(1500 * (attempt + 1));
          continue;
        }
        return last;
      }

      const json = (await res.json().catch(() => null)) as { data?: { b64_json?: string; url?: string }[] } | null;
      const entry = json?.data?.[0];
      let bytes: Buffer | null = null;
      if (typeof entry?.b64_json === "string") {
        bytes = Buffer.from(entry.b64_json, "base64");
      } else if (typeof entry?.url === "string") {
        // Provider-returned URLs are untrusted: SSRF checks, redirect revalidation,
        // and a hard body cap (not Content-Length alone). No app secrets are forwarded.
        const downloaded = await fetchSafeHttpsImageBytes(entry.url, {
          maxBytes: MAX_IMAGE_BYTES,
          signal: controller.signal,
          fetchImpl,
          ...(opts.lookup ? { lookup: opts.lookup } : {}),
        });
        if (downloaded.ok) bytes = downloaded.bytes;
      }
      if (!bytes || !isPng(bytes) || bytes.length > MAX_IMAGE_BYTES) {
        return { ok: false, reason: "invalid-response", selection };
      }
      return { ok: true, bytes, contentType: "image/png", model, selection };
    } catch {
      // A timed-out render is not retried: a second full wait would outlast the request.
      if (controller.signal.aborted) return { ok: false, reason: "timeout", selection };
      last = { ok: false, reason: "network", selection };
      if (attempt < MAX_RETRIES) {
        await delay(1500 * (attempt + 1));
        continue;
      }
      return last;
    } finally {
      clearTimeout(timeout);
    }
  }
  return last;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
