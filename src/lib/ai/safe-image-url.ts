import "server-only";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF-aware helpers for downloading provider image URLs.
 *
 * Provider-returned URLs are untrusted destinations: never forward app secrets,
 * never follow redirects blindly, never buffer unbounded bodies.
 */

export type SafeUrlFailure =
  | "invalid-url"
  | "unsupported-scheme"
  | "blocked-host"
  | "blocked-ip"
  | "dns-failed"
  | "redirect-limit"
  | "redirect-invalid"
  | "too-large"
  | "network"
  | "http-error";

export type LookupFn = (hostname: string) => Promise<{ address: string; family: number }>;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google.com",
  "instance-data",
]);

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = (n << 8) + v;
  }
  return n >>> 0;
}

/** True for loopback, RFC1918, link-local, CGNAT, and other non-public IPv4. */
export function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n == null) return true;
  const inRange = (base: string, bits: number) => {
    const b = ipv4ToInt(base)!;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (b & mask);
  };
  return (
    inRange("0.0.0.0", 8) ||
    inRange("10.0.0.0", 8) ||
    inRange("127.0.0.0", 8) ||
    inRange("169.254.0.0", 16) ||
    inRange("172.16.0.0", 12) ||
    inRange("192.168.0.0", 16) ||
    inRange("100.64.0.0", 10) || // CGNAT
    inRange("192.0.0.0", 24) ||
    inRange("192.0.2.0", 24) ||
    inRange("198.51.100.0", 24) ||
    inRange("203.0.113.0", 24) ||
    inRange("224.0.0.0", 4) ||
    inRange("240.0.0.0", 4)
  );
}

/** True for loopback, ULA, link-local IPv6 (and IPv4-mapped private). */
export function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // ULA fc00::/7
  if (normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("ff")) return true; // multicast
  // IPv4-mapped ::ffff:a.b.c.d
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return isBlockedIpv4(mapped[1]!);
  const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1]!, 16);
    const lo = parseInt(mappedHex[2]!, 16);
    const a = (hi >> 8) & 0xff;
    const b = hi & 0xff;
    const c = (lo >> 8) & 0xff;
    const d = lo & 0xff;
    return isBlockedIpv4(`${a}.${b}.${c}.${d}`);
  }
  return false;
}

export function isBlockedIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "metadata" || host.endsWith(".metadata.google.internal")) return true;
  const ipFamily = isIP(host);
  if (ipFamily === 4 || ipFamily === 6) return isBlockedIp(host);
  return false;
}

export function parseHttpsImageUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: SafeUrlFailure } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid-url" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "unsupported-scheme" };
  if (url.username || url.password) return { ok: false, reason: "invalid-url" };
  if (isBlockedHostname(url.hostname)) return { ok: false, reason: "blocked-host" };
  return { ok: true, url };
}

export async function assertPublicHostname(
  hostname: string,
  lookup: LookupFn = (h) => dnsLookup(h, { all: false }),
): Promise<{ ok: true; address: string } | { ok: false; reason: SafeUrlFailure }> {
  if (isBlockedHostname(hostname)) return { ok: false, reason: "blocked-host" };
  const ipLiteral = isIP(hostname);
  if (ipLiteral) {
    return isBlockedIp(hostname) ? { ok: false, reason: "blocked-ip" } : { ok: true, address: hostname };
  }
  try {
    const { address } = await lookup(hostname);
    if (isBlockedIp(address)) return { ok: false, reason: "blocked-ip" };
    return { ok: true, address };
  } catch {
    return { ok: false, reason: "dns-failed" };
  }
}

/** Reads a response body while enforcing a hard byte cap (works without Content-Length). */
export async function readBoundedResponseBody(
  res: Response,
  maxBytes: number,
): Promise<{ ok: true; bytes: Buffer } | { ok: false; reason: "too-large" | "network" }> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too-large" };

  if (!res.body) {
    try {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > maxBytes) return { ok: false, reason: "too-large" };
      return { ok: true, bytes: buf };
    } catch {
      return { ok: false, reason: "network" };
    }
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return { ok: false, reason: "network" };
  }
  return { ok: true, bytes: Buffer.concat(chunks) };
}

export interface FetchSafeImageOptions {
  maxBytes: number;
  signal?: AbortSignal;
  maxRedirects?: number;
  fetchImpl?: typeof fetch;
  lookup?: LookupFn;
}

/**
 * Downloads an HTTPS image URL with SSRF checks, redirect revalidation, and a hard body cap.
 * Never attaches Authorization or other app secrets to the destination request.
 */
export async function fetchSafeHttpsImageBytes(
  rawUrl: string,
  opts: FetchSafeImageOptions,
): Promise<{ ok: true; bytes: Buffer } | { ok: false; reason: SafeUrlFailure }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxRedirects = opts.maxRedirects ?? 3;
  let current = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const parsed = parseHttpsImageUrl(current);
    if (!parsed.ok) return parsed;

    const resolved = await assertPublicHostname(parsed.url.hostname, opts.lookup);
    if (!resolved.ok) return resolved;

    let res: Response;
    try {
      res = await fetchImpl(parsed.url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: opts.signal,
        // Explicitly empty — never forward OpenAI or session credentials.
        headers: { Accept: "image/png,image/*,*/*;q=0.8" },
      });
    } catch {
      return { ok: false, reason: "network" };
    }

    if (res.status >= 300 && res.status < 400) {
      if (hop === maxRedirects) return { ok: false, reason: "redirect-limit" };
      const location = res.headers.get("location");
      if (!location) return { ok: false, reason: "redirect-invalid" };
      try {
        current = new URL(location, parsed.url).toString();
      } catch {
        return { ok: false, reason: "redirect-invalid" };
      }
      continue;
    }

    if (!res.ok) return { ok: false, reason: "http-error" };
    return readBoundedResponseBody(res, opts.maxBytes);
  }

  return { ok: false, reason: "redirect-limit" };
}
