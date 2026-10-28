"use client";

import * as React from "react";
import type { BusinessSummary } from "@/lib/businesses/types";
import { BusinessAvatar } from "@/components/ui/Logo";
import { Badge } from "@/components/ui/primitives";
import { businessCategory, businessName, summaryStatus } from "@/lib/client/insights";
import { useFormat, useT } from "@/i18n/client";
import { Link } from "@/i18n/navigation";

export function BusinessCard({ business, active }: { business: BusinessSummary; active?: boolean }) {
  const t = useT();
  const format = useFormat();
  const status = summaryStatus(business, t);
  const name = businessName(business, t);
  return (
    <Link
      href={`/dashboard/projects/${business.id}`}
      className="card group flex h-full flex-col p-5 transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-[var(--shadow-card)]"
    >
      <div className="flex items-start gap-3">
        <BusinessAvatar name={name} iconUrl={business.iconUrl} className="h-11 w-11 rounded-xl text-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold tracking-tight text-ink">{name}</span>
            {active && <Badge tone="accent">{t("status.active")}</Badge>}
          </div>
          <div className="truncate text-[12.5px] text-ink-muted">
            {businessCategory(business.idea, t)}
            {business.location ? ` · ${business.location}` : ""}
          </div>
        </div>
      </div>
      <p className="mt-3.5 line-clamp-2 flex-1 text-[13px] leading-relaxed text-ink-muted">{business.idea}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3.5">
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
        <span className="text-[12px] text-ink-subtle">{format.created(business.createdAt)}</span>
      </div>
    </Link>
  );
}
