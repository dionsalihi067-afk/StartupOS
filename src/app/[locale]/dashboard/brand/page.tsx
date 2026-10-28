"use client";

import { CenterShell } from "@/components/dashboard/CenterShell";
import { BrandSection } from "@/components/workspace/BrandSection";
import { SectionMeta } from "@/components/workspace/SectionMeta";

export default function BrandPage() {
  return (
    <CenterShell
      titleKey="navigation.brand"
      descriptionKey="brand.pageDescription"
      meta={(pkg) => <SectionMeta pkg={pkg} section="brand" />}
    >
      {(pkg) => <BrandSection pkg={pkg} />}
    </CenterShell>
  );
}
