"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** A labelled group of choices with the same error/hint treatment as `Field`. */
export function ChoiceField({
  id,
  label,
  hint,
  error,
  optional,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <fieldset id={id} tabIndex={-1} className="space-y-2 outline-none" aria-invalid={error ? true : undefined}>
      <legend className="mb-2 flex items-baseline gap-1.5 text-[13px] font-medium text-ink">
        {label}
        {optional && <span className="font-normal text-ink-subtle">{t("common.optional")}</span>}
      </legend>
      {children}
      {error ? (
        <p role="alert" className="text-[12.5px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12.5px] text-ink-subtle">{hint}</p>
      ) : null}
    </fieldset>
  );
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/** Single choice shown as cards; best for a handful of options that need a short explanation. */
export function ChoiceCards<T extends string>({
  name,
  options,
  value,
  onChange,
  columns = 2,
}: {
  name: string;
  options: ChoiceOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  columns?: 2 | 3 | 4;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-2 min-[480px]:grid-cols-2",
        columns === 3 && "lg:grid-cols-3",
        columns === 4 && "lg:grid-cols-4",
      )}
    >
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <label
            key={o.value}
            className={cn(
              "flex cursor-pointer items-start justify-between gap-3 rounded-lg border px-3.5 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
              selected ? "border-ink bg-surface-2" : "border-border hover:border-border-strong",
            )}
          >
            <input type="radio" name={name} value={o.value} checked={selected} onChange={() => onChange(o.value)} className="sr-only" />
            <span className="min-w-0">
              <span className="block text-[13.5px] font-medium text-ink">{o.label}</span>
              {o.hint && <span className="mt-0.5 block text-[12.5px] text-ink-subtle">{o.hint}</span>}
            </span>
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                selected ? "border-ink bg-ink text-on-primary" : "border-border-strong",
              )}
            >
              {selected && <Check size={10} strokeWidth={3} />}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** Compact pill choices. `multiple` switches between checkbox and radio semantics. */
export function Chips<T extends string>({
  name,
  options,
  selected,
  onToggle,
  multiple = false,
}: {
  name: string;
  options: ChoiceOption<T>[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  multiple?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <label
            key={o.value}
            className={cn(
              "inline-flex h-8 cursor-pointer select-none items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
              on ? "border-ink bg-ink text-on-primary" : "border-border-strong text-ink-muted hover:border-ink-subtle hover:text-ink",
            )}
          >
            <input
              type={multiple ? "checkbox" : "radio"}
              name={name}
              value={o.value}
              checked={on}
              onChange={() => onToggle(o.value)}
              className="sr-only"
            />
            {on && multiple && <Check size={12} strokeWidth={2.5} aria-hidden />}
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

/** Horizontal step list; completed steps are clickable so earlier answers are easy to revisit. */
export function StepIndicator({
  steps,
  current,
  furthest,
  onSelect,
  label,
}: {
  steps: { key: string; label: string }[];
  current: number;
  furthest: number;
  onSelect: (index: number) => void;
  label: string;
}) {
  return (
    <nav aria-label={label}>
      <ol className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {steps.map((s, i) => {
          const reachable = i <= furthest;
          const active = i === current;
          const done = i < furthest && !active;
          return (
            <li key={s.key} className="min-w-0 flex-1">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onSelect(i)}
                aria-current={active ? "step" : undefined}
                className="group block w-full min-w-[72px] text-left disabled:cursor-default"
              >
                <span
                  className={cn(
                    "block h-1 rounded-full transition-[background-color,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-out-soft)]",
                    active
                      ? "bg-brand shadow-[0_0_12px_-2px_color-mix(in_srgb,var(--color-brand)_55%,transparent)]"
                      : done
                        ? "bg-ink-subtle"
                        : "bg-surface-3",
                  )}
                />
                <span
                  className={cn(
                    "mt-2 block truncate text-[12px] transition-colors duration-[var(--duration-fast)]",
                    active ? "font-medium text-ink" : reachable ? "text-ink-muted group-hover:text-ink" : "text-ink-subtle",
                  )}
                >
                  {s.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
