"use client";

import { CenterShell } from "@/components/dashboard/CenterShell";
import { WebsiteSection } from "@/components/workspace/WebsiteSection";

export default function WebsiteCenterPage() {
  return (
    <CenterShell title="Website Center" description="A live, multi-page website rendered from your brand system, plus SEO.">
      {(pkg) => <WebsiteSection website={pkg.website} brand={pkg.brand} />}
    </CenterShell>
  );
}
