"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
}

/**
 * Accessible tab list (WAI-ARIA tabs pattern) with arrow-key navigation.
 * `variant="underline"` for page-level navigation, `"segmented"` for compact
 * in-section switches.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  variant = "underline",
  idPrefix,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  variant?: "underline" | "segmented";
  idPrefix: string;
  className?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const item = items[next];
    if (!item) return;
    onChange(item.id);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        variant === "underline"
          ? "flex gap-5 overflow-x-auto border-b border-border [scrollbar-width:none]"
          : "inline-flex max-w-full gap-0.5 overflow-x-auto rounded-md bg-surface-2 p-0.5 [scrollbar-width:none]",
        className,
      )}
    >
      {items.map((item, i) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${idPrefix}-tab-${item.id}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium transition-colors",
              variant === "underline"
                ? cn(
                    "-mb-px border-b-2 pb-2.5 pt-1",
                    selected ? "border-ink text-ink" : "border-transparent text-ink-subtle hover:text-ink",
                  )
                : cn(
                    "h-7 rounded px-2.5 text-[13px]",
                    selected ? "bg-surface text-ink shadow-[var(--shadow-card)]" : "text-ink-muted hover:text-ink",
                  ),
            )}
          >
            {item.label}
            {item.count !== undefined && <span className="text-[11.5px] tabular-nums text-ink-subtle">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  idPrefix,
  activeId,
  children,
  className,
}: {
  idPrefix: string;
  activeId: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      id={`${idPrefix}-panel`}
      role="tabpanel"
      aria-labelledby={`${idPrefix}-tab-${activeId}`}
      tabIndex={0}
      className={cn("outline-none focus-visible:outline-none", className)}
    >
      {children}
    </div>
  );
}
