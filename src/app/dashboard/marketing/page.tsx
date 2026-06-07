"use client";

import { CenterShell } from "@/components/dashboard/CenterShell";
import { MarketingSection } from "@/components/workspace/MarketingSection";

export default function MarketingCenterPage() {
  return (
    <CenterShell title="Marketing Center" description="Strategy, Instagram & Facebook creatives, email sequences and chatbot flows.">
      {(pkg) => <MarketingSection marketing={pkg.marketing} brand={pkg.brand} />}
    </CenterShell>
  );
}
