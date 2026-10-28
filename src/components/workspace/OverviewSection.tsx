"use client";

import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { BusinessPackage } from "@/lib/types";
import { Badge, Button, Card, CardBody, CardHeader, DataList, ProgressBar } from "@/components/ui/primitives";
import { Provenance } from "@/components/ui/Provenance";
import { InlineNotice } from "@/components/dashboard/EmptyState";
import {
  businessCategory,
  launchProgress,
  nextActions,
  overviewBudgetLabel,
  overviewJoined,
  overviewPositioning,
  type SectionKey,
} from "@/lib/client/insights";
import { assessPackageConsistency } from "@/lib/consistency/package-consistency";
import { buildBusinessProfile, contextReadiness, type ProfileFactKey } from "@/lib/engine/profile";
import { packageQuality, type GenerationLimitation } from "@/lib/generation-quality";
import { useFormat, useT } from "@/i18n/client";
import { AGENT_STEP_KEYS, STYLE_KEYS } from "@/i18n/labels";
import type { MessageKey } from "@/i18n/messages";
import { Link } from "@/i18n/navigation";
import type { Translator } from "@/i18n/translator";

const CONTEXT_FACT_KEYS: Partial<Record<ProfileFactKey, MessageKey>> = {
  customers: "overview.context.facts.customers",
  market: "overview.context.facts.market",
  industry: "overview.context.facts.industry",
};

/** Display label for a stored style value; unknown values are shown as stored. */
export function styleLabel(style: string, t: Translator): string {
  const key = STYLE_KEYS[style as keyof typeof STYLE_KEYS];
  return key ? t(`styles.${key}.label`) : style;
}

/** Edits newer than this after creation count as a separate "last edited" event. */
const EDIT_THRESHOLD_MS = 60_000;

