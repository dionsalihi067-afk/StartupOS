import * as React from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/* ------------------------------- Button -------------------------------- */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-on-primary shadow-[var(--shadow-btn-primary)] hover:bg-primary-hover hover:shadow-[var(--shadow-btn-primary-hover)] active:bg-primary",
  secondary:
    "bg-surface text-ink border border-border-strong shadow-[var(--shadow-card)] hover:bg-surface-2 hover:border-ink-subtle/40 hover:shadow-[var(--shadow-elevated)]",
  ghost: "bg-transparent text-ink-muted hover:bg-surface-3 hover:text-ink",
  danger: "bg-danger text-white shadow-[0_1px_2px_rgba(197,60,74,0.28)] hover:brightness-95",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-[15px] gap-2",
  icon: "h-10 w-10",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string): string {
  return cn(
    "btn-base inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-[var(--radius-control)] font-medium select-none",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]",
    "disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none disabled:transform-none",
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    className,
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} className={buttonClasses(variant, size, className)} {...props} />;
});

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <Link href={href} className={buttonClasses(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}

/* -------------------------------- Card --------------------------------- */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-border px-5 py-4", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 sm:p-6", className)} {...props} />;
}

/* -------------------------------- Badge -------------------------------- */

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "outline";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-3 text-ink-muted",
  accent: "bg-brand-soft text-brand-2",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  outline: "border border-border-strong text-ink-muted",
};

const DOT_TONES: Record<BadgeTone, string> = {
  neutral: "bg-ink-subtle",
  accent: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  outline: "bg-ink-subtle",
};

export function Badge({
  tone = "neutral",
  dot = false,
  wrap = false,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; dot?: boolean; wrap?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 text-[12px] font-medium",
        wrap ? "min-h-6 max-w-full py-0.5" : "h-6 shrink-0 whitespace-nowrap",
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    >
      {dot && <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", DOT_TONES[tone])} />}
      {children}
    </span>
  );
}

/* ------------------------------ Skeleton ------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-md", className)} />;
}

/** Layout-preserving placeholder for a page while client data loads. */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-48 rounded-[var(--radius-card)] lg:col-span-2" />
        <Skeleton className="h-48 rounded-[var(--radius-card)]" />
      </div>
      <Skeleton className="h-64 rounded-[var(--radius-card)]" />
    </div>
  );
}

/* ---------------------------- Section header --------------------------- */

export function SectionHeader({
  title,
  description,
  actions,
  className,
  id,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-lg font-semibold tracking-tight text-ink sm:text-xl">
          {title}
        </h2>
        {description && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------------------------- Definition list -------------------------- */

export function DataList({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-border", className)}>
      {items.map((it) => (
        <div key={it.label} className="grid grid-cols-[minmax(96px,140px)_1fr] gap-4 py-2.5 text-sm first:pt-0 last:pb-0">
          <dt className="text-ink-subtle">{it.label}</dt>
          <dd className="min-w-0 break-words text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------ Progress ------------------------------- */

export function ProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
    >
      <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  );
}
