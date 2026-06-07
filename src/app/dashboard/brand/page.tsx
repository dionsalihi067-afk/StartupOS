"use client";

import { CenterShell } from "@/components/dashboard/CenterShell";
import { BrandSection } from "@/components/workspace/BrandSection";

export default function BrandCenterPage() {
  return (
    <CenterShell title="Brand Center" description="Your complete brand identity, logo suite, palette and guidelines.">
      {(pkg) => <BrandSection brand={pkg.brand} />}
    </CenterShell>
  );
}
