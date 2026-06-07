"use client";

import * as React from "react";
import { CheckCircle2, Cpu, Database, Download, Globe, Search, Trash2, Zap } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardBody, Badge, Button } from "@/components/ui/primitives";
import { listProjects, useProjects, deleteProject } from "@/lib/client/store";
import { downloadJson } from "@/lib/client/download";

interface Status {
  llmConfigured: boolean;
  model: string | null;
  searchConfigured: boolean;
  searchProvider: string | null;
  engine: string;
}

export default function SettingsPage() {
  const { projects, refresh } = useProjects();
  const [status, setStatus] = React.useState<Status | null>(null);

  React.useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() =>
        setStatus({ llmConfigured: false, model: null, searchConfigured: false, searchProvider: null, engine: "deterministic" }),
      );
  }, []);

  function clearAll() {
    if (!confirm(`Delete all ${projects.length} projects? This cannot be undone.`)) return;
    for (const p of listProjects()) deleteProject(p.id);
    refresh();
  }

  return (
    <div>
      <PageHeader title="Settings" description="Engine configuration and data management." />

      <div className="space-y-5">
        {/* Engine */}
        <Card>
          <CardBody>
            <div className="flex items-center gap-2">
              <Cpu size={18} className="text-brand-2" />
              <h2 className="text-lg font-semibold">Generation engine</h2>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-bg-elevated p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">LLM provider</span>
                  {status ? (
                    <Badge tone={status.llmConfigured ? "success" : "neutral"}>
                      {status.llmConfigured ? "Connected" : "Not configured"}
                    </Badge>
                  ) : (
                    <span className="skeleton h-5 w-20 rounded-full" />
                  )}
                </div>
                <p className="mt-2 text-[13px] text-ink-muted">
                  {status?.llmConfigured
                    ? `Live generation is active using ${status.model}.`
                    : "Add an OPENAI_API_KEY to .env.local to enable live LLM generation."}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-bg-elevated p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Deterministic engine</span>
                  <Badge tone="success">
                    <CheckCircle2 size={11} /> Always on
                  </Badge>
                </div>
                <p className="mt-2 text-[13px] text-ink-muted">
                  Produces real, usable assets with zero configuration — and acts as an automatic
                  fallback if the LLM is unavailable.
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-brand/25 bg-brand-soft/30 p-4 text-sm">
              <Zap size={18} className="mt-0.5 shrink-0 text-brand-2" />
              <p className="text-ink-muted">
                StartupOS works fully offline using the deterministic engine. Connecting an
                OpenAI-compatible key upgrades copy, naming and strategy to live AI while keeping all
                visual assets (logos, creatives, websites) generated locally.
              </p>
            </div>
          </CardBody>
        </Card>

        {/* Live research */}
        <Card>
          <CardBody>
            <div className="flex items-center gap-2">
              <Globe size={18} className="text-brand-2" />
              <h2 className="text-lg font-semibold">Live web research</h2>
            </div>
            <div className="mt-4 rounded-xl border border-border bg-bg-elevated p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Search provider</span>
                {status ? (
                  <Badge tone={status.searchConfigured ? "success" : "warning"}>
                    {status.searchConfigured ? (
                      <>
                        <CheckCircle2 size={11} /> {status.searchProvider}
                      </>
                    ) : (
                      "Not configured"
                    )}
                  </Badge>
                ) : (
                  <span className="skeleton h-5 w-20 rounded-full" />
                )}
              </div>
              <p className="mt-2 text-[13px] text-ink-muted">
                {status?.searchConfigured
                  ? `The Competitor and Market Research agents use live ${status.searchProvider} web search to find real businesses and market data.`
                  : "The Competitor and Market Research agents require a web search key to return real data. Without one, StartupOS reports those sections as unavailable rather than fabricating competitors or statistics."}
              </p>
            </div>
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
              <Search size={18} className="mt-0.5 shrink-0 text-brand-2" />
              <div className="text-ink-muted">
                <p>Add one of the following to <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[12px] text-accent">.env.local</code>:</p>
                <ul className="mt-2 space-y-1 text-[13px]">
                  <li><code className="text-accent">TAVILY_API_KEY</code> — Tavily (recommended for AI search)</li>
                  <li><code className="text-accent">SERPER_API_KEY</code> — Serper.dev (Google results)</li>
                  <li><code className="text-accent">BRAVE_API_KEY</code> — Brave Search API</li>
                </ul>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Data */}
        <Card>
          <CardBody>
            <div className="flex items-center gap-2">
              <Database size={18} className="text-brand-2" />
              <h2 className="text-lg font-semibold">Data management</h2>
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              Projects are stored locally in your browser. {projects.length} project
              {projects.length === 1 ? "" : "s"} saved.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => downloadJson("startupos-projects-backup.json", listProjects())}
                disabled={projects.length === 0}
              >
                <Download size={15} /> Export all projects
              </Button>
              <Button variant="danger" onClick={clearAll} disabled={projects.length === 0}>
                <Trash2 size={15} /> Delete all projects
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="text-lg font-semibold">About StartupOS</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              StartupOS is a multi-agent AI business creation operating system. It orchestrates 12
              specialized agents to generate a complete, launch-ready business ecosystem — brand,
              website, marketing, pricing, competitor intelligence, growth and launch — from a single
              idea.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge>12 agents</Badge>
              <Badge>30 deliverables</Badge>
              <Badge tone="brand">Production-grade</Badge>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
