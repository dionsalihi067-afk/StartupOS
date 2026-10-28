"use client";

import * as React from "react";
import type { BusinessPackage } from "@/lib/types";
import { Provenance } from "@/components/ui/Provenance";
import { Badge } from "@/components/ui/primitives";
import { agentProvenance, researchState, type SectionKey } from "@/lib/client/insights";
import { INTL_LOCALE } from "@/i18n/config";
import { useT } from "@/i18n/client";

const AGENT_FOR: Partial<Record<SectionKey, string>> = {
  strategy: "Strategy Agent",
  brand: "Brand Agent",
  website: "Website Agent",
  marketing: "Marketing Agent",
  pricing: "Pricing Agent",
  growth: "Growth Agent",
  launch: "Launch Agent",
};

/** Provenance badges describing how a section's content was produced. */
export function SectionMeta({ pkg, section }: { pkg: BusinessPackage; section: SectionKey }) {
  const t = useT();
  if (section === "competitors") {
    const s = researchState(pkg.competitors.status, t);
    return (
      <>
        <Badge tone={s.tone} dot>
          {t("sectionMeta.research", { status: s.label.toLocaleLowerCase(INTL_LOCALE[t.locale]) })}
        </Badge>
        {pkg.competitors.provider && <Badge tone="outline">{t("competitors.statusBar.webSearch")}</Badge>}
      </>
    );
  }
  const agent = AGENT_FOR[section];
  if (!agent) return null;
  return <Provenance kind={agentProvenance(pkg, agent)} />;
}
