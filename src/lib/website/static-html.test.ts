import { describe, expect, it } from "vitest";
import { buildStaticHomepageHtml, buildStaticWebsiteBundleHtml, buildStaticWebsiteFiles } from "@/lib/website/static-html";
import type { PublishableWebsite } from "@/lib/website/publish";

const site = {
  version: 1,
  siteName: "Kafe Drita",
  tagline: "Slow coffee",
  language: "en",
  theme: {
    colors: { primary: "#0f766e", secondary: "#0d9488", accent: "#5eead4", ink: "#12201c", surface: "#ffffff", onPrimary: "#ffffff" },
    fonts: { heading: "serif", headingFallback: "serif", body: "sans", bodyFallback: "sans" },
  },
  primaryCta: { label: "Visit", href: "/contact" },
  navigation: [
    { label: "Home", href: "/" },
    { label: "Contact", href: "/contact" },
  ],
  pages: [
    {
      id: "home",
      slug: "/",
      label: "Home",
      seo: { title: "Kafe Drita", description: "Specialty coffee in Tirana for remote workers.", canonicalPath: "/" },
      sections: [
        {
          type: "hero",
          id: "hero",
          heading: "Specialty coffee in Tirana",
          subheading: "For remote workers",
          primaryCta: { label: "Contact", href: "/contact" },
        },
      ],
      metadata: {
        title: "Kafe Drita",
        description: "Specialty coffee in Tirana for remote workers.",
        canonicalPath: "/",
        locale: "en",
        siteName: "Kafe Drita",
        openGraph: { type: "website", title: "Kafe Drita", description: "Specialty coffee in Tirana for remote workers.", siteName: "Kafe Drita" },
      },
    },
    {
      id: "contact",
      slug: "/contact",
      label: "Contact",
      seo: { title: "Contact — Kafe Drita", description: "Reach Kafe Drita in Tirana for coffee questions.", canonicalPath: "/contact" },
      sections: [
        {
          type: "contact",
          id: "c1",
          heading: "Contact",
          details: [{ label: "Email", value: "hello@example.com" }],
          channelsPending: false,
          actions: [],
        },
      ],
      metadata: {
        title: "Contact — Kafe Drita",
        description: "Reach Kafe Drita in Tirana for coffee questions.",
        canonicalPath: "/contact",
        locale: "en",
        siteName: "Kafe Drita",
        openGraph: {
          type: "website",
          title: "Contact — Kafe Drita",
          description: "Reach Kafe Drita in Tirana for coffee questions.",
          siteName: "Kafe Drita",
        },
      },
    },
  ],
} as PublishableWebsite;

describe("static website export", () => {
  it("builds navigable HTML files with business content", () => {
    const files = buildStaticWebsiteFiles(site);
    expect(files.some((f) => f.path === "index.html")).toBe(true);
    expect(files.some((f) => f.path === "contact.html")).toBe(true);
    const home = files.find((f) => f.path === "index.html")!.contents;
    expect(home).toContain("Specialty coffee in Tirana");
    expect(home).toContain('href="contact.html"');
    expect(home).toContain("Static export from StartupOS");
  });

  it("homepage helper includes the brand name", () => {
    expect(buildStaticHomepageHtml(site)).toContain("Kafe Drita");
  });

  it("bundle export includes every page in one document", () => {
    const html = buildStaticWebsiteBundleHtml(site);
    expect(html).toContain("id=\"home\"");
    expect(html).toContain("id=\"contact\"");
    expect(html).toContain("Specialty coffee in Tirana");
  });

  it("rewrites internal CTAs to in-document anchors in the bundle (not .html files)", () => {
    const html = buildStaticWebsiteBundleHtml(site);
    expect(html).toContain('href="#contact"');
    expect(html).not.toContain('href="contact.html"');
    expect(html).toContain('href="#home"');
  });

  it("escapes user-controlled text and blocks javascript hrefs", () => {
    const hostile = {
      ...site,
      siteName: `Kafe <script>alert(1)</script>`,
      pages: [
        {
          ...site.pages[0]!,
          sections: [
            {
              type: "hero" as const,
              id: "hero",
              heading: `Hello "World" & friends`,
              subheading: `<img src=x onerror=alert(1)>`,
              primaryCta: { label: "Hack", href: "javascript:alert(1)" },
            },
          ],
        },
      ],
    } as PublishableWebsite;
    const html = buildStaticHomepageHtml(hostile);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;");
    expect(html).toContain("&amp;");
    expect(html).toContain('href="#"');
    expect(html).not.toMatch(/href=["']javascript:/i);
  });

  it("keeps multi-file export linking between page files", () => {
    const files = buildStaticWebsiteFiles(site);
    const home = files.find((f) => f.path === "index.html")!.contents;
    expect(home).toContain('href="contact.html"');
  });
});
