"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Trash2, Wand2, Star } from "lucide-react";
import { useProjects, deleteProject, setActiveProjectId } from "@/lib/client/store";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Button, Card, Badge } from "@/components/ui/primitives";
import { BrandLogo } from "@/components/ui/Logo";

export default function ProjectsPage() {
  const { projects, active, refresh } = useProjects();
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => setReady(true), []);

  if (ready && projects.length === 0) {
    return (
      <div>
        <PageHeader title="Projects" description="Every business you generate is saved here." />
        <EmptyState />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        description={`${projects.length} business${projects.length === 1 ? "" : "es"} generated.`}
        actions={
          <Link href="/dashboard/generate">
            <Button>
              <Wand2 size={16} /> New business
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => {
          const isActive = active?.id === p.id;
          return (
            <Card key={p.id} className="flex flex-col overflow-hidden">
              <div className="flex items-center gap-3 border-b border-border p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-bg-elevated p-2">
                  <BrandLogo logo={p.brand.logo} name={p.brand.name} variant="icon" className="h-full w-full rounded-lg" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{p.brand.name}</span>
                    {isActive && <Badge tone="brand" className="!text-[9px]">Active</Badge>}
                  </div>
                  <div className="truncate text-[12px] text-ink-subtle">{p.input.location}</div>
                </div>
              </div>
              <div className="flex-1 p-4">
                <p className="line-clamp-2 text-[13px] text-ink-muted">{p.input.idea}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.brand.palette.slice(0, 5).map((c) => (
                    <span key={c.role} className="h-4 w-4 rounded-full border border-border" style={{ background: c.hex }} />
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border p-3">
                <div className="flex gap-1.5">
                  {!isActive && (
                    <Button size="sm" variant="ghost" onClick={() => setActiveProjectId(p.id)}>
                      <Star size={14} /> Set active
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Delete "${p.brand.name}"? This cannot be undone.`)) {
                        deleteProject(p.id);
                        refresh();
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
                <Link href={`/dashboard/projects/${p.id}`}>
                  <Button size="sm" variant="secondary">
                    Open <ArrowRight size={14} />
                  </Button>
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
