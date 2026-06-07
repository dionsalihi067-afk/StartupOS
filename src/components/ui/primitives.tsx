import * as React from "react";
import { cn } from "@/lib/utils";

/* ------------------------------- Button -------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-2 shadow-[0_8px_24px_-8px_rgba(109,94,252,0.6)] hover:shadow-[0_10px_30px_-6px_rgba(109,94,252,0.7)]",
  secondary: "bg-surface-2 text-ink hover:bg-[#1d1d28] border border-border",
  ghost: "bg-transparent text-ink-muted hover:text-ink hover:bg-surface-2",
  outline: "bg-transparent text-ink border border-border-strong hover:border-brand hover:text-white",
  danger: "bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-[15px] gap-2 rounded-xl",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all duration-200 focus-ring disabled:opacity-50 disabled:pointer-events-none select-none",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  );
});

/* -------------------------------- Card --------------------------------- */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 sm:p-6", className)} {...props} />;
}

/* -------------------------------- Badge -------------------------------- */

type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "accent";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-ink-muted border-border",
  brand: "bg-brand-soft text-brand-2 border-brand/30",
  success: "bg-success/10 text-success border-success/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  danger: "bg-danger/10 text-danger border-danger/30",
  accent: "bg-accent/10 text-accent border-accent/30",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

/* ------------------------------ Skeleton ------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-lg", className)} />;
}

/* ------------------------------ Section -------------------------------- */

export function SectionTitle({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {eyebrow && (
        <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-brand-2">{eyebrow}</div>
      )}
      <h2 className="text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h2>
      {description && <p className="max-w-2xl text-[15px] leading-relaxed text-ink-muted">{description}</p>}
    </div>
  );
}

/* ------------------------------- Stat ---------------------------------- */

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card p-5">
      <div className="text-[13px] font-medium text-ink-muted">{label}</div>
      <div className="mt-1.5 text-2xl font-bold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-[12px] text-ink-subtle">{hint}</div>}
    </div>
  );
}
