"use client";

import { CenterShell } from "@/components/dashboard/CenterShell";
import { WebsiteSection } from "@/components/workspace/WebsiteSection";
import { SectionMeta } from "@/components/workspace/SectionMeta";

export default function WebsitePage() {
  return (
    <CenterShell
      titleKey="navigation.website"
      descriptionKey="website.pageDescription"
      meta={(pkg) => <SectionMeta pkg={pkg} section="website" />}
    >
      {(pkg) => <WebsiteSection pkg={pkg} />}
    </CenterShell>
  );
}
