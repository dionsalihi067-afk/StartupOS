"use client";

import { CenterShell } from "@/components/dashboard/CenterShell";
import { CompetitorsSection } from "@/components/workspace/CompetitorsSection";

export default function CompetitorsCenterPage() {
  return (
    <CenterShell title="Competitor Intelligence" description="Live market research, real competitors and your strategic SWOT.">
      {(pkg) => <CompetitorsSection competitors={pkg.competitors} persona={pkg.persona} market={pkg.marketResearch} />}
    </CenterShell>
  );
}
