import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  assertPublicHostname,
  fetchSafeHttpsImageBytes,
  isBlockedHostname,
  isBlockedIp,
  isBlockedIpv4,
  parseHttpsImageUrl,
  readBoundedResponseBody,
} from "@/lib/ai/safe-image-url";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3]);

describe("isBlockedIp / hostname", () => {
  it("blocks private, loopback, link-local and metadata-style hosts", () => {
    expect(isBlockedIpv4("127.0.0.1")).toBe(true);
    expect(isBlockedIpv4("10.0.0.5")).toBe(true);
    expect(isBlockedIpv4("192.168.1.1")).toBe(true);
    expect(isBlockedIpv4("169.254.169.254")).toBe(true);
    expect(isBlockedIpv4("172.16.9.1")).toBe(true);
    expect(isBlockedIpv4("8.8.8.8")).toBe(false);
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("fc00::1")).toBe(true);
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("foo.local")).toBe(true);
    expect(isBlockedHostname("metadata.google.internal")).toBe(true);
    expect(isBlockedHostname("cdn.openai.com")).toBe(false);
  });
});

describe("parseHttpsImageUrl", () => {
  it("allows only bare https URLs", () => {
    expect(parseHttpsImageUrl("https://cdn.example.com/a.png").ok).toBe(true);
    expect(parseHttpsImageUrl("http://cdn.example.com/a.png")).toMatchObject({ ok: false, reason: "unsupported-scheme" });
    expect(parseHttpsImageUrl("https://user:pass@cdn.example.com/a.png")).toMatchObject({ ok: false, reason: "invalid-url" });
    expect(parseHttpsImageUrl("https://127.0.0.1/a.png")).toMatchObject({ ok: false, reason: "blocked-host" });
    expect(parseHttpsImageUrl("file:///etc/passwd")).toMatchObject({ ok: false, reason: "unsupported-scheme" });
  });
});

describe("assertPublicHostname", () => {
  it("rejects DNS results that resolve to private addresses", async () => {
    const lookup = vi.fn(async () => ({ address: "10.1.2.3", family: 4 }));
    expect(await assertPublicHostname("evil.example", lookup)).toMatchObject({ ok: false, reason: "blocked-ip" });
    const publicLookup = vi.fn(async () => ({ address: "1.1.1.1", family: 4 }));
    expect(await assertPublicHostname("cdn.example", publicLookup)).toMatchObject({ ok: true, address: "1.1.1.1" });
  });
});

describe("readBoundedResponseBody", () => {
  it("enforces the limit while streaming without Content-Length", async () => {
    const chunks = [Buffer.alloc(100, 1), Buffer.alloc(100, 2), Buffer.alloc(100, 3)];
    let i = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (i >= chunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(chunks[i++]!);
      },
    });
    const res = new Response(stream, { status: 200 });
    expect(await readBoundedResponseBody(res, 250)).toMatchObject({ ok: false, reason: "too-large" });
  });

  it("accepts bodies under the cap", async () => {
    const res = new Response(PNG, { status: 200 });
    const out = await readBoundedResponseBody(res, 1000);
    expect(out.ok && out.bytes.equals(PNG)).toBe(true);
  });
});

describe("fetchSafeHttpsImageBytes", () => {
  it("rejects SSRF destinations before fetching", async () => {
    const fetchImpl = vi.fn();
    expect(
      await fetchSafeHttpsImageBytes("https://127.0.0.1/secret", {
        maxBytes: 1000,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        lookup: async () => ({ address: "127.0.0.1", family: 4 }),
      }),
    ).toMatchObject({ ok: false, reason: "blocked-host" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("revalidates redirects and never forwards Authorization", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { Location: "https://cdn.example.com/final.png" } }),
      )
      .mockResolvedValueOnce(new Response(PNG, { status: 200, headers: { "Content-Type": "image/png" } }));

    const out = await fetchSafeHttpsImageBytes("https://cdn.example.com/start.png", {
      maxBytes: 1000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookup: async () => ({ address: "1.1.1.1", family: 4 }),
    });
    expect(out.ok && out.bytes.equals(PNG)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const call of fetchImpl.mock.calls) {
      const init = call[1] as RequestInit;
      expect(init.redirect).toBe("manual");
      const headers = new Headers(init.headers);
      expect(headers.get("Authorization")).toBeNull();
    }
  });

  it("blocks redirects into private space", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { Location: "https://169.254.169.254/latest/meta-data/" } }),
    );
    expect(
      await fetchSafeHttpsImageBytes("https://cdn.example.com/start.png", {
        maxBytes: 1000,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        lookup: async () => ({ address: "1.1.1.1", family: 4 }),
      }),
    ).toMatchObject({ ok: false, reason: "blocked-host" });
  });
});
