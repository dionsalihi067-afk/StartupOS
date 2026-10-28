/** Small dependency-free utilities used across StartupOS. */

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "page";
}

export function titleCase(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Lowercases only the first letter so owner text reads naturally mid-sentence
 * without destroying proper nouns ("Women in Kosovo" → "women in Kosovo").
 * Acronyms such as "SMEs" or "B2B" are left as typed.
 */
export function midSentence(input: string): string {
  const text = input.trim();
  if (/^\p{Lu}[\p{Ll}\s'-]/u.test(text)) return text.charAt(0).toLowerCase() + text.slice(1);
  return text;
}

export function uid(prefix = "id"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

/**
 * Deterministic, seedable PRNG (mulberry32). Used by the deterministic engine
 * so that the same business input always yields the same — yet non-repetitive —
 * assets. This keeps output reproducible while still feeling bespoke.
 */
export function createRng(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: () => number, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error("pick(): empty array");
  return arr[Math.floor(rng() * arr.length)] as T;
}

export function pickN<T>(rng: () => number, arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < n && pool.length > 0) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool.splice(i, 1)[0] as T);
  }
  return out;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Extracts the first valid JSON object/array from arbitrary LLM text.
 * Handles markdown fences, leading prose, and trailing commentary.
 * Returns null if nothing parseable is found.
 */
export function extractJson<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  let text = raw.trim();

  // Strip markdown code fences.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) text = fence[1].trim();

  // Fast path.
  try {
    return JSON.parse(text) as T;
  } catch {
    /* fall through to bracket scan */
  }

  const start = text.search(/[[{]/);
  if (start === -1) return null;

  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try {
          return JSON.parse(candidate) as T;
        } catch {
          return tryLooseParse<T>(candidate);
        }
      }
    }
  }
  return tryLooseParse<T>(text.slice(start));
}

function tryLooseParse<T>(candidate: string): T | null {
  // Remove trailing commas, common LLM JSON defect.
  const cleaned = candidate.replace(/,\s*([}\]])/g, "$1");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

/** Escapes a string for safe inclusion in trusted SVG/HTML markup (creatives, emails). */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function nonEmpty(value: string | undefined | null, fallback: string): string {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : fallback;
}

export function ensureArray<T>(value: T[] | undefined | null, fallback: T[]): T[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  return value.filter((v) => v !== null && v !== undefined);
}
