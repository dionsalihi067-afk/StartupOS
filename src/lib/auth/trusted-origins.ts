const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Strip a trailing DNS dot so `https://app.example.com.` matches the bare host. */
function canonicalHost(hostname: string): string {
  return hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
}

function canonicalOrigin(parsed: URL): string {
  const host = canonicalHost(parsed.hostname);
  const port = parsed.port ? `:${parsed.port}` : "";
  return `${parsed.protocol}//${host}${port}`;
}

/**
 * Origins Better Auth should accept for credential POSTs.
 * Loopback hosts are aliased both ways (`localhost` ↔ `127.0.0.1`) so opening
 * the app at either address does not fail with INVALID_ORIGIN when
 * BETTER_AUTH_URL names the other. Non-loopback origins are never widened.
 * Matching uses parsed origin components — never substring suffix trust.
 */
export function authTrustedOrigins(...urls: Array<string | undefined>): string[] {
  const origins = new Set<string>();
  for (const raw of urls) {
    if (!raw) continue;
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      continue;
    }
    // Reject non-http(s) schemes and credential-bearing URLs used as trust seeds.
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    if (parsed.username || parsed.password) continue;

    const origin = canonicalOrigin(parsed);
    origins.add(origin);
    const host = canonicalHost(parsed.hostname);
    if (LOOPBACK_HOSTS.has(host)) {
      const port = parsed.port ? `:${parsed.port}` : "";
      for (const loopback of LOOPBACK_HOSTS) {
        origins.add(`${parsed.protocol}//${loopback}${port}`);
      }
    }
  }
  return [...origins];
}
