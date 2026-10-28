"use client";

import * as React from "react";
import type { BusinessPackage } from "@/lib/types";
import { loadBusiness, refreshBusinesses, useBusiness, useBusinesses } from "@/lib/client/businesses";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState, LoadError } from "@/components/dashboard/EmptyState";
import { PageSkeleton } from "@/components/ui/primitives";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";

/** Page frame for a business section that renders the active business. */
export function CenterShell({
  titleKey,
  descriptionKey,
  meta,
  actions,
  children,
}: {
  titleKey: MessageKey;
  descriptionKey: MessageKey;
  meta?: (pkg: BusinessPackage) => React.ReactNode;
  actions?: (pkg: BusinessPackage) => React.ReactNode;
  children: (pkg: BusinessPackage) => React.ReactNode;
}) {
  const { active, ready, error } = useBusinesses();
  const detail = useBusiness(active?.id ?? null);
  const t = useT();
  const title = t(titleKey);
  const description = t(descriptionKey);

  if (error) {
    return (
      <div>
        <PageHeader title={title} description={description} />
        <LoadError onRetry={() => void refreshBusinesses()} />
      </div>
    );
  }

  if (!ready) return <PageSkeleton label={t("common.loadingLabel")} />;

  if (!active) {
    return (
      <div>
        <PageHeader title={title} description={description} />
        <EmptyState description={t("emptyState.sectionNeedsBusiness")} />
      </div>
    );
  }

  const pkg = detail.business?.package;
  if (detail.status === "loading") return <PageSkeleton label={t("common.loadingLabel")} />;
  if (!pkg) {
    return (
      <div>
        <PageHeader title={title} description={description} />
        <LoadError onRetry={() => void (detail.status === "error" ? loadBusiness(active.id) : refreshBusinesses())} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={title} description={description} meta={meta?.(pkg)} actions={actions?.(pkg)} />
      {children(pkg)}
    </div>
  );
}
