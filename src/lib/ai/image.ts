import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * OpenAI image-generation client for real logo assets.
 *
 * Design goals (mirrors the chat client):
 *  - Never throw to callers — every failure resolves to `null` so the Logo
 *    Agent can report an explicit "generation failed" state instead of
 *    fabricating a placeholder.
 *  - Hard timeout + bounded retries so a slow provider can't hang generation.
 *  - Persists the returned PNG to /public so the package stores a real,
 *    durable URL (never a multi-megabyte data URL that would blow localStorage).
 */

const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_RETRIES = 1;
const OUTPUT_DIR = path.join(process.cwd(), "public", "generated", "logos");
const PUBLIC_PREFIX = "/generated/logos";

export function isImageGenConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0);
}

export function imageModel(): string {
  return process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
}

export interface GeneratedImage {
  /** Public URL path (served from /public), e.g. /generated/logos/abc.png */
  url: string;
  model: string;
}

interface GenerateOptions {
  prompt: string;
  /** Base filename (without extension); a uid is appended to guarantee uniqueness. */
  fileBase: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024";
  background?: "transparent" | "opaque" | "auto";
  timeoutMs?: number;
}

/**
 * Generates a single image via OpenAI and writes it to /public/generated/logos.
 * Returns the public URL, or `null` on any failure.
 */
export async function generateImageAsset(opts: GenerateOptions): Promise<GeneratedImage | null> {
  if (!isImageGenConfigured()) return null;

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = imageModel();
  const url = `${baseUrl}/images/generations`;

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
          prompt: opts.prompt,
          n: 1,
          size: opts.size ?? "1024x1024",
          background: opts.background ?? "transparent",
          output_format: "png",
        }),
      });

      clearTimeout(timeout);

      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          await delay(800 * (attempt + 1));
          continue;
        }
        return null;
      }

      const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
      const entry = json.data?.[0];

      let buffer: Buffer | null = null;
      if (entry?.b64_json) {
        buffer = Buffer.from(entry.b64_json, "base64");
      } else if (entry?.url) {
        // Some providers/models return a temporary URL instead of b64.
        const imgRes = await fetch(entry.url);
        if (!imgRes.ok) return null;
        buffer = Buffer.from(await imgRes.arrayBuffer());
      }
      if (!buffer || buffer.length === 0) return null;

      const fileName = `${sanitize(opts.fileBase)}-${randomId()}.png`;
      await mkdir(OUTPUT_DIR, { recursive: true });
      await writeFile(path.join(OUTPUT_DIR, fileName), buffer);

      return { url: `${PUBLIC_PREFIX}/${fileName}`, model };
    } catch {
      clearTimeout(timeout);
      if (attempt < MAX_RETRIES) {
        await delay(800 * (attempt + 1));
        continue;
      }
      return null;
    }
  }
  return null;
}

function sanitize(base: string): string {
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "logo"
  );
}

function randomId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
