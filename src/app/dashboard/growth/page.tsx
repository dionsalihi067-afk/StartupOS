"use client";

import { CenterShell } from "@/components/dashboard/CenterShell";
import { GrowthSection } from "@/components/workspace/GrowthSection";
import { PricingSection } from "@/components/workspace/PricingSection";
import { SectionTitle } from "@/components/ui/primitives";

export default function GrowthCenterPage() {
  return (
    <CenterShell title="Growth Center" description="Sales funnel, pricing strategy and your 30/60/90-day growth plan.">
      {(pkg) => (
        <div className="space-y-10">
          <GrowthSection growth={pkg.growth} funnel={pkg.salesFunnel} />
          <div>
            <SectionTitle eyebrow="Pricing Agent" title="Pricing strategy" />
            <div className="mt-5">
              <PricingSection pricing={pkg.pricing} />
            </div>
          </div>
        </div>
      )}
    </CenterShell>
  );
}
