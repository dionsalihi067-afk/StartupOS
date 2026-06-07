"use client";

import * as React from "react";
import { Globe, Monitor, Smartphone } from "lucide-react";
import type { Brand, Website, WebsitePage, WebsiteSection as WSection } from "@/lib/types";
import { Card, CardBody, SectionTitle, Badge } from "@/components/ui/primitives";
import { CopyButton, DownloadButton } from "@/components/ui/actions";
import { downloadJson } from "@/lib/client/download";
import { getSwatch, readableTextColor } from "@/lib/engine/color";
import { cn, slugify } from "@/lib/utils";

export function WebsiteSection({ website, brand }: { website: Website; brand: Brand }) {
  const [pageIdx, setPageIdx] = React.useState(0);
  const [device, setDevice] = React.useState<"desktop" | "mobile">("desktop");
  const page = website.pages[pageIdx] ?? website.pages[0];

  if (!page) return <p className="text-ink-muted">No website pages generated.</p>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <SectionTitle eyebrow="Website Agent" title="Live website preview" description="A real, multi-page website rendered with your brand system." />
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border bg-surface p-0.5">
            <button onClick={() => setDevice("desktop")} className={cn("flex h-8 w-9 items-center justify-center rounded-md transition", device === "desktop" ? "bg-brand text-white" : "text-ink-muted")} aria-label="Desktop">
              <Monitor size={16} />
            </button>
            <button onClick={() => setDevice("mobile")} className={cn("flex h-8 w-9 items-center justify-center rounded-md transition", device === "mobile" ? "bg-brand text-white" : "text-ink-muted")} aria-label="Mobile">
              <Smartphone size={16} />
            </button>
          </div>
          <DownloadButton label="Export JSON" onDownload={() => downloadJson(`${slugify(brand.name)}-website.json`, website)} />
        </div>
      </div>

      {/* Page tabs */}
      <div className="flex flex-wrap gap-2">
        {website.pages.map((p, i) => (
          <button
            key={p.slug}
            onClick={() => setPageIdx(i)}
            className={cn(
              "rounded-lg border px-3.5 py-2 text-sm font-medium transition",
              i === pageIdx ? "border-brand bg-brand-soft text-white" : "border-border bg-surface text-ink-muted hover:text-ink",
            )}
          >
            {p.slug === "/" ? "Home" : p.title.split("—")[0]!.trim()}
          </button>
        ))}
      </div>

      {/* Browser frame */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border bg-bg-elevated px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="ml-3 flex flex-1 items-center gap-2 rounded-md border border-border bg-surface px-3 py-1 text-[12px] text-ink-subtle">
            <Globe size={12} />
            {slugify(brand.name)}.com{page.slug === "/" ? "" : page.slug}
          </div>
        </div>
        <div className="overflow-x-auto bg-[#0a0a0f] p-4 sm:p-6">
          <div className={cn("mx-auto transition-all duration-300", device === "mobile" ? "max-w-[390px]" : "max-w-full")}>
            <SitePreview page={page} brand={brand} navItems={website.navItems} mobile={device === "mobile"} />
          </div>
        </div>
      </Card>

      {/* SEO */}
      <section>
        <SectionTitle eyebrow="SEO Agent" title="SEO structure" />
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card>
            <CardBody className="space-y-4">
              <SeoRow label="Title tag" value={website.seo.title} />
              <SeoRow label="Meta description" value={website.seo.metaDescription} />
              <SeoRow label="OG title" value={website.seo.ogTitle} />
              <div>
                <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">Target keywords</div>
                <div className="flex flex-wrap gap-2">
                  {website.seo.keywords.map((k) => (
                    <Badge key={k}>{k}</Badge>
                  ))}
                </div>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">JSON-LD structured data</div>
                <CopyButton text={JSON.stringify(website.seo.jsonLd, null, 2)} />
              </div>
              <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-bg p-3 text-[12px] leading-relaxed text-ink-muted">
                {JSON.stringify(website.seo.jsonLd, null, 2)}
              </pre>
              <div className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">Sitemap</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {website.seo.sitemap.map((s) => (
                  <code key={s} className="rounded bg-surface-2 px-2 py-1 text-[12px] text-accent">{s}</code>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      </section>
    </div>
  );
}

function SeoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">{label}</span>
        <CopyButton text={value} variant="ghost" />
      </div>
      <p className="text-sm leading-relaxed">{value}</p>
    </div>
  );
}

/* --------------------- Rendered website preview ------------------------ */