export function OverviewSection({
  pkg,
  onJump,
  onEditContext,
  updatedAt,
}: {
  pkg: BusinessPackage;
  onJump: (section: SectionKey) => void;
  onEditContext?: () => void;
  updatedAt?: string;
}) {
  const t = useT();
  const format = useFormat();
  const lp = launchProgress(pkg);
  const actions = nextActions(pkg, t, 3);
  const d = pkg.input.discovery;
  const positioning = overviewPositioning(pkg);

  const snapshot = d
    ? [
        { label: t("overview.fields.stage"), value: t(`discovery.options.stage.${d.business.stage}.label`) },
        {
          label: t("overview.fields.market"),
          value: overviewJoined([
            d.customer.geography || d.business.location || pkg.input.location,
            t(`discovery.options.type.${d.business.type}.label`),
          ]),
        },
        {
          label: t("overview.fields.customer"),
          value: overviewJoined([d.customer.ideal || pkg.input.audience, t(`discovery.options.customerType.${d.customer.type}.label`)]),
        },
        {
          label: t("overview.fields.model"),
          value: d.model.revenue.map((r) => t(`discovery.options.revenue.${r}`)).join(", ") || "—",
        },
        { label: t("overview.fields.budget"), value: overviewBudgetLabel(pkg.input.budget, t) },
        ...(d.offer.main?.trim() ? [{ label: t("overview.fields.offer"), value: d.offer.main.trim() }] : []),
        { label: t("overview.fields.priority"), value: t(`discovery.options.priority.${d.goals.priority}`) },
      ]
    : [
        { label: t("overview.fields.idea"), value: pkg.input.idea || "—" },
        { label: t("overview.fields.customer"), value: pkg.input.audience || "—" },
        { label: t("overview.fields.market"), value: pkg.input.location || "—" },
        { label: t("overview.fields.budget"), value: overviewBudgetLabel(pkg.input.budget, t) },
        { label: t("overview.fields.category"), value: businessCategory(pkg.input, t) },
      ];

  const edited = updatedAt && Date.parse(updatedAt) - Date.parse(pkg.createdAt) > EDIT_THRESHOLD_MS ? updatedAt : null;
  const quality = packageQuality(pkg);
  const consistencyIssues = assessPackageConsistency(pkg);
  const softConsistency = consistencyIssues.filter((i) => i.severity === "warning");
  const readiness = contextReadiness(buildBusinessProfile(pkg.input));

  const notices = (
    <>
      {quality.outcome === "degraded" && (
        <InlineNotice tone="warning" title={t("overview.generation.degradedTitle")}>
          <p>{t("overview.generation.degradedBody")}</p>
          {quality.limitations.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {quality.limitations.map((code) => (
                <li key={code}>{limitationLabel(code, t)}</li>
              ))}
            </ul>
          )}
        </InlineNotice>
      )}
      {quality.outcome === "provisional" && (
        <InlineNotice tone="warning" title={t("overview.generation.provisionalTitle")}>
          <p>{t("overview.generation.provisionalBody")}</p>
          {quality.limitations.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {quality.limitations.map((code) => (
                <li key={code}>{limitationLabel(code, t)}</li>
              ))}
            </ul>
          )}
        </InlineNotice>
      )}
      {quality.outcome === "success" &&
        quality.limitations.some((c) => c === "researchLimited" || c === "logoUnavailable" || c === "thinEvidence" || c === "optionalFallback") && (
        <InlineNotice tone="neutral" title={t("overview.generation.successWithNotesTitle")}>
          <p>{t("overview.generation.successWithNotesBody")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {quality.limitations.map((code) => (
              <li key={code}>{limitationLabel(code, t)}</li>
            ))}
          </ul>
        </InlineNotice>
      )}
      {softConsistency.length > 0 && quality.outcome === "success" && (
        <InlineNotice tone="warning" title={t("overview.generation.consistencySoftTitle")}>
          <p>{t("overview.generation.consistencySoftBody")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {softConsistency.map((issue) => (
              <li key={issue.id}>{issue.detail}</li>
            ))}
          </ul>
        </InlineNotice>
      )}
      {readiness.blocking.length > 0 && (
        <InlineNotice tone="neutral" title={t("overview.context.gapsTitle")}>
          <p>{t("overview.context.gapsBody")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {readiness.blocking
              .map((key) => CONTEXT_FACT_KEYS[key])
              .filter((key): key is MessageKey => Boolean(key))
              .map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
          </ul>
        </InlineNotice>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-3">{notices}</div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-12">
        <Card className="surface-interactive overflow-hidden border-border/90 lg:col-span-7">
          <CardBody className="space-y-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-subtle">{t("overview.businessTitle")}</p>
                <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">{pkg.brand.name}</h2>
                {pkg.brand.slogan && <p className="mt-1 text-[14px] text-ink-muted">{pkg.brand.slogan}</p>}
              </div>
              {pkg.brand.palette?.length ? (
                <div className="flex h-8 overflow-hidden rounded-md border border-border" aria-hidden>
                  {pkg.brand.palette.slice(0, 5).map((c) => (
                    <span key={c.role} className="h-full w-7" style={{ background: c.hex }} />
                  ))}
                </div>
              ) : null}
            </div>
            {positioning && (
              <div className="rounded-xl border border-border/80 bg-surface-2/50 p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[12px] font-medium text-ink-subtle">{t("overview.positioning")}</p>
                  {positioning.source === "ai" && <Provenance kind="ai" />}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-ink">{positioning.text}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" className="-ml-2" onClick={() => onJump("brand")}>
                {t("overview.editBrand")} <ChevronRight size={14} aria-hidden />
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onJump("website")}>
                {t("navigation.website")} <ChevronRight size={14} aria-hidden />
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader title={t("overview.launchReadiness")} description={t("overview.readinessDescription")} />
          <CardBody>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-3xl font-semibold tabular-nums tracking-tight text-ink">{format.percent(lp.pct)}</span>
              <span className="text-[13px] text-ink-subtle">
                {t("overview.checklistItemsDone", { done: lp.done, total: lp.total })}
              </span>
            </div>
            <ProgressBar value={lp.pct} label={t("overview.launchReadiness")} className="mt-3" />
            <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={() => onJump("launch")}>
              {t("overview.openLaunchChecklist")}
            </Button>
          </CardBody>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader
            title={t("overview.snapshotTitle")}
            description={d ? t("overview.snapshotDescription") : t("overview.snapshotLegacy")}
            actions={
              onEditContext ? (
                <Button type="button" variant="ghost" size="sm" onClick={onEditContext}>
                  {t("discovery.edit.action")}
                </Button>
              ) : undefined
            }
          />
          <CardBody>
            <DataList items={snapshot} />
          </CardBody>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader title={t("overview.nextSteps")} />
          {actions.length === 0 ? (
            <CardBody className="text-sm text-ink-muted">{t("overview.nothingOutstanding")}</CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {actions.map((a) => {
                const inner = (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink">{a.title}</div>
                      <div className="text-[12.5px] leading-snug text-ink-subtle">{a.reason}</div>
                    </div>
                    <ChevronRight size={15} className="shrink-0 text-ink-subtle group-hover:text-ink" aria-hidden />
                  </>
                );
                const cls = "group flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-2";
                const section = a.section;
                return (
                  <li key={a.title}>
                    {section ? (
                      <button type="button" className={cls} onClick={() => onJump(section)}>
                        {inner}
                      </button>
                    ) : (
                      <Link href={a.href} className={cls}>
                        {inner}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-12">
          <CardHeader title={t("overview.activity.title")} />
          <ul className="divide-y divide-border text-[13px] sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {edited && <ActivityRow label={t("overview.activity.edited")} date={format.relativeDate(edited)} />}
            {lp.done > 0 && (
              <ActivityRow label={t("overview.activity.checklist", { done: lp.done, total: lp.total })} />
            )}
            <ActivityRow label={t("overview.activity.created")} date={format.relativeDate(pkg.createdAt)} />
          </ul>
          <GenerationDetails pkg={pkg} />
        </Card>
      </div>
    </div>
  );
}

function ActivityRow({ label, date }: { label: string; date?: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 px-5 py-2.5">
      <span className="text-ink">{label}</span>
      {date && <span className="shrink-0 tabular-nums text-[12px] text-ink-subtle">{date}</span>}
    </li>
  );
}

function stepName(agent: string, t: Translator) {
  const key = AGENT_STEP_KEYS[agent];
  return key ? t(`steps.${key}`) : agent.replace(/ Agent$/, "");
}

function limitationLabel(code: GenerationLimitation, t: Translator): string {
  switch (code) {
    case "criticalFallback":
      return t("overview.generation.limitations.criticalFallback");
    case "researchLimited":
      return t("overview.generation.limitations.researchLimited");
    case "logoUnavailable":
      return t("overview.generation.limitations.logoUnavailable");
    case "optionalFallback":
      return t("overview.generation.limitations.optionalFallback");
    case "consistencyWarnings":
      return t("overview.generation.limitations.consistencyWarnings");
    case "genericContent":
      return t("overview.generation.limitations.genericContent");
    case "needsOwnerReview":
      return t("overview.generation.limitations.needsOwnerReview");
    case "thinEvidence":
      return t("overview.generation.limitations.thinEvidence");
    default:
      return t("overview.generation.limitations.optionalFallback");
  }
}

function GenerationDetails({ pkg }: { pkg: BusinessPackage }) {
  const t = useT();
  const format = useFormat();
  const ai = pkg.meta.agentLog.filter((l) => l.source === "llm").length;
  const total = pkg.meta.agentLog.length;
  return (
    <details className="group border-t border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-ink">{t("overview.generation.title")}</div>
          <div className="mt-0.5 text-[12px] text-ink-subtle">
            {t("overview.generation.summary", { ai, total, duration: format.seconds(pkg.meta.durationMs) })}
          </div>
        </div>
        <ChevronDown size={16} className="shrink-0 text-ink-subtle transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="divide-y divide-border border-t border-border">
        {pkg.meta.agentLog.map((l, i) => (
          <li key={`${l.agent}-${i}`} className="flex items-center justify-between gap-3 px-5 py-2 text-[12.5px]">
            <span className="min-w-0 truncate text-ink">{stepName(l.agent, t)}</span>
            <span className="flex shrink-0 items-center gap-2">
              {l.status !== "ok" && (
                <Badge tone="warning">
                  {l.status === "fallback" ? t("overview.generation.fallback") : t("overview.generation.error")}
                </Badge>
              )}
              <Provenance kind={l.source === "llm" ? "ai" : "template"} />
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
