"use client";

import { CenterShell } from "@/components/dashboard/CenterShell";
import { MarketingSection } from "@/components/workspace/MarketingSection";
import { SectionMeta } from "@/components/workspace/SectionMeta";

export default function MarketingPage() {
  return (
    <CenterShell
      titleKey="navigation.marketing"
      descriptionKey="marketing.pageDescription"
      meta={(pkg) => <SectionMeta pkg={pkg} section="marketing" />}
    >
      {(pkg) => <MarketingSection pkg={pkg} />}
    </CenterShell>
  );
}