function SitePreview({
  page,
  brand,
  navItems,
  mobile,
}: {
  page: WebsitePage;
  brand: Brand;
  navItems: { label: string; href: string }[];
  mobile: boolean;
}) {
  const primary = getSwatch(brand.palette, "primary");
  const ink = getSwatch(brand.palette, "neutral-dark");
  const surface = getSwatch(brand.palette, "surface");
  const onPrimary = readableTextColor(primary);
  const headingFont = `${brand.typography.headingFont}, system-ui, sans-serif`;

  return (
    <div className="overflow-hidden rounded-xl shadow-2xl" style={{ background: surface, color: ink, fontFamily: `${brand.typography.bodyFont}, system-ui, sans-serif` }}>
      {/* Nav */}
      <header className="flex items-center justify-between px-5 py-4" style={{ background: surface, borderBottom: `1px solid ${primary}1a` }}>
        <span style={{ fontFamily: headingFont, fontWeight: 800, color: ink, fontSize: 18 }}>{brand.name}</span>
        {!mobile && (
          <nav className="flex items-center gap-5 text-[13px]" style={{ color: `${ink}b3` }}>
            {navItems.map((n) => (
              <span key={n.href}>{n.label}</span>
            ))}
            <span style={{ background: primary, color: onPrimary, padding: "6px 14px", borderRadius: 8, fontWeight: 600 }}>Get started</span>
          </nav>
        )}
        {mobile && <span style={{ color: ink }}>≡</span>}
      </header>

      {page.sections.map((s) => (
        <SectionRenderer key={s.id} section={s} brand={brand} mobile={mobile} />
      ))}

      {/* Footer */}
      <footer className="px-5 py-6 text-center text-[12px]" style={{ background: ink, color: "#ffffffb3" }}>
        © {new Date().getFullYear()} {brand.name}. {brand.slogan}
      </footer>
    </div>
  );
}

