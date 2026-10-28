"use client";

import * as React from "react";
import type { GeneratedSectionId } from "@/lib/dependencies";
import { ApiError, regenerateBusinessSections } from "@/lib/client/businesses";
import { regenerationSummary } from "@/lib/client/insights";
import { Button, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { InlineNotice } from "@/components/dashboard/EmptyState";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";

function sectionLabelKey(section: GeneratedSectionId): MessageKey {
  return `steps.${section}` as MessageKey;
}

/**
 * Offers scoped regeneration after a meaningful business-context save.
 * Context is already persisted; dismissing this keeps generated output as-is.
 */
export function ScopedRegenerationPanel({
  businessId,
  affected,
  reason = "context",
  onClose,
  onComplete,
}: {
  businessId: string;
  affected: readonly GeneratedSectionId[];
  /** context: offered after the business context changed · incomplete: retrying sections that failed or fell back. */
  reason?: "context" | "incomplete";
  onClose: () => void;
  onComplete: () => void;
}) {
  const copy = reason === "incomplete" ? "regeneration.incomplete" : "regeneration";
  const t = useT();
  const [selected, setSelected] = React.useState<Set<GeneratedSectionId>>(() => new Set(affected));
  const [running, setRunning] = React.useState(false);
  const [done, setDone] = React.useState<Set<GeneratedSectionId>>(new Set());
  const [fellBack, setFellBack] = React.useState<Set<GeneratedSectionId>>(new Set());
  const [refused, setRefused] = React.useState(false);
  const [failed, setFailed] = React.useState<Set<GeneratedSectionId>>(new Set());
  const [error, setError] = React.useState<"failed" | "rateLimited" | null>(null);

  function toggle(section: GeneratedSectionId) {
    if (running) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  async function regenerate() {
    if (running || selected.size === 0) return;
    setRunning(true);
    setError(null);
    setFailed(new Set());
    setDone(new Set());
    setFellBack(new Set());
    setRefused(false);

    const sections = affected.filter((s) => selected.has(s));
    try {
      const summary = regenerationSummary(await regenerateBusinessSections(businessId, sections));
      setDone(new Set(summary.updated));
      setFellBack(new Set(summary.templateOnly));
      setRefused(summary.providerRefused);
      setFailed(new Set(summary.failed));
      if (summary.complete) onComplete();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? "rateLimited" : "failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="mb-5">
      <CardHeader
        title={t(`${copy}.title`)}
        description={t(`${copy}.description`)}
        actions={
          !running ? (
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              {t("regeneration.keepExisting")}
            </Button>
          ) : undefined
        }
      />
      <CardBody className="space-y-4">
        <p className="text-[13px] text-ink-muted">{t(`${copy}.hint`)}</p>
        <ul className="divide-y divide-border rounded-md border border-border">
          {affected.map((section) => {
            const checked = selected.has(section);
            const isDone = done.has(section);
            const isFailed = failed.has(section);
            const isTemplate = fellBack.has(section);
            const isRunning = running && checked && !isDone && !isFailed;
            return (
              <li key={section} className="flex items-center gap-3 px-4 py-2.5">
                <input
                  id={`regen-${section}`}
                  type="checkbox"
                  className="h-4 w-4 rounded border-border text-brand focus-visible:outline-brand"
                  checked={checked}
                  disabled={running}
                  onChange={() => toggle(section)}
                />
                <label htmlFor={`regen-${section}`} className="min-w-0 flex-1 text-sm text-ink">
                  {t(sectionLabelKey(section))}
                </label>
                <span className="shrink-0 text-[12px] text-ink-subtle">
                  {isRunning
                    ? t("regeneration.status.running")
                    : isFailed
                      ? t("regeneration.status.failed")
                      : isTemplate
                        ? t("regeneration.status.template")
                        : isDone
                          ? t("regeneration.status.done")
                          : null}
                </span>
              </li>
            );
          })}
        </ul>

        {error && <InlineNotice tone="danger" title={t(`regeneration.${error}`)} />}
        {failed.size > 0 && !error && (
          <InlineNotice tone="warning" title={t("regeneration.partialFailed")}>
            {refused && fellBack.size === 0 ? t("workspace.incomplete.providerRefused") : undefined}
          </InlineNotice>
        )}
        {fellBack.size > 0 && !error && (
          <InlineNotice tone="warning" title={t("regeneration.templateOnly")}>
            {refused ? t("workspace.incomplete.providerRefused") : undefined}
          </InlineNotice>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" disabled={running || selected.size === 0} onClick={() => void regenerate()}>
            {running ? t("regeneration.running") : t("regeneration.confirm")}
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={running} onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
