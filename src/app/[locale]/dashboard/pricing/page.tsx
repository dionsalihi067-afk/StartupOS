"use client";

import { CenterShell } from "@/components/dashboard/CenterShell";
import { PricingSection } from "@/components/workspace/PricingSection";
import { SectionMeta } from "@/components/workspace/SectionMeta";

export default function PricingPage() {
  return (
    <CenterShell
      titleKey="navigation.pricing"
      descriptionKey="pricing.pageDescription"
      meta={(pkg) => <SectionMeta pkg={pkg} section="pricing" />}
    >
      {(pkg) => <PricingSection pkg={pkg} />}
    </CenterShell>
  );
}
