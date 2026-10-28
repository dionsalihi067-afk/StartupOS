import { describe, expect, it } from "vitest";
import {
  buildPublishableWebsite,
  publicationFingerprint,
  publicationStatus,
  publishableWebsiteSchema,
  publicSlugBase,
  publicSlugCandidates,
  publicSitePath,
  publicSiteUrl,
  resolvePublishedPage,
  type PublishableWebsite,
} from "@/lib/website/publish";
import type { WebsiteSpec } from "@/lib/website/model";
import { makePackage } from "@/test/db";
import { makeWebsiteCore, makeWebsiteSpec } from "@/test/website";

const spec = (): WebsiteSpec => structuredClone(makeWebsiteSpec());

function site(input: WebsiteSpec = spec()): PublishableWebsite {
  const built = buildPublishableWebsite(input);
  if (!built.ok) throw new Error("expected a publishable website");
  return built.site;
}

describe("publishable website", () => {
  it("assembles every page with its metadata, preserving order, slugs, theme and navigation", () => {
    const source = spec();
    const published = site(source);
    expect(publishableWebsiteSchema.safeParse(published).success).toBe(true);
    expect(published.pages.map((p) => p.slug)).toEqual(source.pages.map((p) => p.slug));
    expect(published.navigation).toEqual(source.navigation);
    expect(published.theme).toEqual(source.theme);
    expect(published.language).toBe(source.language);
    expect(published.pages.map((p) => p.sections)).toEqual(source.pages.map((p) => p.sections));
    const home = published.pages[0]!;
    expect(home.metadata).toEqual({
      title: home.seo.title,
      description: home.seo.description,
      canonicalPath: "/",
      locale: source.language,
      siteName: source.siteName,
      openGraph: { type: "website", title: home.seo.title, description: home.seo.description, siteName: source.siteName },
    });
  });

  it("is deterministic", () => {
    expect(site()).toEqual(site());
    expect(publicationFingerprint(site())).toBe(publicationFingerprint(site()));
    expect(publicationFingerprint(site())).toMatch(/^[0-9a-f]{14}$/);
  });

  it("preserves pricing and localized content verbatim", () => {
    const source = spec();
    source.language = "sq";
    source.pages[0]!.sections.push({
      type: "pricing",
      id: "pricing",
      heading: "Çmimet",
      tiers: [{ name: "Bazë", price: "1.200 ALL", cadence: "/muaj", features: [], highlighted: false }],
    });
    const published = site(source);
    expect(published.pages[0]!.metadata.locale).toBe("sq");
    expect(published.pages[0]!.sections.at(-1)).toEqual(source.pages[0]!.sections.at(-1));
  });

  it("uses the validated logo as the page icon", () => {
    const source = spec();
    source.theme.logoUrl = "https://cdn.example.com/logo.png";
    expect(site(source).pages.every((p) => p.metadata.icon === "https://cdn.example.com/logo.png")).toBe(true);
  });

  it("refuses invalid websites instead of repairing them", () => {
    const duplicate = spec();
    duplicate.pages.push({ ...duplicate.pages[0]!, id: "again" });
    const badSlug = spec();
    badSlug.pages[1] = { ...badSlug.pages[1]!, slug: "/About Us", seo: { ...badSlug.pages[1]!.seo, canonicalPath: "/About Us" } };
    const badLink = spec();
    badLink.navigation.push({ label: "Shop", href: "/shop" });
    const unsafeAsset = spec();
    unsafeAsset.theme.logoUrl = "javascript:alert(1)";
    const missingMetadata = spec();
    missingMetadata.pages[0]!.seo.description = "";
    for (const invalid of [undefined, null, {}, "<html>", duplicate, badSlug, badLink, unsafeAsset, missingMetadata]) {
      expect(buildPublishableWebsite(invalid)).toEqual({ ok: false, reason: "invalidWebsite" });
    }
  });

  it("rejects publishable data whose metadata does not match its content", () => {
    const published = site();
    const tampered = structuredClone(published);
    tampered.pages[0]!.metadata.title = "Rated #1 in Tirana";
    expect(publishableWebsiteSchema.safeParse(tampered).success).toBe(false);
    const canonical = structuredClone(published);
    canonical.pages[0]!.metadata.canonicalPath = "/elsewhere";
    expect(publishableWebsiteSchema.safeParse(canonical).success).toBe(false);
  });

  it("cannot carry scripts, iframes, javascript: URLs, event handlers or external navigation", () => {
    const injections: ((s: WebsiteSpec) => void)[] = [
      (s) => (s.primaryCta = { label: "Go", href: "javascript:alert(1)" }),
      (s) => (s.navigation[0] = { label: "Out", href: "https://evil.example" }),
      (s) => (s.navigation[0] = { label: "Out", href: "//evil.example" }),
      (s) => (s.theme.logoUrl = "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+"),
      (s) => (s.theme.colors.primary = "#000\" onload=\"alert(1)"),
      (s) => ((s.pages[0]!.sections as unknown[]).push({ type: "html", id: "raw", heading: "x", html: "<script>alert(1)</script>" })),
      (s) => ((s.pages[0]!.sections as unknown[]).push({ type: "embed", id: "frame", heading: "x", src: "<iframe src=//evil>" })),
    ];
    for (const inject of injections) {
      const s = spec();
      inject(s);
      expect(buildPublishableWebsite(s).ok).toBe(false);
    }
  });
});

