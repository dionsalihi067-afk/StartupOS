"use client";

import * as React from "react";
import { ArrowRight, Clock, Layers, Cpu } from "lucide-react";
import type { BusinessPackage } from "@/lib/types";
import { Card, CardBody, Stat, Badge } from "@/components/ui/primitives";
import { BrandLogo, logoIsAvailable } from "@/components/ui/Logo";

const JUMP_CARDS: { tab: string; title: string; getCount: (p: BusinessPackage) => string }[] = [
  { tab: "Brand", title: "Brand & identity", getCount: (p) => `${p.brand.palette.length} colors · ${p.brand.logo.generated ? "AI logo" : "no logo"}` },
  { tab: "Website", title: "Website", getCount: (p) => `${p.website.pages.length} pages` },
  { tab: "Marketing", title: "Marketing", getCount: (p) => `${p.marketing.instagram.length} IG · ${p.marketing.facebookAds.length} ads · ${p.marketing.email.sequence.length} emails` },
  { tab: "Competitors", title: "Competitor intel", getCount: (p) => `${p.competitors.competitors.length} competitors` },
  { tab: "Pricing", title: "Pricing", getCount: (p) => `${p.pricing.tiers.length} tiers` },
  { tab: "Growth", title: "Growth & funnel", getCount: (p) => `${p.growth.length} phases · ${p.salesFunnel.length} stages` },
  { tab: "Launch", title: "Launch plan", getCount: (p) => `${p.launch.checklist.length} checklist items` },
];

export function OverviewSection({ pkg, onJump }: { pkg: BusinessPackage; onJump: (tab: string) => void }) {
  return (
    <div className="space-y-7">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Generation engine" value={pkg.meta.engine === "hybrid" ? "AI + Engine" : "Engine"} hint={`${pkg.meta.agentLog.length} agents`} />
        <Stat label="Build time" value={`${(pkg.meta.durationMs / 1000).toFixed(1)}s`} hint="End-to-end" />
        <Stat label="Deliverables" value="30" hint="Across 7 domains" />
        <Stat label="Created" value={new Date(pkg.createdAt).toLocaleDateString()} hint={new Date(pkg.createdAt).toLocaleTimeString()} />
      </div>

      {/* Brand snapshot */}
      <Card className="overflow-hidden">
        <div className="grid lg:grid-cols-[1fr_360px]">
          <CardBody>
            <Badge tone="brand">Business snapshot</Badge>
            <h2 className="mt-3 text-2xl font-bold">{pkg.brand.name}</h2>
            <p className="mt-1 text-brand-2">{pkg.brand.slogan}</p>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-muted">{pkg.brand.description}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {pkg.brand.palette.map((c) => (
                <span key={c.role} className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px]">
                  <span className="h-3 w-3 rounded-full" style={{ background: c.hex }} />
                  {c.hex}
                </span>
              ))}
            </div>
          </CardBody>
          <div className="flex items-center justify-center border-t border-border bg-white p-6 lg:border-l lg:border-t-0">
            <div className="flex w-full max-w-[260px] items-center justify-center">
              {logoIsAvailable(pkg.brand.logo) ? (
                <BrandLogo logo={pkg.brand.logo} name={pkg.brand.name} variant="full" className="h-20 w-full" />
              ) : (
                <span className="text-[13px] text-ink-subtle">No logo generated</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Input recap */}
      <Card>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Idea", pkg.input.idea],
              ["Audience", pkg.input.audience],
              ["Location", pkg.input.location],
              ["Budget", pkg.input.budget],
              ["Style", pkg.input.style],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">{label}</div>
                <div className="mt-1 text-sm">{value}</div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Jump cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {JUMP_CARDS.map((j) => (
          <button key={j.tab} onClick={() => onJump(j.tab)} className="card group p-5 text-left transition hover:border-brand/40 hover:shadow-glow">
            <div className="flex items-center justify-between">
              <Layers size={18} className="text-brand-2" />
              <ArrowRight size={16} className="text-ink-subtle transition group-hover:translate-x-1 group-hover:text-ink" />
            </div>
            <div className="mt-3 font-semibold">{j.title}</div>
            <div className="mt-0.5 text-[13px] text-ink-subtle">{j.getCount(pkg)}</div>
          </button>
        ))}
      </div>

      {/* Agent log */}
      <Card>
        <CardBody>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Cpu size={16} className="text-brand-2" /> Agent run log</div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {pkg.meta.agentLog.map((l, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-bg-elevated px-3 py-2 text-[13px]">
                <span className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${l.status === "ok" ? "bg-success" : l.status === "fallback" ? "bg-warning" : "bg-danger"}`} />
                  {l.agent}
                </span>
                <span className="flex items-center gap-2 text-ink-subtle">
                  <Badge tone={l.source === "llm" ? "brand" : "neutral"} className="!text-[9px]">{l.source === "llm" ? "AI" : "Engine"}</Badge>
                  <span className="inline-flex items-center gap-1"><Clock size={11} />{l.durationMs}ms</span>
                </span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
