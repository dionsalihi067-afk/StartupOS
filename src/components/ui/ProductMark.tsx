import * as React from "react";
import { cn } from "@/lib/utils";

/** StartupOS product mark: accent tile with a stacked-layers glyph. */
export function ProductMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("shrink-0 text-primary", className)}
    >
      <rect width="24" height="24" rx="6" fill="currentColor" />
      <path d="M7 9.5 12 7l5 2.5-5 2.5-5-2.5Z" fill="var(--color-on-primary)" />
      <path
        d="m7 12.5 5 2.5 5-2.5M7 15.5l5 2.5 5-2.5"
        fill="none"
        stroke="var(--color-on-primary)"
        strokeWidth="1.4"
        strokeLinejoin="round"
        opacity="0.75"
      />
    </svg>
  );
}

export function ProductWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <ProductMark />
      <span className="font-display text-[15px] font-semibold tracking-tight text-ink">StartupOS</span>
    </span>
  );
}