describe("page resolution", () => {
  const published = site();

  it("resolves the homepage", () => {
    for (const path of ["/", "", " / "]) {
      const r = resolvePublishedPage(published, path);
      expect(r.ok && r.page.slug).toBe("/");
    }
  });

  it("resolves other pages, tolerating a missing leading or trailing slash", () => {
    for (const path of ["/contact", "contact", "/contact/"]) {
      const r = resolvePublishedPage(published, path);
      expect(r.ok && r.page.slug).toBe("/contact");
    }
  });

  it("returns a typed not-found result for unknown or malformed paths", () => {
    for (const path of ["/missing", "/Contact", "//evil.example", "https://evil.example", "javascript:alert(1)", "/../contact", 42, null, "/x".repeat(150)]) {
      expect(resolvePublishedPage(published, path)).toEqual({ ok: false, reason: "notFound" });
    }
  });
});

describe("publication status", () => {
  const base = makePackage().website;
  const core = makeWebsiteCore("Home");

  it("is unavailable without a stored specification", () => {
    expect(publicationStatus(base)).toBe("unavailable");
  });

  it("moves from draft to prepared, published, outdated and unpublished", () => {
    const website = { ...base, ...core };
    expect(publicationStatus(website)).toBe("draft");
    const fingerprint = publicationFingerprint(site(core.spec));
    const prepared = { ...website, publication: { preparedAt: "2026-10-08T12:00:00.000Z", fingerprint } };
    expect(publicationStatus(prepared)).toBe("prepared");
    const published = {
      ...website,
      publication: {
        preparedAt: "2026-10-08T12:00:00.000Z",
        fingerprint,
        publicSlug: "kafeja",
        publishedAt: "2026-10-08T13:00:00.000Z",
        publishedFingerprint: fingerprint,
        live: true,
      },
    };
    expect(publicationStatus(published)).toBe("published");
    const regenerated = { ...published, ...makeWebsiteCore("Regenerated home") };
    expect(publicationStatus(regenerated)).toBe("outdated");
    expect(publicationStatus({ ...published, publication: { ...published.publication, live: false } })).toBe("unpublished");
  });
});

describe("public slug helpers", () => {
  it("normalizes names and skips reserved words", () => {
    expect(publicSlugBase("Kafeja Drita")).toBe("kafeja-drita");
    expect(publicSlugBase("Login")).toMatch(/^site-/);
    expect(publicSlugCandidates("Kafeja")[0]).toBe("kafeja");
    expect(publicSitePath("kafeja")).toBe("/s/kafeja");
    expect(publicSitePath("kafeja", "/contact")).toBe("/s/kafeja/contact");
    expect(publicSiteUrl("kafeja", "/", "https://app.example.com")).toBe("https://app.example.com/s/kafeja");
    expect(publicSiteUrl("kafeja", "/", null)).toBe("/s/kafeja");
  });
});
