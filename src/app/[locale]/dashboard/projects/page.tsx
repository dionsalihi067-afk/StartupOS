"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import type { BusinessSummary } from "@/lib/businesses/types";
import { deleteBusiness, loadMoreBusinesses, refreshBusinesses, setActiveBusinessId, useBusinesses } from "@/lib/client/businesses";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState, InlineNotice, LoadError } from "@/components/dashboard/EmptyState";
import { MigrationBanner } from "@/components/dashboard/MigrationBanner";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { BusinessAvatar } from "@/components/ui/Logo";
import { Badge, Button, ButtonLink, Card, PageSkeleton } from "@/components/ui/primitives";
import { businessCategory, businessName, launchProgress, summaryStatus } from "@/lib/client/insights";
import { useFormat, useT } from "@/i18n/client";
import { Link } from "@/i18n/navigation";

export default function ProjectsPage() {
  const { businesses, active, ready, error, hasMore } = useBusinesses();
  const [pendingDelete, setPendingDelete] = React.useState<BusinessSummary | null>(null);
  const [deleteFailed, setDeleteFailed] = React.useState(false);
  const [more, setMore] = React.useState<"idle" | "loading" | "failed">("idle");
  const t = useT();
  const format = useFormat();

  const loadMore = () => {
    setMore("loading");
    loadMoreBusinesses().then(
      () => setMore("idle"),
      () => setMore("failed"),
    );
  };

  const header = (
    <PageHeader
      title={t("projects.title")}
      description={
        !businesses.length
          ? t("projects.descriptionEmpty")
          : hasMore
            ? t("projects.descriptionPartial", { count: businesses.length })
            : t("projects.descriptionCount", { count: businesses.length })
      }
      actions={
        businesses.length ? (
          <ButtonLink href="/dashboard/generate">
            <Plus size={16} aria-hidden /> {t("navigation.newBusiness")}
          </ButtonLink>
        ) : undefined
      }
    />
  );

  if (error) {
    return (
      <div>
        {header}
        <LoadError onRetry={() => void refreshBusinesses()} />
      </div>
    );
  }

  if (!ready) return <PageSkeleton label={t("common.loadingLabel")} />;

  if (businesses.length === 0) {
    return (
      <div>
        {header}
        <MigrationBanner className="mb-6" />
        <EmptyState />
      </div>
    );
  }

  return (
    <div>
      {header}
      <MigrationBanner className="mb-6" />

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("projects.tableCaption")}</caption>
          <thead className="hidden border-b border-border bg-surface-2 text-left text-[12px] text-ink-subtle md:table-header-group">
            <tr>
              <th scope="col" className="px-5 py-2.5 font-medium">{t("projects.columns.business")}</th>
              <th scope="col" className="px-3 py-2.5 font-medium">{t("projects.columns.status")}</th>
              <th scope="col" className="px-3 py-2.5 font-medium">{t("projects.columns.checklist")}</th>
              <th scope="col" className="px-3 py-2.5 font-medium">{t("projects.columns.created")}</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">
                <span className="sr-only">{t("projects.columns.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {businesses.map((b) => {
              const isActive = active?.id === b.id;
              const isReady = b.status === "ready";
              const status = summaryStatus(b, t);
              const lp = launchProgress(b);
              const name = businessName(b, t);
              return (
                <tr key={b.id} className="flex flex-col gap-3 px-4 py-4 md:table-row md:p-0">
                  <td className="md:px-5 md:py-3.5">
                    <div className="flex items-center gap-3">
                      <BusinessAvatar name={name} iconUrl={b.iconUrl} className="h-9 w-9 rounded-md text-sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link href={`/dashboard/projects/${b.id}`} className="truncate font-medium text-ink hover:underline">
                            {name}
                          </Link>
                          {isActive && <Badge tone="outline">{t("status.active")}</Badge>}
                        </div>
                        <div className="truncate text-[12.5px] text-ink-subtle">
                          {businessCategory(b.idea, t)}
                          {b.location ? ` · ${b.location}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="flex flex-wrap items-center gap-x-3 gap-y-1 md:table-cell md:px-3 md:py-3.5">
                    <Badge tone={status.tone} dot>
                      {status.label}
                    </Badge>
                    {isReady && (
                      <span className="text-[12.5px] text-ink-subtle md:hidden">
                        {t("projects.mobileMeta", { done: lp.done, total: lp.total, date: format.relativeDate(b.createdAt) })}
                      </span>
                    )}
                  </td>
                  <td className="hidden tabular-nums text-ink-muted md:table-cell md:px-3 md:py-3.5">
                    {isReady ? `${lp.done} / ${lp.total}` : "—"}
                  </td>
                  <td className="hidden text-ink-muted md:table-cell md:px-3 md:py-3.5">{format.relativeDate(b.createdAt)}</td>
                  <td className="md:px-5 md:py-3.5">
                    <div className="flex items-center gap-1.5 md:justify-end">
                      {isReady && !isActive && (
                        <Button size="sm" variant="ghost" onClick={() => setActiveBusinessId(b.id)}>
                          {t("projects.setActive")}
                        </Button>
                      )}
                      {b.status !== "generating" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setDeleteFailed(false);
                            setPendingDelete(b);
                          }}
                          aria-label={t("projects.deleteAria", { name })}
                          className="hover:text-danger"
                        >
                          <Trash2 size={15} aria-hidden />
                        </Button>
                      )}
                      <ButtonLink href={`/dashboard/projects/${b.id}`} size="sm" variant="secondary">
                        {t("common.open")}
                      </ButtonLink>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      {hasMore && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <Button variant="secondary" onClick={loadMore} disabled={more === "loading"} aria-busy={more === "loading"}>
            {more === "loading" ? t("common.loadingLabel") : t("projects.loadMore")}
          </Button>
          {more === "failed" && (
            <p role="alert" className="text-[13px] text-danger">
              {t("projects.loadMoreFailed")}
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("projects.deleteTitle", { name: pendingDelete ? businessName(pendingDelete, t) : "" })}
        description={
          <>
            {t("projects.deleteDescription")}
            {deleteFailed && <InlineNotice tone="danger" title={t("errors.data.deleteFailed")} className="mt-3" />}
          </>
        }
        confirmLabel={t("projects.deleteConfirm")}
        destructive
        onConfirm={async () => {
          if (!pendingDelete) return;
          setDeleteFailed(false);
          try {
            await deleteBusiness(pendingDelete.id);
          } catch (err) {
            setDeleteFailed(true);
            throw err;
          }
        }}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
