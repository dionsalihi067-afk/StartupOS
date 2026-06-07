"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import type { Brand } from "@/lib/types";
import { BrandLogo, logoIsAvailable } from "@/components/ui/Logo";
import { Card, CardBody, SectionTitle, Badge } from "@/components/ui/primitives";
import { CopyButton } from "@/components/ui/actions";
import { readableTextColor } from "@/lib/engine/color";
import { slugify } from "@/lib/utils";

export function BrandSection({ brand }: { brand: Brand }) {
  const slug = slugify(brand.name);
  const hasLogo = logoIsAvailable(brand.logo);
  return (
    <div className="space-y-10">
      {/* Identity hero */}
      <Card className="overflow-hidden">
        <div className="bg-radial-brand p-7 sm:p-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Badge tone="brand">Brand Identity</Badge>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{brand.name}</h2>
              <p className="mt-2 text-lg text-brand-2">{brand.slogan}</p>
            </div>
            {hasLogo && (
              <div className="w-full max-w-[240px] rounded-2xl border border-border bg-white p-5 sm:w-auto">
                <BrandLogo logo={brand.logo} name={brand.name} variant="full" className="h-16 w-full" />
              </div>
            )}
          </div>
          <p className="mt-6 max-w-3xl leading-relaxed text-ink-muted">{brand.description}</p>
        </div>
      </Card>

      {/* Brand story */}
      {brand.story && (
        <section>
          <SectionTitle eyebrow="Brand Agent" title="Brand story" description="Why this business exists, and who it's for." />
          <Card className="mt-5">
            <CardBody>
              <p className="text-[15px] leading-relaxed text-ink-muted">{brand.story}</p>
            </CardBody>
          </Card>
        </section>
      )}

      {/* Logo suite */}
      <section>
        <SectionTitle eyebrow="Logo Agent" title="Logo" description={brand.logo.concept || "AI-generated, unique to this business."} />
        {hasLogo ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <LogoCard label="Primary" background="#ffffff" downloadUrl={brand.logo.imageUrl} downloadName={`${slug}-logo.png`}>
              <BrandLogo logo={brand.logo} name={brand.name} variant="full" className="max-h-28 w-full" />
            </LogoCard>
            <LogoCard label="On dark" background="#0b0b10">
              <BrandLogo logo={brand.logo} name={brand.name} variant="full" className="max-h-28 w-full" />
            </LogoCard>
            <LogoCard label="App icon" background="#ffffff" downloadUrl={brand.logo.iconUrl} downloadName={`${slug}-icon.png`}>
              <BrandLogo logo={brand.logo} name={brand.name} variant="icon" className="max-h-28 w-auto" />
            </LogoCard>
          </div>
        ) : (
          <LogoUnavailable status={brand.logo.status} />
        )}
      </section>

      {/* Palette */}
      <section>
        <SectionTitle eyebrow="Color" title="Color palette" description="Click any swatch to copy its HEX value." />
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {brand.palette.map((c) => (
            <div key={c.role} className="card overflow-hidden">
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(c.hex)}
                className="block h-24 w-full transition hover:opacity-90"
                style={{ background: c.hex, color: readableTextColor(c.hex) }}
                title={`Copy ${c.hex}`}
              >
                <span className="flex h-full items-end justify-start p-2.5 text-[11px] font-semibold uppercase tracking-wide">
                  {c.hex}
                </span>
              </button>
              <div className="p-3">
                <div className="text-[13px] font-semibold">{c.name}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-ink-subtle">{c.usage}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Typography */}
      <section>
        <SectionTitle eyebrow="Type" title="Typography system" />
        <Card className="mt-5">
          <CardBody>
            <div className="flex flex-col gap-1 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[12px] text-ink-subtle">Headings</div>
                <div className="text-lg font-semibold">{brand.typography.headingFont}</div>
              </div>
              <div>
                <div className="text-[12px] text-ink-subtle">Body</div>
                <div className="text-lg font-semibold">{brand.typography.bodyFont}</div>
              </div>
              <CopyButton label="Copy font link" text={brand.typography.googleFontsHref} />
            </div>
            <div className="mt-5 space-y-3">
              {brand.typography.scale.map((s) => (
                <div key={s.label} className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-3 last:border-0">
                  <span
                    className="truncate"
                    style={{ fontSize: Math.min(s.sizePx, 40), fontWeight: s.weight, lineHeight: 1, letterSpacing: s.letterSpacing }}
                  >
                    {brand.name}
                  </span>
                  <span className="shrink-0 text-[12px] text-ink-subtle">
                    {s.label} · {s.sizePx}px / {s.weight}
                  </span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </section>

      {/* Identity details */}
      <section className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-subtle">Mission</h3>
            <p className="mt-2 leading-relaxed">{brand.mission}</p>
            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-ink-subtle">Vision</h3>
            <p className="mt-2 leading-relaxed">{brand.vision}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-subtle">Values</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {brand.values.map((v) => (
                <Badge key={v} tone="accent">{v}</Badge>
              ))}
            </div>
            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-ink-subtle">Voice & personality</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {[...brand.voice, ...brand.personality].map((v, i) => (
                <Badge key={`${v}-${i}`}>{v}</Badge>
              ))}
            </div>
          </CardBody>
        </Card>
      </section>

      {/* Guidelines */}
      <section>
        <SectionTitle eyebrow="Standards" title="Brand guidelines" />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brand.guidelines.map((g) => (
            <Card key={g.title}>
              <CardBody>
                <div className="text-[15px] font-semibold">{g.title}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{g.rule}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function LogoCard({
  label,
  background,
  downloadUrl,
  downloadName,
  children,
}: {
  label: string;
  background: string;
  downloadUrl?: string;
  downloadName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="group overflow-hidden">
      <div className="flex h-40 items-center justify-center p-6" style={{ background }}>
        {children}
      </div>
      <div className="flex items-center justify-between border-t border-border p-3">
        <span className="text-[13px] font-medium">{label}</span>
        {downloadUrl && (
          <a
            href={downloadUrl}
            download={downloadName}
            className="rounded-md px-2 py-1 text-[12px] font-medium text-brand-2 transition hover:bg-surface-2"
          >
            PNG
          </a>
        )}
      </div>
    </Card>
  );
}

function LogoUnavailable({ status }: { status: "generated" | "unavailable" | "error" }) {
  const notConfigured = status === "unavailable";
  return (
    <Card className="mt-5">
      <CardBody className="flex flex-col items-center py-12 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-bg-elevated text-brand-2">
          <AlertTriangle size={26} />
        </div>
        <h3 className="text-lg font-semibold">
          {notConfigured ? "Logo generation not configured" : "Logo generation failed"}
        </h3>
        <p className="mt-2 max-w-md text-sm text-ink-muted">
          {notConfigured ? (
            <>
              StartupOS never ships a placeholder logo. Add an{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[12px] text-accent">OPENAI_API_KEY</code> to{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[12px] text-accent">.env.local</code> and regenerate
              to produce a real, unique logo via image generation.
            </>
          ) : (
            <>The image model could not return a logo this time. Re-run generation to produce a real, unique logo — no placeholder is substituted.</>
          )}
        </p>
      </CardBody>
    </Card>
  );
}
