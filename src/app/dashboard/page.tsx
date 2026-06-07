"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Sparkles, Wand2 } from "lucide-react";
import { useProjects } from "@/lib/client/store";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button, Card, CardBody, Stat, Badge } from "@/components/ui/primitives";
import { BrandLogo, logoIsAvailable } from "@/components/ui/Logo";
import { AGENTS } from "@/lib/content";
import { Icon } from "@/components/ui/Icon";

export default function OverviewPage() {
  const { projects, active } = useProjects();
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => setReady(true), []);

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Your AI business creation command center."
        actions={
          <Link href="/dashboard/generate">
            <Button>
              <Wand2 size={16} /> New business
            </Button>
          </Link>
        }
      />

      {!ready ? (
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <GettingStarted />
      ) : (
        <div className="space-y-7">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Projects" value={projects.length} hint="Saved locally" />
            <Stat label="Active business" value={active?.brand.name ?? "—"} />
            <Stat label="Total deliverables" value={projects.length * 30} hint="30 per business" />
            <Stat label="Agents available" value={AGENTS.length} />
          </div>

          {active && (
            <Card className="overflow-hidden">
              <div className="grid lg:grid-cols-[1fr_320px]">
                <CardBody>
                  <Badge tone="brand">Active project</Badge>
                  <h2 className="mt-3 text-2xl font-bold">{active.brand.name}</h2>
                  <p className="mt-1 text-brand-2">{active.brand.slogan}</p>
                  <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-muted">{active.brand.description}</p>
                  <Link href={`/dashboard/projects/${active.id}`} className="mt-5 inline-block">
                    <Button>
                      Open workspace <ArrowRight size={16} />
                    </Button>
                  </Link>
                </CardBody>
                <div className="flex items-center justify-center border-t border-border bg-white p-6 lg:border-l lg:border-t-0">
                  <div className="flex w-full max-w-[240px] items-center justify-center">
                    {logoIsAvailable(active.brand.logo) ? (
                      <BrandLogo logo={active.brand.logo} name={active.brand.name} variant="full" className="h-16 w-full" />
                    ) : (
                      <span className="text-[13px] text-ink-subtle">No logo generated</span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}

          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-subtle">Recent projects</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.slice(0, 6).map((p) => (
                <Link key={p.id} href={`/dashboard/projects/${p.id}`}>
                  <Card className="group h-full p-4 transition hover:border-brand/40">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-border bg-bg-elevated p-1.5">
                        <BrandLogo logo={p.brand.logo} name={p.brand.name} variant="icon" className="h-full w-full rounded-lg" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{p.brand.name}</div>
                        <div className="truncate text-[12px] text-ink-subtle">{p.input.idea}</div>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GettingStarted() {
  return (
    <div className="space-y-7">
      <Card className="overflow-hidden">
        <div className="bg-radial-brand p-8 sm:p-12">
          <div className="flex items-center gap-2 text-brand-2">
            <Sparkles size={18} />
            <span className="text-sm font-semibold uppercase tracking-wide">Welcome to StartupOS</span>
          </div>
          <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
            Turn your idea into an entire business in minutes.
          </h2>
          <p className="mt-3 max-w-xl text-ink-muted">
            You haven&apos;t generated a business yet. Open the Startup Generator, describe your idea, and
            watch 12 agents build your brand, website, marketing, pricing, growth and launch assets.
          </p>
          <Link href="/dashboard/generate" className="mt-6 inline-block">
            <Button size="lg">
              <Wand2 size={17} /> Generate my first business
            </Button>
          </Link>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {AGENTS.slice(0, 6).map((a) => (
          <Card key={a.key} className="p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand-2">
              <Icon name={a.icon} size={18} />
            </div>
            <div className="mt-3 font-semibold">{a.name}</div>
            <div className="mt-1 text-[13px] text-ink-muted">{a.role}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
