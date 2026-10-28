"use client";

import * as React from "react";
import type { BusinessPackage, GrowthPhase } from "@/lib/types";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/Tabs";
import { Provenance } from "@/components/ui/Provenance";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { useT } from "@/i18n/client";
import type { Messages } from "@/i18n/messages";
import type { Translator } from "@/i18n/translator";

function phaseLabel(p: GrowthPhase, t: Translator) {
  return t("growth.days", { range: p.window.replace("-", "–") });
}

function categoryLabel(category: string, t: Translator) {
  return t.optional(`growth.categories.${category as keyof Messages["growth"]["categories"]}`) ?? category;
}

export function GrowthSection({ pkg }: { pkg: BusinessPackage }) {
  const t = useT();
  const { growth, salesFunnel } = pkg;
  const [phaseWindow, setPhaseWindow] = React.useState<GrowthPhase["window"]>(growth[0]?.window ?? "0-30");
  const phase = growth.find((p) => p.window === phaseWindow) ?? growth[0];

  if (!phase) return <EmptyState title={t("growth.emptyTitle")} description={t("growth.emptyDescription")} action={null} />;

  const taskCount = phase.weeklyFocus.reduce((n, w) => n + w.tasks.length, 0);

  return (
    <div className="space-y-8">
      <section aria-labelledby="plan-heading" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="plan-heading" className="text-[15px] font-semibold text-ink">
            {t("growth.planTitle")}
          </h2>
          <Tabs
            variant="segmented"
            label={t("growth.phaseLabel")}
            idPrefix="growth-phase"
            items={growth.map((p) => ({ id: p.window, label: phaseLabel(p, t) }))}
            value={phase.window}
            onChange={setPhaseWindow}
          />
        </div>

        <Card>
          <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_260px]">
            <CardBody>
              <div className="text-[12.5px] text-ink-subtle">
                {phaseLabel(phase, t)} · {t("growth.taskCount", { count: taskCount })}
              </div>
              <h3 className="mt-1 text-lg font-semibold tracking-tight text-ink">{phase.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{phase.objective}</p>
            </CardBody>
            <div className="border-t border-border bg-surface-2 p-5 md:border-l md:border-t-0">
              <div className="text-[12.5px] text-ink-subtle">{t("growth.mainGoal")}</div>
              <div className="mt-1 text-sm font-medium text-ink">{phase.northStar}</div>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader title={t("growth.weeklyTasks")} />
            <div className="divide-y divide-border">
              {phase.weeklyFocus.map((w) => (
                <div key={w.week}>
                  <div className="flex items-baseline gap-2 bg-surface-2 px-5 py-2">
                    <span className="shrink-0 text-[12.5px] font-medium text-ink">{t("growth.week", { week: w.week })}</span>
                    <span className="truncate text-[12.5px] text-ink-subtle">{w.focus}</span>
                  </div>
                  <ul className="divide-y divide-border">
                    {w.tasks.map((task, i) => (
                      <li key={i} className="px-5 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[13.5px] font-medium text-ink">{task.title}</span>
                          <span className="flex items-center gap-1.5">
                            <Badge tone="outline">{categoryLabel(task.category, t)}</Badge>
                            <Badge>{task.owner}</Badge>
                          </span>
                        </div>
                        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{task.description}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title={t("growth.milestones")} />
              <ol className="divide-y divide-border">
                {phase.milestones.map((m, i) => (
                  <li key={i} className="flex gap-3 px-5 py-3 text-[13px] leading-relaxed text-ink">
                    <span className="w-4 shrink-0 tabular-nums text-ink-subtle">{i + 1}</span>
                    {m}
                  </li>
                ))}
              </ol>
            </Card>
            <Card>
              <CardHeader title={t("growth.targets")} actions={<Provenance kind="estimate" />} />
              <ul className="divide-y divide-border">
                {phase.targets.map((target, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-4 px-5 py-3 text-[13px]">
                    <span className="text-ink-muted">{target.metric}</span>
                    <span className="shrink-0 font-medium tabular-nums text-ink">{target.value}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </section>

      {salesFunnel.length > 0 && (
        <section aria-labelledby="funnel-heading" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="funnel-heading" className="text-[15px] font-semibold text-ink">
                {t("growth.journeyTitle")}
              </h2>
              <p className="mt-0.5 text-[13px] text-ink-subtle">{t("growth.journeyDescription")}</p>
            </div>
            <Provenance kind="estimate" label={t("growth.conversionAssumption")} />
          </div>
          <Card className="overflow-hidden">
            <ol className="grid divide-y divide-border md:grid-cols-2 md:divide-y-0 xl:grid-cols-5 xl:divide-x">
              {salesFunnel.map((stage, i) => (
                <li key={stage.stage} className="flex flex-col p-5">
                  <div className="text-[12px] tabular-nums text-ink-subtle">{t("growth.step", { number: i + 1 })}</div>
                  <div className="mt-0.5 text-sm font-medium text-ink">{stage.stage}</div>
                  <p className="mt-1.5 text-[13px] leading-snug text-ink-muted">{stage.goal}</p>
                  <ul className="mt-3 flex-1 space-y-1">
                    {stage.tactics.map((tactic, j) => (
                      <li key={j} className="flex gap-2 text-[12.5px] leading-snug text-ink-muted">
                        <span aria-hidden className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-ink-subtle" />
                        {tactic}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 border-t border-border pt-3 text-[12.5px]">
                    <div className="text-ink-subtle">{stage.metric}</div>
                    <div className="font-medium tabular-nums text-ink">{stage.conversionTarget}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </section>
      )}
    </div>
  );
}
