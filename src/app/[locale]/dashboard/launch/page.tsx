"use client";

import * as React from "react";
import { CenterShell } from "@/components/dashboard/CenterShell";
import { InlineNotice } from "@/components/dashboard/EmptyState";
import { LaunchSection } from "@/components/workspace/LaunchSection";
import { SectionMeta } from "@/components/workspace/SectionMeta";
import { updateChecklistItem } from "@/lib/client/businesses";
import type { BusinessPackage } from "@/lib/types";
import { useT } from "@/i18n/client";

export default function LaunchPage() {
  return (
    <CenterShell
      titleKey="navigation.launch"
      descriptionKey="launch.pageDescription"
      meta={(pkg) => <SectionMeta pkg={pkg} section="launch" />}
    >
      {(pkg) => <LaunchInner pkg={pkg} />}
    </CenterShell>
  );
}

function LaunchInner({ pkg }: { pkg: BusinessPackage }) {
  const t = useT();
  const [saveFailed, setSaveFailed] = React.useState(false);

  function toggle(index: number) {
    const item = pkg.launch.checklist[index];
    if (!item) return;
    setSaveFailed(false);
    updateChecklistItem(pkg.id, index, !item.done).catch(() => setSaveFailed(true));
  }

  return (
    <>
      {saveFailed && <InlineNotice tone="danger" title={t("errors.data.saveFailed")} className="mb-5" />}
      <LaunchSection pkg={pkg} onToggle={toggle} />
    </>
  );
}
