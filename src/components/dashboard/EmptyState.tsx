"use client";

import * as React from "react";
import { AlertCircle, Plus, RotateCcw, type LucideIcon } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/primitives";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: LucideIcon;
  title?: string;
  description?: React.ReactNode;
  /** Defaults to a "Create a business" link. Pass `null` for no action. */
  action?: React.ReactNode | null;
  className?: string;
  compact?: boolean;
}) {
  const t = useT();
  const heading = title ?? t("emptyState.noBusinessTitle");
  const body = description === undefined ? t("emptyState.noBusinessDescription") : description;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface px-6 text-center",
        compact ? "py-10" : "py-16 sm:py-20",
        className,
      )}
    >
      {Icon && (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Icon size={20} strokeWidth={1.75} aria-hidden />
        </div>
      )}
      <h2 className="text-base font-semibold tracking-tight text-ink">{heading}</h2>
      {body && <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-muted">{body}</p>}
      {action === undefined ? (
        <ButtonLink href="/dashboard/generate" className="mt-5">
          <Plus size={16} aria-hidden /> {t("emptyState.createBusiness")}
        </ButtonLink>
      ) : action ? (
        <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}

export function InlineNotice({
  tone = "neutral",
  title,
  children,
  action,
  className,
}: {
  tone?: "neutral" | "warning" | "danger" | "success";
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : tone === "success" ? "status" : undefined}
      className={cn(
        "flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-start",
        tone === "danger"
          ? "border-danger/25 bg-danger-soft"
          : tone === "warning"
            ? "border-warning/25 bg-warning-soft"
            : tone === "success"
              ? "border-success/25 bg-success-soft"
              : "border-border bg-surface",
        className,
      )}
    >
      <AlertCircle
        size={16}
        aria-hidden
        className={cn(
          "mt-0.5 hidden shrink-0 sm:block",
          tone === "danger"
            ? "text-danger"
            : tone === "warning"
              ? "text-warning"
              : tone === "success"
                ? "text-success"
                : "text-ink-subtle",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        {children && <div className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Localized "couldn't load your data" notice with a retry action. Never shows server details. */
export function LoadError({ onRetry, className }: { onRetry: () => void; className?: string }) {
  const t = useT();
  return (
    <InlineNotice
      tone="danger"
      title={t("errors.data.loadFailed")}
      className={className}
      action={
        <Button size="sm" variant="secondary" onClick={onRetry}>
          <RotateCcw size={14} aria-hidden /> {t("common.tryAgain")}
        </Button>
      }
    />
  );
}
