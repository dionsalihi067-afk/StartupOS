"use client";

import * as React from "react";
import { BookOpenCheck, FileText, Lightbulb, PenLine, ScanSearch, TriangleAlert } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Labels where a piece of content comes from, so generated drafts, analysis
 * and sample content are never mistaken for verified facts. Uses icon + text,
 * not color alone.
 */
export type ProvenanceKind = "fact" | "analysis" | "recommendation" | "ai" | "template" | "sample" | "estimate";

const META: Record<ProvenanceKind, { icon: React.ElementType; className: string }> = {
  fact: { icon: BookOpenCheck, className: "text-success bg-success/10" },
  analysis: { icon: ScanSearch, className: "text-ink-muted bg-surface-2" },
  recommendation: { icon: Lightbulb, className: "text-brand-2 bg-brand-soft" },
  ai: { icon: PenLine, className: "text-brand-2 bg-brand-soft" },
  template: { icon: FileText, className: "text-ink-muted bg-surface-2" },
  sample: { icon: TriangleAlert, className: "text-warning bg-warning/10" },
  estimate: { icon: TriangleAlert, className: "text-warning bg-warning/10" },
};

export function Provenance({ kind, label, className }: { kind: ProvenanceKind; label?: string; className?: string }) {
  const t = useT();
  const m = META[kind];
  const Icon = m.icon;
  return (
    <span
      title={t(`provenance.${kind}.title`)}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded px-1.5 text-[11.5px] font-medium",
        m.className,
        className,
      )}
    >
      <Icon size={12} aria-hidden />
      {label ?? t(`provenance.${kind}.label`)}
    </span>
  );
}
