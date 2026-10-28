"use client";

import * as React from "react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

const CONTROL =
  "w-full rounded-[var(--radius-control)] border bg-surface px-3.5 text-sm text-ink outline-none transition-[border-color,box-shadow,background-color] duration-[var(--duration-base)] ease-[var(--ease-out-soft)] placeholder:text-ink-subtle hover:border-ink-subtle/50 focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[color:var(--focus-ring)] disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60";

export function Field({
  id,
  label,
  hint,
  error,
  optional,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const t = useT();
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline gap-1.5 text-[13px] font-medium text-ink">
        {label}
        {optional && <span className="font-normal text-ink-subtle">{t("common.optional")}</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[12.5px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[12.5px] text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string | undefined, invalid: boolean | undefined, hasHint: boolean | undefined) {
  if (!id) return undefined;
  if (invalid) return `${id}-error`;
  return hasHint ? `${id}-hint` : undefined;
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; hasHint?: boolean }
>(function Input({ className, invalid, hasHint, id, ...props }, ref) {
  return (
    <input
      ref={ref}
      id={id}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy(id, invalid, hasHint)}
      className={cn(CONTROL, "h-10", invalid ? "border-danger" : "border-border-strong", className)}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean; hasHint?: boolean }
>(function Textarea({ className, invalid, hasHint, id, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      id={id}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy(id, invalid, hasHint)}
      className={cn(CONTROL, "resize-none py-2 leading-relaxed", invalid ? "border-danger" : "border-border-strong", className)}
      {...props}
    />
  );
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...props },
  ref,
) {
  return <select ref={ref} className={cn(CONTROL, "h-10 border-border-strong pr-8", className)} {...props} />;
});
