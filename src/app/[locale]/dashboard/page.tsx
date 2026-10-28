"use client";

import * as React from "react";
import { ArrowRight, Check, ChevronRight, Plus } from "lucide-react";
import type { BusinessPackage } from "@/lib/types";
import { loadBusiness, refreshBusinesses, useBusiness, useBusinesses } from "@/lib/client/businesses";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { BusinessCard } from "@/components/dashboard/BusinessCard";
import { LoadError } from "@/components/dashboard/EmptyState";
import { MigrationBanner } from "@/components/dashboard/MigrationBanner";
import { BusinessAvatar, packageIconUrl } from "@/components/ui/Logo";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  PageSkeleton,
  ProgressBar,
  SectionHeader,
  Skeleton,
} from "@/components/ui/primitives";
import { businessCategory, businessStatus, launchProgress, nextActions, sectionHref } from "@/lib/client/insights";
import { useFormat, useT } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import type { MessageKey } from "@/i18n/messages";

export default function HomePage() {
  const { businesses, active, ready, error } = useBusinesses();
  const t = useT();

  if (error) {
    return (
      <div>
        <PageHeader title={t("home.title")} description={t("home.description")} />
        <LoadError onRetry={() => void refreshBusinesses()} />
      </div>
    );
  }
  if (!ready) return <PageSkeleton label={t("common.loadingLabel")} />;
  if (businesses.length === 0) {
    return (
      <div>
        <MigrationBanner className="mb-6" />
        <Onboarding />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow={t("navigation.workspace")}
        title={t("home.title")}
        description={t("home.description")}
        actions={
          <ButtonLink href="/dashboard/generate" variant="secondary" size="sm">
            <Plus size={15} aria-hidden /> {t("navigation.newBusiness")}
          </ButtonLink>
        }
      />
      <MigrationBanner className="mb-6" />

      {active && <ActiveBusiness id={active.id} />}

      <section className={active ? "mt-10" : undefined} aria-labelledby="businesses-heading">
        <SectionHeader
          id="businesses-heading"
          title={t("home.yourBusinesses")}
          description={t("home.savedCount", { count: businesses.length })}
          actions={
            businesses.length > 6 ? (
              <ButtonLink href="/dashboard/projects" variant="ghost" size="sm">
                {t("home.viewAll")} <ArrowRight size={14} aria-hidden />
              </ButtonLink>
            ) : undefined
          }
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {businesses.slice(0, 6).map((b) => (
            <BusinessCard key={b.id} business={b} active={b.id === active?.id} />
          ))}
          <Link
            href="/dashboard/generate"
            className="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-border-strong text-sm text-ink-muted transition-colors hover:border-brand hover:bg-brand-soft/40 hover:text-ink"
          >
            <Plus size={18} aria-hidden />
            {t("navigation.newBusiness")}
          </Link>
        </div>
      </section>
    </div>
  );
}

function ActiveBusiness({ id }: { id: string }) {
  const detail = useBusiness(id);
  const pkg = detail.business?.package;
  if (detail.status === "loading") {
    return (
      <div aria-hidden className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Skeleton className="h-[300px] rounded-[var(--radius-card)]" />
        <Skeleton className="h-[300px] rounded-[var(--radius-card)]" />
      </div>
    );
  }
  if (!pkg) return <LoadError onRetry={() => void loadBusiness(id)} />;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <ContinueCard pkg={pkg} />
      <NextStepsCard pkg={pkg} />
    </div>
  );
}

