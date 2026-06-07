"use client";

import * as React from "react";
import type { BusinessPackage } from "@/lib/types";
import { saveProject } from "@/lib/client/store";
import { downloadJson } from "@/lib/client/download";
import { Badge } from "@/components/ui/primitives";
import { DownloadButton } from "@/components/ui/actions";
import { BrandLogo } from "@/components/ui/Logo";
import { BrandSection } from "@/components/workspace/BrandSection";
import { WebsiteSection } from "@/components/workspace/WebsiteSection";
import { MarketingSection } from "@/components/workspace/MarketingSection";
import { CompetitorsSection } from "@/components/workspace/CompetitorsSection";
import { PricingSection } from "@/components/workspace/PricingSection";
import { GrowthSection } from "@/components/workspace/GrowthSection";
import { LaunchSection } from "@/components/workspace/LaunchSection";
import { OverviewSection } from "@/components/workspace/OverviewSection";
import { cn, slugify } from "@/lib/utils";

const TABS = ["Overview", "Brand", "Website", "Marketing", "Competitors", "Pricing", "Growth", "Launch"] as const;
type Tab = (typeof TABS)[number];

export function ProjectWorkspace({ initial }: { initial: BusinessPackage }) {
  const [pkg, setPkg] = React.useState(initial);
  const [tab, setTab] = React.useState<Tab>("Overview");

  React.useEffect(() => setPkg(initial), [initial]);

  const toggleChecklist = React.useCallback((index: number) => {
    setPkg((prev) => {
      const checklist = prev.launch.checklist.map((c, i) => (i === index ? { ...c, done: !c.done } : c));
      const next = { ...prev, launch: { ...prev.launch, checklist } };
      saveProject(next);
      return next;
    });
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-bg-elevated p-2">
            <BrandLogo logo={pkg.brand.logo} name={pkg.brand.name} variant="icon" className="h-full w-full rounded-xl" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{pkg.brand.name}</h1>
              <Badge tone={pkg.meta.engine === "hybrid" ? "brand" : "neutral"}>
                {pkg.meta.engine === "hybrid" ? "AI + Engine" : "Engine"}
              </Badge>
            </div>
            <p className="text-sm text-ink-muted">{pkg.brand.slogan}</p>
          </div>
        </div>
        <DownloadButton
          variant="primary"
          size="md"
          label="Export package"
          onDownload={() => downloadJson(`${slugify(pkg.brand.name)}-startupos-package.json`, pkg)}
        />
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-20 -mx-4 mb-7 border-b border-border bg-bg/80 px-4 backdrop-blur sm:top-0 lg:mx-0 lg:px-0">
        <div className="flex gap-1 overflow-x-auto py-2">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition",
                tab === t ? "bg-surface-2 text-white" : "text-ink-muted hover:text-ink",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Panels */}
      <div>
        {tab === "Overview" && <OverviewSection pkg={pkg} onJump={(t) => setTab(t as Tab)} />}
        {tab === "Brand" && <BrandSection brand={pkg.brand} />}
        {tab === "Website" && <WebsiteSection website={pkg.website} brand={pkg.brand} />}
        {tab === "Marketing" && <MarketingSection marketing={pkg.marketing} brand={pkg.brand} />}
        {tab === "Competitors" && <CompetitorsSection competitors={pkg.competitors} persona={pkg.persona} market={pkg.marketResearch} />}
        {tab === "Pricing" && <PricingSection pricing={pkg.pricing} />}
        {tab === "Growth" && <GrowthSection growth={pkg.growth} funnel={pkg.salesFunnel} />}
        {tab === "Launch" && <LaunchSection launch={pkg.launch} onToggle={toggleChecklist} />}
      </div>
    </div>
  );
}
