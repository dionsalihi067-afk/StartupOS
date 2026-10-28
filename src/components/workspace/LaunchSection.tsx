"use client";

import * as React from "react";
import { Check } from "lucide-react";
import type { BusinessPackage } from "@/lib/types";
import { Card, CardBody, CardHeader, ProgressBar } from "@/components/ui/primitives";
import { launchProgress } from "@/lib/client/insights";
import { useFormat, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

export function LaunchSection({ pkg, onToggle }: { pkg: BusinessPackage; onToggle?: (index: number) => void }) {
  const t = useT();
  const format = useFormat();
  const launch = pkg.launch;
  const lp = launchProgress(pkg);

  const stages = [
    { id: "before", title: t("launch.before"), items: launch.prelaunch.map((p) => ({ main: p.task, sub: p.timing })) },
    { id: "day", title: t("launch.launchDay"), items: launch.launchDay.map((p) => ({ main: p.task, sub: p.channel })) },
    { id: "after", title: t("launch.after"), items: launch.postlaunch.map((p) => ({ main: p.task, sub: p.timing })) },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid md:grid-cols-[minmax(0,1fr)_280px]">
          <CardBody>
            <h2 className="text-[15px] font-semibold text-ink">{t("launch.planTitle")}</h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">{launch.summary}</p>
          </CardBody>
          <div className="border-t border-border bg-surface-2 p-5 md:border-l md:border-t-0">
            <div className="flex items-baseline justify-between">
              <span className="text-[12.5px] text-ink-subtle">{t("launch.readiness")}</span>
              <span className="text-sm font-medium tabular-nums text-ink">{format.percent(lp.pct)}</span>
            </div>
            <ProgressBar value={lp.pct} label={t("launch.readinessAria")} className="mt-2" />
            <p className="mt-2 text-[12.5px] text-ink-subtle">{t("launch.itemsDone", { done: lp.done, total: lp.total })}</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={t("launch.checklist")} description={onToggle ? t("launch.savedNote") : undefined} />
        <ul className="divide-y divide-border">
          {launch.checklist.map((c, i) => {
            const id = `launch-item-${i}`;
            return (
              <li key={i}>
                <label
                  htmlFor={id}
                  className={cn(
                    "flex items-start gap-3 px-5 py-3 text-sm transition-colors",
                    onToggle ? "cursor-pointer hover:bg-surface-2" : "cursor-default",
                  )}
                >
                  <input
                    id={id}
                    type="checkbox"
                    checked={c.done}
                    disabled={!onToggle}
                    onChange={() => onToggle?.(i)}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand",
                      c.done ? "border-ink bg-ink text-on-primary" : "border-border-strong bg-surface",
                    )}
                  >
                    {c.done && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className={cn("leading-snug", c.done ? "text-ink-subtle line-through" : "text-ink")}>{c.item}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardHeader title={t("launch.timeline")} />
        <ol className="grid divide-y divide-border lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {stages.map((stage, si) => (
            <li key={stage.id} className="p-5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border-strong text-[11px] tabular-nums text-ink-muted">
                  {si + 1}
                </span>
                <h3 className="text-sm font-medium text-ink">{stage.title}</h3>
              </div>
              {stage.items.length === 0 ? (
                <p className="mt-3 text-[13px] text-ink-subtle">{t("launch.noTasks")}</p>
              ) : (
                <ol className="mt-4 space-y-3 border-l border-border pl-4">
                  {stage.items.map((it, i) => (
                    <li key={i} className="relative">
                      <span aria-hidden className="absolute -left-[19.5px] top-[7px] h-1.5 w-1.5 rounded-full bg-ink-subtle" />
                      <div className="text-[13px] leading-snug text-ink">{it.main}</div>
                      <div className="mt-0.5 text-[12px] text-ink-subtle">{it.sub}</div>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
