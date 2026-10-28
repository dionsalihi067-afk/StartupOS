import * as React from "react";

export function PageHeader({
  title,
  description,
  actions,
  meta,
  leading,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Small badges / provenance shown under the title. */
  meta?: React.ReactNode;
  /** Optional element before the title, e.g. a business avatar. */
  leading?: React.ReactNode;
  /** Optional context label above the title (e.g. workspace section). */
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 md:flex-row md:items-start md:justify-between">
      <div className="flex min-w-0 items-start gap-3.5">
        {leading}
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.06em] text-ink-subtle">{eyebrow}</p>
          )}
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-ink sm:text-[1.875rem]">
            {title}
          </h1>
          {description && <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-ink-muted">{description}</p>}
          {meta && <div className="mt-3 flex flex-wrap items-center gap-1.5">{meta}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
