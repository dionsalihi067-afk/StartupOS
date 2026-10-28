"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import type { BusinessPackage } from "@/lib/types";
import type { GeneratedSectionId } from "@/lib/dependencies";
import { Trash2 } from "lucide-react";
import { deleteBusiness, updateChecklistItem } from "@/lib/client/businesses";
import { downloadJson } from "@/lib/client/download";
import { Badge, Button } from "@/components/ui/primitives";
import { DownloadButton } from "@/components/ui/actions";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { BusinessAvatar, packageIconUrl } from "@/components/ui/Logo";
import { InlineNotice } from "@/components/dashboard/EmptyState";
import { useRouter } from "@/i18n/navigation";
import { Tabs, TabPanel } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { OverviewSection } from "@/components/workspace/OverviewSection";
import { EditBusinessContext } from "@/components/workspace/EditBusinessContext";
import { ScopedRegenerationPanel } from "@/components/workspace/ScopedRegenerationPanel";
import { SectionMeta } from "@/components/workspace/SectionMeta";
import { aiProviderRefused, businessCategory, businessStatus, incompleteSections, type SectionKey } from "@/lib/client/insights";
import { useFormat, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";
import { slugify } from "@/lib/utils";

/** Heavy tab panels load on demand — overview stays eager for first paint. */
const BrandSection = dynamic(() => import("@/components/workspace/BrandSection").then((m) => m.BrandSection));
const WebsiteSection = dynamic(() => import("@/components/workspace/WebsiteSection").then((m) => m.WebsiteSection));
const MarketingSection = dynamic(() =>
  import("@/components/workspace/MarketingSection").then((m) => m.MarketingSection),
);
const CompetitorsSection = dynamic(() =>
  import("@/components/workspace/CompetitorsSection").then((m) => m.CompetitorsSection),
);
const PricingSection = dynamic(() => import("@/components/workspace/PricingSection").then((m) => m.PricingSection));
const GrowthSection = dynamic(() => import("@/components/workspace/GrowthSection").then((m) => m.GrowthSection));
const LaunchSection = dynamic(() => import("@/components/workspace/LaunchSection").then((m) => m.LaunchSection));
const StrategySection = dynamic(() => import("@/components/workspace/StrategySection").then((m) => m.StrategySection));

const TABS: { id: SectionKey; labelKey: MessageKey }[] = [
  { id: "overview", labelKey: "navigation.overview" },
  { id: "strategy", labelKey: "navigation.strategy" },
  { id: "brand", labelKey: "navigation.brand" },
  { id: "website", labelKey: "navigation.website" },
  { id: "marketing", labelKey: "navigation.marketing" },
  { id: "competitors", labelKey: "navigation.competitors" },
  { id: "pricing", labelKey: "navigation.pricing" },
  { id: "growth", labelKey: "navigation.growth" },
  { id: "launch", labelKey: "navigation.launch" },
];

function isSectionKey(value: string | null): value is SectionKey {
  return TABS.some((tab) => tab.id === value);
}

/** Mirrors the active tab in `?tab=` so reloads and language switches return to the same section. */
function writeTabToUrl(tab: SectionKey) {
  const url = new URL(window.location.href);
  if (tab === "overview") url.searchParams.delete("tab");
  else url.searchParams.set("tab", tab);
  window.history.replaceState(window.history.state, "", url);
}

export function ProjectWorkspace({ pkg, updatedAt }: { pkg: BusinessPackage; updatedAt?: string }) {
  const t = useT();
  const format = useFormat();
  const router = useRouter();
  const [tab, setTabState] = React.useState<SectionKey>("overview");
  const [saveFailed, setSaveFailed] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleteFailed, setDeleteFailed] = React.useState(false);
  const [editingContext, setEditingContext] = React.useState(false);
  const [contextSaved, setContextSaved] = React.useState(false);
  const [regenOffer, setRegenOffer] = React.useState<GeneratedSectionId[] | null>(null);
  const [regenReason, setRegenReason] = React.useState<"context" | "incomplete">("context");
  const offerRegeneration = React.useCallback((sections: GeneratedSectionId[]) => {
    setContextSaved(false);
    setRegenReason("incomplete");
    setRegenOffer(sections);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const incomplete = incompleteSections(pkg);
  const pkgRef = React.useRef(pkg);
  pkgRef.current = pkg;

  React.useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("tab");
    if (isSectionKey(fromUrl)) setTabState(fromUrl);
  }, []);

  const setTab = React.useCallback((next: SectionKey) => {
    setTabState(next);
    writeTabToUrl(next);
  }, []);

  const toggleChecklist = React.useCallback((index: number) => {
    const current = pkgRef.current;
    const item = current.launch.checklist[index];
    if (!item) return;
    setSaveFailed(false);
    updateChecklistItem(current.id, index, !item.done).catch(() => setSaveFailed(true));
  }, []);

  const jump = React.useCallback(
    (section: SectionKey) => {
      setTab(section);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [setTab],
  );

  const status = businessStatus(pkg, t);
  const tabs = TABS.map((item) => ({ id: item.id, label: t(item.labelKey) }));

  if (editingContext) {
    return (
      <EditBusinessContext
        pkg={pkg}
        onCancel={() => setEditingContext(false)}
        onSaved={(affected) => {
          setEditingContext(false);
          setContextSaved(true);
          setRegenReason("context");
          setRegenOffer(affected.length > 0 ? affected : null);
          setTab("overview");
          writeTabToUrl("overview");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow={t("navigation.workspace")}
        leading={
          <BusinessAvatar name={pkg.brand.name} iconUrl={packageIconUrl(pkg.brand.logo)} className="h-12 w-12 rounded-lg text-base" />
        }
        title={pkg.brand.name}
        description={pkg.brand.slogan}
        meta={
          <>
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
            <Badge tone="outline">{businessCategory(pkg.input, t)}</Badge>
            <span className="text-[12px] text-ink-subtle">{format.created(pkg.createdAt)}</span>
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("projects.deleteAria", { name: pkg.brand.name })}
              className="h-9 w-9 hover:text-danger"
              onClick={() => {
                setDeleteFailed(false);
                setConfirmDelete(true);
              }}
            >
              <Trash2 size={16} aria-hidden />
            </Button>
            <DownloadButton
              variant="secondary"
              size="md"
              label={t("common.exportJson")}
              ariaLabel={t("workspace.exportAria")}
              onDownload={() => downloadJson(`${slugify(pkg.brand.name)}-startupos-package.json`, pkg)}
            />
          </>
        }
      />

      {saveFailed && <InlineNotice tone="danger" title={t("errors.data.saveFailed")} className="mb-5" />}
      {contextSaved && !regenOffer && (
        <InlineNotice
          tone="neutral"
          title={t("discovery.edit.savedTitle")}
          className="mb-5"
          action={
            <Button type="button" size="sm" variant="ghost" onClick={() => setContextSaved(false)}>
              {t("common.close")}
            </Button>
          }
        >
          {t("discovery.edit.savedDescription")}
        </InlineNotice>
      )}
      {!regenOffer && incomplete.length > 0 && (
        <InlineNotice
          tone="warning"
          title={t("workspace.incomplete.title")}
          className="mb-5"
          action={
            <Button type="button" size="sm" variant="secondary" onClick={() => offerRegeneration(incomplete)}>
              {t("workspace.incomplete.action")}
            </Button>
          }
        >
          {t("workspace.incomplete.description", { sections: incomplete.map((s) => t(`steps.${s}`)).join(", ") })}
          {aiProviderRefused(pkg) && <span className="mt-1 block">{t("workspace.incomplete.providerRefused")}</span>}
        </InlineNotice>
      )}
      {regenOffer && (
        <ScopedRegenerationPanel
          businessId={pkg.id}
          affected={regenOffer}
          reason={regenReason}
          onClose={() => {
            setRegenOffer(null);
            setContextSaved(regenReason === "context");
          }}
          onComplete={() => {
            setRegenOffer(null);
            setContextSaved(false);
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={t("projects.deleteTitle", { name: pkg.brand.name })}
        description={
          <>
            {t("projects.deleteDescription")}
            {deleteFailed && <InlineNotice tone="danger" title={t("errors.data.deleteFailed")} className="mt-3" />}
          </>
        }
        confirmLabel={t("projects.deleteConfirm")}
        destructive
        onConfirm={async () => {
          setDeleteFailed(false);
          try {
            await deleteBusiness(pkg.id);
          } catch (err) {
            setDeleteFailed(true);
            throw err;
          }
          router.replace("/dashboard/projects");
        }}
        onClose={() => setConfirmDelete(false)}
      />

      <div className="sticky top-14 z-20 -mx-4 mb-6 bg-bg/95 px-4 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Tabs items={tabs} value={tab} onChange={setTab} label={t("workspace.tabsLabel")} idPrefix="workspace" />
      </div>

      <TabPanel idPrefix="workspace" activeId={tab}>
        {tab !== "overview" && (
          <div className="mb-5 flex flex-wrap items-center gap-1.5">
            <SectionMeta pkg={pkg} section={tab} />
          </div>
        )}
        {tab === "overview" && (
          <OverviewSection
            pkg={pkg}
            onJump={jump}
            updatedAt={updatedAt}
            onEditContext={() => {
              setContextSaved(false);
              setEditingContext(true);
            }}
          />
        )}
        {tab === "strategy" && <StrategySection pkg={pkg} onRegenerate={() => offerRegeneration(["strategy"])} />}
        {tab === "brand" && <BrandSection pkg={pkg} onRegenerateLogo={() => offerRegeneration(["logo"])} />}
        {tab === "website" && <WebsiteSection pkg={pkg} onRewrite={() => offerRegeneration(["website"])} />}
        {tab === "marketing" && <MarketingSection pkg={pkg} />}
        {tab === "competitors" && <CompetitorsSection pkg={pkg} />}
        {tab === "pricing" && <PricingSection pkg={pkg} />}
        {tab === "growth" && <GrowthSection pkg={pkg} />}
        {tab === "launch" && <LaunchSection pkg={pkg} onToggle={toggleChecklist} />}
      </TabPanel>
    </div>
  );
}
