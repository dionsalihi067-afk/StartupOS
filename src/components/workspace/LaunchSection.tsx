"use client";

import * as React from "react";
import { Check, Rocket, Calendar, CheckCircle2 } from "lucide-react";
import type { LaunchPlan } from "@/lib/types";
import { Card, CardBody, SectionTitle, Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export function LaunchSection({
  launch,
  onToggle,
}: {
  launch: LaunchPlan;
  onToggle?: (index: number) => void;
}) {
  const doneCount = launch.checklist.filter((c) => c.done).length;
  const total = launch.checklist.length || 1;
  const pct = Math.round((doneCount / total) * 100);

  return (
    <div className="space-y-9">
      <Card className="overflow-hidden">
        <div className="bg-radial-brand p-7">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-white"><Rocket size={22} /></span>
            <div>
              <Badge tone="brand">Launch Agent</Badge>
              <h2 className="mt-1.5 text-xl font-bold">Go-to-market launch plan</h2>
            </div>
          </div>
          <p className="mt-4 max-w-3xl leading-relaxed text-ink-muted">{launch.summary}</p>
        </div>
      </Card>

      {/* Checklist */}
      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SectionTitle title="Launch readiness checklist" />
          <div className="flex items-center gap-3">
            <div className="h-2 w-40 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-gradient-to-r from-brand to-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-sm font-semibold">{doneCount}/{total}</span>
          </div>
        </div>
        <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
          {launch.checklist.map((c, i) => (
            <button
              key={i}
              onClick={() => onToggle?.(i)}
              disabled={!onToggle}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition",
                c.done ? "border-success/30 bg-success/5" : "border-border bg-surface hover:border-border-strong",
                !onToggle && "cursor-default",
              )}
            >
              <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition", c.done ? "border-success bg-success text-white" : "border-border-strong")}>
                {c.done && <Check size={13} />}
              </span>
              <span className={cn(c.done && "text-ink-muted line-through")}>{c.item}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Timeline */}
      <div className="grid gap-5 lg:grid-cols-3">
        <TimelineCard title="Pre-launch" icon={<Calendar size={16} />} items={launch.prelaunch.map((p) => ({ main: p.task, sub: p.timing }))} tone="brand" />
        <TimelineCard title="Launch day" icon={<Rocket size={16} />} items={launch.launchDay.map((p) => ({ main: p.task, sub: p.channel }))} tone="accent" />
        <TimelineCard title="Post-launch" icon={<CheckCircle2 size={16} />} items={launch.postlaunch.map((p) => ({ main: p.task, sub: p.timing }))} tone="success" />
      </div>
    </div>
  );
}

function TimelineCard({
  title,
  icon,
  items,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  items: { main: string; sub: string }[];
  tone: "brand" | "accent" | "success";
}) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2">
          <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tone === "brand" ? "bg-brand-soft text-brand-2" : tone === "accent" ? "bg-accent/15 text-accent" : "bg-success/15 text-success")}>{icon}</span>
          <h3 className="font-semibold">{title}</h3>
        </div>
        <ol className="mt-4 space-y-3">
          {items.map((it, i) => (
            <li key={i} className="relative border-l border-border pl-4">
              <span className="absolute -left-[3px] top-1.5 h-1.5 w-1.5 rounded-full bg-brand" />
              <div className="text-[13px] font-medium leading-snug">{it.main}</div>
              <div className="text-[11px] text-ink-subtle">{it.sub}</div>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}
