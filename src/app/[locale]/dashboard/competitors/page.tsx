"use client";

import { CenterShell } from "@/components/dashboard/CenterShell";
import { CompetitorsSection } from "@/components/workspace/CompetitorsSection";
import { SectionMeta } from "@/components/workspace/SectionMeta";

export default function CompetitorsPage() {
  return (
    <CenterShell
      titleKey="navigation.competitors"
      descriptionKey="competitors.pageDescription"
      meta={(pkg) => <SectionMeta pkg={pkg} section="competitors" />}
    >
      {(pkg) => <CompetitorsSection pkg={pkg} />}
    </CenterShell>
  );
}
