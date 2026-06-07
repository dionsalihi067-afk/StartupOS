"use client";

import * as React from "react";
import { Target, Flag } from "lucide-react";
import type { GrowthPhase, SalesFunnelStage } from "@/lib/types";
import { Card, CardBody, SectionTitle, Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const CATEGORY_TONE: Record<string, "brand" | "accent" | "success" | "warning" | "neutral"> = {
  marketing: "brand",
  product: "accent",
  sales: "success",
  ops: "neutral",
  brand: "warning",
};

export function GrowthSection({ growth, funnel }: { growth: GrowthPhase[]; funnel: SalesFunnelStage[] }) {
  const [phaseIdx, setPhaseIdx] = React.useState(0);
  const phase = growth[phaseIdx] ?? growth[0];

  return (
    <div className="space-y-9">
      {/* Sales funnel */}
      <section>
        <SectionTitle eyebrow="Sales Funnel" title="Customer journey" description="From first impression to loyal advocate." />
        <div className="mt-5 grid gap-3 md:grid-cols-5">
          {funnel.map((stage, i) => (
            <Card key={stage.stage} className="relative">
              <CardBody className="p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">{i + 1}</span>
                  <span className="text-sm font-semibold">{stage.stage}</span>
                </div>
                <p className="mt-2 text-[12px] text-ink-muted">{stage.goal}</p>
                <div className="mt-3 space-y-1">
                  {stage.tactics.map((t, j) => (
                    <div key={j} className="text-[11px] text-ink-subtle">• {t}</div>
                  ))}
                </div>
                <div className="mt-3 rounded-lg bg-surface-2 p-2 text-[11px]">
                  <span className="text-ink-subtle">{stage.metric}: </span>
                  <span className="font-semibold text-accent">{stage.conversionTarget}</span>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      {/* 30/60/90 */}
      <section>
        <SectionTitle eyebrow="Growth Agent" title="30 / 60 / 90-day plan" />
        <div className="mt-5 flex flex-wrap gap-2">
          {growth.map((p, i) => (
            <button
              key={p.window}
              onClick={() => setPhaseIdx(i)}
              className={cn(
                "rounded-xl border px-4 py-2.5 text-left transition",
                i === phaseIdx ? "border-brand bg-brand-soft" : "border-border bg-surface hover:border-border-strong",
              )}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Day {p.window}</div>
              <div className="text-sm font-semibold">{p.title}</div>
            </button>
          ))}
        </div>

        {phase && (
          <div className="mt-5 space-y-5">
            <Card>
              <CardBody className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <div className="text-[12px] font-semibold uppercase tracking-wide text-brand-2">Objective</div>
                  <p className="mt-1 text-[15px]">{phase.objective}</p>
                </div>
                <div className="rounded-xl border border-brand/30 bg-brand-soft/40 px-4 py-3 text-center">
                  <div className="text-[11px] uppercase tracking-wide text-ink-subtle">North star</div>
                  <div className="mt-0.5 font-semibold text-brand-2">{phase.northStar}</div>
                </div>
              </CardBody>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              {phase.weeklyFocus.map((w) => (
                <Card key={w.week}>
                  <CardBody>
                    <div className="flex items-center gap-2">
                      <Badge tone="brand">Week {w.week}</Badge>
                      <span className="text-sm font-semibold">{w.focus}</span>
                    </div>
                    <div className="mt-3 space-y-2.5">
                      {w.tasks.map((t, i) => (
                        <div key={i} className="rounded-lg border border-border bg-bg-elevated p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[13px] font-medium">{t.title}</span>
                            <Badge tone={CATEGORY_TONE[t.category] ?? "neutral"} className="!text-[9px]">{t.category}</Badge>
                          </div>
                          <p className="mt-1 text-[12px] text-ink-subtle">{t.description}</p>
                          <div className="mt-1.5 text-[11px] text-ink-subtle">Owner: {t.owner}</div>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardBody>
                  <div className="flex items-center gap-2 text-sm font-semibold"><Flag size={15} className="text-accent" /> Milestones</div>
                  <ul className="mt-3 space-y-2">
                    {phase.milestones.map((m, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-ink-muted">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        {m}
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
              <Card>
                <CardBody>
                  <div className="flex items-center gap-2 text-sm font-semibold"><Target size={15} className="text-brand-2" /> Targets</div>
                  <div className="mt-3 space-y-2">
                    {phase.targets.map((t, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg bg-surface-2 px-3.5 py-2.5 text-sm">
                        <span className="text-ink-muted">{t.metric}</span>
                        <span className="font-semibold">{t.value}</span>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