function ContinueCard({ pkg }: { pkg: BusinessPackage }) {
  const t = useT();
  const format = useFormat();
  const lp = launchProgress(pkg);
  const status = businessStatus(pkg, t);
  const quick: { labelKey: MessageKey; href: string }[] = [
    { labelKey: "navigation.brand", href: sectionHref("brand") },
    { labelKey: "navigation.website", href: sectionHref("website") },
    { labelKey: "navigation.marketing", href: sectionHref("marketing") },
    { labelKey: "navigation.launch", href: sectionHref("launch") },
  ];

  return (
    <Card className="flex flex-col ring-1 ring-brand/10">
      <CardHeader title={t("home.continueWorking")} description={t("home.continueHint")} />
      <CardBody className="flex flex-1 flex-col">
        <div className="flex items-start gap-4">
          <BusinessAvatar name={pkg.brand.name} iconUrl={packageIconUrl(pkg.brand.logo)} className="h-12 w-12 rounded-lg text-base" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold tracking-tight text-ink">{pkg.brand.name}</h2>
              <Badge tone={status.tone} dot>
                {status.label}
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-muted">{pkg.brand.slogan}</p>
            <p className="mt-1 text-[12.5px] text-ink-subtle">
              {businessCategory(pkg.input, t)}
              {pkg.input.location ? ` · ${pkg.input.location}` : ""} · {format.created(pkg.createdAt)}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-lg bg-surface-2 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
            <span className="font-medium text-ink">{t("home.launchChecklist")}</span>
            <span className="tabular-nums text-ink-muted">{t("home.checklistDone", { done: lp.done, total: lp.total })}</span>
          </div>
          <ProgressBar value={lp.pct} label={t("home.checklistProgress")} className="mt-2.5" />
        </div>

        <div className="mt-auto flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label={t("home.jumpToSection")} className="flex flex-wrap gap-1">
            {quick.map((q) => (
              <Link
                key={q.labelKey}
                href={q.href}
                className="rounded-md px-2 py-1 text-[13px] text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                {t(q.labelKey)}
              </Link>
            ))}
          </nav>
          <ButtonLink href={`/dashboard/projects/${pkg.id}`}>
            {t("home.openWorkspace")} <ArrowRight size={15} aria-hidden />
          </ButtonLink>
        </div>
      </CardBody>
    </Card>
  );
}

function NextStepsCard({ pkg }: { pkg: BusinessPackage }) {
  const t = useT();
  const actions = nextActions(pkg, t);
  return (
    <Card className="flex flex-col">
      <CardHeader title={t("home.nextSteps")} description={t("home.nextStepsFor", { name: pkg.brand.name })} />
      {actions.length === 0 ? (
        <CardBody className="flex flex-1 items-center justify-center text-center text-sm text-ink-muted">
          {t("home.allComplete")}
        </CardBody>
      ) : (
        <ul className="divide-y divide-border">
          {actions.map((a) => (
            <li key={a.title}>
              <Link href={a.href} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{a.title}</div>
                  <div className="truncate text-[12.5px] text-ink-subtle">{a.reason}</div>
                </div>
                <ChevronRight size={15} className="shrink-0 text-ink-subtle group-hover:text-ink" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const ONBOARDING_STEPS = ["describe", "draft", "review"] as const;
const ONBOARDING_OUTPUTS = ["brand", "website", "marketing", "research", "pricing", "growth"] as const;

function Onboarding() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t("onboarding.title")} description={t("onboarding.description")} />
      <div className="mb-6 rounded-[var(--radius-card)] border border-brand/20 bg-brand-soft/60 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{t("onboarding.ctaTitle")}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{t("onboarding.ctaBody")}</p>
          </div>
          <ButtonLink href="/dashboard/generate" className="shrink-0">
            <Plus size={16} aria-hidden /> {t("onboarding.createFirst")}
          </ButtonLink>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title={t("onboarding.howItWorks")} />
          <CardBody>
            <ol className="space-y-5">
              {ONBOARDING_STEPS.map((s, i) => (
                <li key={s} className="flex gap-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-[12px] font-semibold tabular-nums text-brand">
                    {i + 1}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-ink">{t(`onboarding.steps.${s}.title`)}</div>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{t(`onboarding.steps.${s}.body`)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("onboarding.whatYouGet")} />
          <CardBody>
            <ul className="space-y-2.5">
              {ONBOARDING_OUTPUTS.map((o) => (
                <li key={o} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-muted">
                  <Check size={14} className="mt-0.5 shrink-0 text-brand" aria-hidden />
                  {t(`onboarding.outputs.${o}`)}
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-border pt-4 text-[12.5px] text-ink-subtle">{t("onboarding.storageNote")}</p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