function SectionRenderer({ section, brand, mobile }: { section: WSection; brand: Brand; mobile: boolean }) {
  const primary = getSwatch(brand.palette, "primary");
  const secondary = getSwatch(brand.palette, "secondary");
  const accentColor = getSwatch(brand.palette, "accent");
  const ink = getSwatch(brand.palette, "neutral-dark");
  const onPrimary = readableTextColor(primary);
  const headingFont = `${brand.typography.headingFont}, system-ui, sans-serif`;
  const cols = mobile ? "1fr" : "repeat(auto-fit, minmax(180px, 1fr))";

  const heading = (size: number, text: string, color = ink) => (
    <h3 style={{ fontFamily: headingFont, fontWeight: 800, fontSize: mobile ? size * 0.7 : size, color, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{text}</h3>
  );

  switch (section.type) {
    case "hero":
      return (
        <div style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})`, color: onPrimary, padding: mobile ? "48px 24px" : "72px 48px", textAlign: "center" }}>
          {heading(mobile ? 30 : 46, section.heading, onPrimary)}
          {section.subheading && <p style={{ marginTop: 16, fontSize: mobile ? 14 : 17, opacity: 0.9, maxWidth: 620, marginInline: "auto", lineHeight: 1.6 }}>{section.subheading}</p>}
          {(section.primaryCta || section.secondaryCta) && (
            <div style={{ marginTop: 28, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              {section.primaryCta && <span style={{ background: onPrimary, color: primary, padding: "12px 26px", borderRadius: 10, fontWeight: 700, fontSize: 14 }}>{section.primaryCta}</span>}
              {section.secondaryCta && <span style={{ border: `1px solid ${onPrimary}66`, color: onPrimary, padding: "12px 26px", borderRadius: 10, fontWeight: 600, fontSize: 14 }}>{section.secondaryCta}</span>}
            </div>
          )}
        </div>
      );
    case "stats":
      return (
        <div style={{ padding: mobile ? "32px 24px" : "44px 48px" }}>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 20, textAlign: "center" }}>
            {section.items?.map((it, i) => (
              <div key={i}>
                <div style={{ fontFamily: headingFont, fontWeight: 800, fontSize: mobile ? 24 : 32, color: primary }}>{it.title}</div>
                <div style={{ fontSize: 13, color: `${ink}99`, marginTop: 4 }}>{it.description}</div>
              </div>
            ))}
          </div>
        </div>
      );
    case "features":
    case "services":
      return (
        <div style={{ padding: mobile ? "40px 24px" : "60px 48px" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            {heading(mobile ? 24 : 32, section.heading)}
            {section.subheading && <p style={{ marginTop: 10, color: `${ink}99`, fontSize: 15 }}>{section.subheading}</p>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: cols, gap: 18 }}>
            {section.items?.map((it, i) => (
              <div key={i} style={{ background: "#fff", border: `1px solid ${ink}12`, borderRadius: 14, padding: 22 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${primary}1a`, color: primary, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{i + 1}</div>
                <div style={{ marginTop: 14, fontWeight: 700, fontSize: 16, color: ink }}>{it.title}</div>
                {it.description && <p style={{ marginTop: 6, fontSize: 13.5, color: `${ink}99`, lineHeight: 1.6 }}>{it.description}</p>}
              </div>
            ))}
          </div>
        </div>
      );
    case "social-proof":
    case "testimonials":
      return (
        <div style={{ padding: mobile ? "40px 24px" : "60px 48px", background: "#fff" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>{heading(mobile ? 24 : 30, section.heading)}</div>
          <div style={{ display: "grid", gridTemplateColumns: cols, gap: 18 }}>
            {section.items?.map((it, i) => (
              <div key={i} style={{ background: surfaceTint(ink), borderRadius: 14, padding: 22 }}>
                <div style={{ color: accentColor, fontSize: 18 }}>★★★★★</div>
                <p style={{ marginTop: 10, fontSize: 14, color: ink, lineHeight: 1.6 }}>{it.description}</p>
                <div style={{ marginTop: 12, fontWeight: 700, fontSize: 13, color: ink }}>— {it.title}</div>
              </div>
            ))}
          </div>
        </div>
      );
    case "about":
      return (
        <div style={{ padding: mobile ? "40px 24px" : "60px 48px", maxWidth: 760, margin: "0 auto" }}>
          {heading(mobile ? 24 : 30, section.heading)}
          <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.8, color: `${ink}cc` }}>{section.body}</p>
        </div>
      );
    case "pricing":
      return (
        <div style={{ padding: mobile ? "40px 24px" : "60px 48px", background: "#fff" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            {heading(mobile ? 24 : 30, section.heading)}
            {section.subheading && <p style={{ marginTop: 8, color: `${ink}99` }}>{section.subheading}</p>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: cols, gap: 18 }}>
            {section.items?.map((it, i) => (
              <div key={i} style={{ border: `1px solid ${ink}14`, borderRadius: 14, padding: 22, textAlign: "center" }}>
                <div style={{ fontWeight: 800, color: ink, fontSize: 18 }}>{it.title}</div>
                <p style={{ marginTop: 8, fontSize: 13, color: `${ink}99` }}>{it.description}</p>
              </div>
            ))}
          </div>
        </div>
      );
    case "faq":
      return (
        <div style={{ padding: mobile ? "40px 24px" : "60px 48px", maxWidth: 760, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>{heading(mobile ? 24 : 30, section.heading)}</div>
          {section.items?.map((it, i) => (
            <div key={i} style={{ borderBottom: `1px solid ${ink}14`, padding: "16px 0" }}>
              <div style={{ fontWeight: 700, color: ink, fontSize: 15 }}>{it.title}</div>
              <p style={{ marginTop: 6, fontSize: 14, color: `${ink}99`, lineHeight: 1.6 }}>{it.description}</p>
            </div>
          ))}
        </div>
      );
    case "contact":
      return (
        <div style={{ padding: mobile ? "40px 24px" : "60px 48px" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>{heading(mobile ? 24 : 30, section.heading)}</div>
          <div style={{ display: "grid", gridTemplateColumns: cols, gap: 18, maxWidth: 760, margin: "0 auto" }}>
            {section.items?.map((it, i) => (
              <div key={i} style={{ background: "#fff", border: `1px solid ${ink}12`, borderRadius: 12, padding: 18 }}>
                <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: primary, fontWeight: 700 }}>{it.title}</div>
                <div style={{ marginTop: 6, fontSize: 14, color: ink }}>{it.description}</div>
              </div>
            ))}
          </div>
        </div>
      );
    case "cta":
      return (
        <div style={{ background: ink, color: "#fff", padding: mobile ? "48px 24px" : "64px 48px", textAlign: "center" }}>
          {heading(mobile ? 26 : 36, section.heading, "#fff")}
          {section.subheading && <p style={{ marginTop: 12, opacity: 0.8, fontSize: 15 }}>{section.subheading}</p>}
          {section.primaryCta && <div style={{ marginTop: 24 }}><span style={{ background: primary, color: onPrimary, padding: "13px 30px", borderRadius: 10, fontWeight: 700 }}>{section.primaryCta}</span></div>}
        </div>
      );
    default:
      return null;
  }
}

function surfaceTint(ink: string): string {
  return `${ink}0a`;
}
