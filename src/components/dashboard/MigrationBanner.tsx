"use client";

import * as React from "react";
import { HardDriveUpload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { useSession } from "@/components/auth/SessionProvider";
import { refreshBusinesses } from "@/lib/client/businesses";
import {
  importLegacyProjects,
  isMigrationSkipped,
  pendingLegacyProjects,
  skipMigration,
  type ImportOutcome,
  type LegacyProject,
} from "@/lib/client/legacy";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

function useLegacyImport(userId: string) {
  const [pending, setPending] = React.useState<LegacyProject[] | null>(null);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [outcomes, setOutcomes] = React.useState<ImportOutcome[] | null>(null);
  const running = React.useRef(false);

  React.useEffect(() => {
    setPending(pendingLegacyProjects(userId));
  }, [userId]);

  async function start() {
    if (running.current) return;
    const list = pendingLegacyProjects(userId);
    if (!list.length) return;
    running.current = true;
    setOutcomes(null);
    setProgress({ done: 0, total: list.length });
    try {
      const results = await importLegacyProjects(userId, list, (done) => setProgress({ done, total: list.length }));
      setOutcomes(results);
      if (results.some((r) => r.status === "imported" || r.status === "duplicate")) void refreshBusinesses();
    } finally {
      running.current = false;
      setProgress(null);
      setPending(pendingLegacyProjects(userId));
    }
  }

  return { pending, progress, outcomes, start };
}

/**
 * Offers to copy businesses saved in this browser (before accounts existed)
 * into the signed-in account. Browser data is left untouched either way.
 */
export function MigrationBanner({ variant = "banner", className }: { variant?: "banner" | "settings"; className?: string }) {
  const t = useT();
  const { user } = useSession();
  const { pending, progress, outcomes, start } = useLegacyImport(user.id);
  const [skipped, setSkipped] = React.useState(false);

  React.useEffect(() => {
    setSkipped(isMigrationSkipped(user.id));
  }, [user.id]);

  if (pending === null) return null;

  const imported = outcomes?.filter((o) => o.status === "imported" || o.status === "duplicate").length ?? 0;
  const failed = outcomes?.filter((o) => o.status !== "imported" && o.status !== "duplicate") ?? [];
  const retryable = failed.some((o) => o.status === "network" || o.status === "failed");
  const isBanner = variant === "banner";

  if (isBanner && !progress && (skipped || (!outcomes && pending.length === 0))) return null;

  if (!isBanner && pending.length === 0 && !outcomes) {
    return <p className={cn("text-sm text-ink-muted", className)}>{t("migration.nothingToImport")}</p>;
  }

  return (
    <div
      role="region"
      aria-label={t("migration.title")}
      className={cn(isBanner && "rounded-lg border border-border bg-surface-2 px-4 py-4", className)}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {isBanner && (
          <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-ink-muted sm:flex">
            <HardDriveUpload size={18} aria-hidden />
          </div>
        )}
        <div className="min-w-0 flex-1" aria-live="polite">
          {progress ? (
            <p className="text-sm font-medium text-ink">{t("migration.progress", { done: progress.done, total: progress.total })}</p>
          ) : outcomes ? (
            <>
              {imported > 0 && <p className="text-sm font-medium text-ink">{t("migration.imported", { count: imported })}</p>}
              {failed.length > 0 && (
                <>
                  <p className="text-sm font-medium text-danger">{t("migration.someFailed", { count: failed.length })}</p>
                  <ul className="mt-1.5 space-y-0.5 text-[13px] text-ink-muted">
                    {failed.map((o) => (
                      <li key={o.project.id}>
                        <span className="font-medium text-ink">{o.project.name}</span> —{" "}
                        {t(o.status === "invalid" ? "migration.reasonInvalid" : "migration.reasonRetry")}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="mt-1.5 text-[13px] text-ink-muted">{t("migration.keptLocally")}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-ink">{t("migration.found", { count: pending.length })}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{t("migration.description")}</p>
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {progress ? (
            <Button size="sm" disabled>
              <Loader2 size={14} className="animate-spin" aria-hidden /> {t("migration.importing")}
            </Button>
          ) : outcomes ? (
            <>
              {retryable && (
                <Button size="sm" onClick={() => void start()}>
                  {t("common.tryAgain")}
                </Button>
              )}
              {isBanner && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    skipMigration(user.id);
                    setSkipped(true);
                  }}
                >
                  {t("migration.dismiss")}
                </Button>
              )}
            </>
          ) : pending.length > 0 ? (
            <>
              <Button size="sm" onClick={() => void start()}>
                {t("migration.import")}
              </Button>
              {isBanner && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    skipMigration(user.id);
                    setSkipped(true);
                  }}
                >
                  {t("migration.skip")}
                </Button>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
