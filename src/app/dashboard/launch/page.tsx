"use client";

import * as React from "react";
import { CenterShell } from "@/components/dashboard/CenterShell";
import { LaunchSection } from "@/components/workspace/LaunchSection";
import { saveProject } from "@/lib/client/store";
import type { BusinessPackage } from "@/lib/types";

export default function LaunchCenterPage() {
  return (
    <CenterShell title="Launch Center" description="Your go-to-market launch plan and readiness checklist.">
      {(pkg) => <LaunchCenterInner pkg={pkg} />}
    </CenterShell>
  );
}

function LaunchCenterInner({ pkg }: { pkg: BusinessPackage }) {
  const [local, setLocal] = React.useState(pkg);
  React.useEffect(() => setLocal(pkg), [pkg]);

  function toggle(index: number) {
    setLocal((prev) => {
      const checklist = prev.launch.checklist.map((c, i) => (i === index ? { ...c, done: !c.done } : c));
      const next = { ...prev, launch: { ...prev.launch, checklist } };
      saveProject(next);
      return next;
    });
  }

  return <LaunchSection launch={local.launch} onToggle={toggle} />;
}
