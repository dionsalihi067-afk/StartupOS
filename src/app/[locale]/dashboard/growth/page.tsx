"use client";

import { CenterShell } from "@/components/dashboard/CenterShell";
import { GrowthSection } from "@/components/workspace/GrowthSection";
import { SectionMeta } from "@/components/workspace/SectionMeta";

export default function GrowthPage() {
  return (
    <CenterShell
      titleKey="navigation.growth"
      descriptionKey="growth.pageDescription"
      meta={(pkg) => <SectionMeta pkg={pkg} section="growth" />}
    >
      {(pkg) => <GrowthSection pkg={pkg} />}
    </CenterShell>
  );
}
