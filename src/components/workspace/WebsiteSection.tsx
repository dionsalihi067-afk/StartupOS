"use client";

import * as React from "react";
import { ChevronDown, Monitor, Smartphone } from "lucide-react";
import type { BusinessPackage } from "@/lib/types";
import { Badge, Button, Card, CardBody, CardHeader, DataList } from "@/components/ui/primitives";
import { CopyButton, DownloadButton } from "@/components/ui/actions";
import { Tabs } from "@/components/ui/Tabs";
import { Provenance } from "@/components/ui/Provenance";
import { InlineNotice, EmptyState } from "@/components/dashboard/EmptyState";
import { BrandFonts } from "@/components/workspace/BrandSection";
import { SiteRenderer } from "@/components/website/SiteRenderer";
import { ApiError, prepareWebsitePublication, publishWebsite, unpublishWebsite } from "@/lib/client/businesses";
import { WebsiteChecks, WebsiteSetup } from "@/components/workspace/WebsiteSetup";
import { checkWebsite } from "@/lib/website/quality";
import { downloadHtml, downloadJson } from "@/lib/client/download";
import { buildStaticWebsiteBundleHtml } from "@/lib/website/static-html";
import { agentProvenance } from "@/lib/client/insights";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { websiteSpecOf } from "@/lib/website/legacy";
import { buildPublishableWebsite, publicationStatus, publicSiteUrl, resolvePublishedPage } from "@/lib/website/publish";
import { useFormat, useT } from "@/i18n/client";
import { cn, slugify } from "@/lib/utils";

export function WebsiteSection({ pkg, onRewrite }: { pkg: BusinessPackage; onRewrite?: () => void }) {
  const t = useT();
  const { website, brand } = pkg;
  const site = React.useMemo(() => {
    const built = buildPublishableWebsite(websiteSpecOf(website, brand));
    return built.ok ? built.site : null;
  }, [website, brand]);
  const checks = React.useMemo(() => (site ? checkWebsite(site, pkg.input) : []), [site, pkg.input]);
  const [pageSlug, setPageSlug] = React.useState("/");
  const [device, setDevice] = React.useState<"desktop" | "mobile">("desktop");
  const resolved = site ? resolvePublishedPage(site, pageSlug) : null;
  const page = resolved?.ok ? resolved.page : site?.pages[0];

  if (!site || !page) {
    return <EmptyState title={t("website.emptyTitle")} description={t("website.emptyDescription")} action={null} />;
  }

  return (
    <div className="space-y-4">
      <BrandFonts href={brand.typography.googleFontsHref} />

      <InlineNotice title={t("website.previewNoticeTitle")}>{t("website.previewNoticeBody")}</InlineNotice>

      <WebsiteSetup key={pkg.id} pkg={pkg} onRewrite={onRewrite} />

      <PublishPanel pkg={pkg} />

      <WebsiteChecks checks={checks} />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
          <Tabs
            variant="segmented"
            label={t("website.pagesLabel")}
            idPrefix="site-pages"
            items={site.pages.map((p) => ({ id: p.slug, label: p.label }))}
            value={page.slug}
            onChange={setPageSlug}
          />
          <div className="flex items-center gap-2">
            <div role="group" aria-label={t("website.previewSize")} className="inline-flex rounded-md bg-surface-2 p-0.5">
              {(
                [
                  { id: "desktop", icon: Monitor, label: t("website.desktopPreview") },
                  { id: "mobile", icon: Smartphone, label: t("website.mobilePreview") },
                ] as const
              ).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDevice(d.id)}
                  aria-pressed={device === d.id}
                  aria-label={d.label}
                  className={cn(
                    "flex h-7 w-8 items-center justify-center rounded transition-colors",
                    device === d.id ? "bg-surface text-ink shadow-[var(--shadow-card)]" : "text-ink-muted hover:text-ink",
                  )}
                >
                  <d.icon size={15} aria-hidden />
                </button>
              ))}
            </div>
            <DownloadButton
              label={t("website.exportHtml")}
              ariaLabel={t("website.exportHtmlAria")}
              onDownload={() => downloadHtml(`${slugify(brand.name)}-website.html`, buildStaticWebsiteBundleHtml(site))}
            />
            <DownloadButton
              label={t("website.exportContent")}
              ariaLabel={t("website.exportAria")}
              onDownload={() => downloadJson(`${slugify(brand.name)}-website.json`, { site, seo: website.seo })}
            />
          </div>
        </div>

        <div className="bg-[linear-gradient(180deg,var(--color-surface-3),color-mix(in_srgb,var(--color-surface-2)_70%,var(--color-surface-3)))] p-3 sm:p-8">
          <div
            className={cn(
              "mx-auto transition-[max-width,transform] duration-300 ease-[var(--ease-out-soft)]",
              device === "mobile" ? "max-w-[390px]" : "max-w-[1100px]",
            )}
          >
            <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-elevated)] ring-1 ring-black/5">
              <div className="flex items-center gap-2 border-b border-border bg-surface-2/80 px-3 py-2.5">
                <span className="flex gap-1.5" aria-hidden>
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f87171]/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]/80" />
                </span>
                <span className="ml-2 min-w-0 flex-1 truncate rounded-md border border-border bg-surface px-2.5 py-1 font-mono text-[11.5px] text-ink-subtle">
                  {page.slug}
                </span>
              </div>
              <div className="overflow-hidden">
                <SiteRenderer
                  site={site}
                  page={page}
                  mobile={device === "mobile"}
                  onNavigate={setPageSlug}
                  labels={{ navigation: t("website.previewNavigation"), contactPending: t("website.contactPending") }}
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("website.pageDetails")} description={page.label} />
          <CardBody className="space-y-5">
            <DataList
              items={[
                { label: t("website.path"), value: <code className="font-mono text-[12.5px]">{page.slug}</code> },
                { label: t("website.pageTitle"), value: page.metadata.title },
                { label: t("website.description"), value: page.metadata.description },
                { label: t("website.canonical"), value: <code className="font-mono text-[12.5px]">{page.metadata.canonicalPath}</code> },
              ]}
            />
            <div>
              <h3 className="mb-2 text-[12.5px] font-medium text-ink-subtle">{t("website.sectionsOnPage")}</h3>
              <ol className="flex flex-wrap gap-1.5">
                {page.sections.map((s) => (
                  <li key={s.id} className="max-w-full">
                    <Badge tone="outline" wrap>
                      {s.heading}
                    </Badge>
                  </li>
                ))}
              </ol>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("website.seo")} actions={<Provenance kind={agentProvenance(pkg, "SEO Agent")} />} />
          <CardBody className="space-y-4">
            <SeoRow label={t("website.titleTag")} value={website.seo.title} />
            <SeoRow label={t("website.metaDescription")} value={website.seo.metaDescription} />
            <SeoRow label={t("website.socialTitle")} value={website.seo.ogTitle} />
            <div>
              <h3 className="mb-2 text-[12.5px] font-medium text-ink-subtle">{t("website.targetKeywords")}</h3>
              <ul className="flex flex-wrap gap-1.5">
                {website.seo.keywords.map((k) => (
                  <li key={k} className="max-w-full">
                    <Badge wrap>{k}</Badge>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-[12.5px] font-medium text-ink-subtle">{t("website.sitemap")}</h3>
              <ul className="flex flex-wrap gap-1.5">
                {website.seo.sitemap.map((s) => (
                  <li key={s}>
                    <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-ink-muted">{s}</code>
                  </li>
                ))}
              </ul>
            </div>
            <details className="group rounded-lg border border-border">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[13px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                {t("website.structuredData")}
                <ChevronDown size={15} className="shrink-0 text-ink-subtle transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="border-t border-border p-3">
                <div className="mb-2 flex justify-end">
                  <CopyButton text={JSON.stringify(website.seo.jsonLd, null, 2)} />
                </div>
                <pre className="max-h-64 overflow-auto rounded-md bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-ink-muted">
                  {JSON.stringify(website.seo.jsonLd, null, 2)}
                </pre>
              </div>
            </details>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/**
 * Publication lifecycle for the workspace. "Published" is shown only after the
 * server confirms a public slug; the link is the real `/s/<slug>` path on this app.
 */
function PublishPanel({ pkg }: { pkg: BusinessPackage }) {
  const t = useT();
  const format = useFormat();
  const [busy, setBusy] = React.useState<"prepare" | "publish" | "unpublish" | null>(null);
  const [failed, setFailed] = React.useState<"failed" | "needsFixes" | null>(null);
  const [confirmUnpublish, setConfirmUnpublish] = React.useState(false);
  const status = publicationStatus(pkg.website);
  const pub = pkg.website.publication;
  const preparedAt = pub?.preparedAt;
  const publicPath = pub?.publicSlug && pub.live ? publicSiteUrl(pub.publicSlug, "/") : null;
  const publicHref = publicPath;

  const run = async (kind: "prepare" | "publish" | "unpublish", fn: () => Promise<unknown>) => {
    setBusy(kind);
    setFailed(null);
    try {
      await fn();
    } catch (err) {
      setFailed(err instanceof ApiError && err.code === "websiteNeedsFixes" ? "needsFixes" : "failed");
      throw new Error("publish-failed");
    } finally {
      setBusy(null);
    }
  };

  const badge = {
    unavailable: { tone: "neutral" as const, label: t("website.publish.unavailableBadge") },
    draft: { tone: "accent" as const, label: t("website.publish.draftBadge") },
    prepared: { tone: "accent" as const, label: t("website.publish.preparedBadge") },
    published: { tone: "success" as const, label: t("website.publish.publishedBadge") },
    outdated: { tone: "warning" as const, label: t("website.publish.outdatedBadge") },
    unpublished: { tone: "neutral" as const, label: t("website.publish.unpublishedBadge") },
  };
  const body = {
    unavailable: t("website.publish.unavailableBody"),
    draft: t("website.publish.draftBody"),
    prepared: t("website.publish.preparedBody", { date: preparedAt ? format.date(preparedAt) : "—" }),
    published: t("website.publish.publishedBody"),
    outdated: t("website.publish.outdatedBody"),
    unpublished: t("website.publish.unpublishedBody"),
  }[status];

  const busyLabel =
    busy === "publish" ? t("website.publish.publishing") : busy === "unpublish" ? t("website.publish.unpublishing") : busy === "prepare" ? t("website.publish.preparing") : null;

  return (
    <Card>
      <CardHeader
        title={t("website.publish.title")}
        description={body}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge tone={busy ? "neutral" : badge[status].tone} dot>
              {busyLabel ?? badge[status].label}
            </Badge>
            {(status === "draft" || (status === "outdated" && !pub?.live)) && (
              <Button size="sm" variant="secondary" onClick={() => void run("prepare", () => prepareWebsitePublication(pkg.id))} disabled={!!busy} aria-busy={busy === "prepare"}>
                {busy === "prepare" ? t("website.publish.preparing") : t("website.publish.action")}
              </Button>
            )}
            {(status === "prepared" || status === "unpublished") && (
              <Button size="sm" onClick={() => void run("publish", () => publishWebsite(pkg.id))} disabled={!!busy} aria-busy={busy === "publish"}>
                {busy === "publish" ? t("website.publish.publishing") : t("website.publish.publishAction")}
              </Button>
            )}
            {status === "draft" && (
              <Button size="sm" onClick={() => void run("publish", () => publishWebsite(pkg.id))} disabled={!!busy} aria-busy={busy === "publish"}>
                {busy === "publish" ? t("website.publish.publishing") : t("website.publish.publishAction")}
              </Button>
            )}
            {status === "outdated" && (
              <Button size="sm" onClick={() => void run("publish", () => publishWebsite(pkg.id))} disabled={!!busy} aria-busy={busy === "publish"}>
                {busy === "publish" ? t("website.publish.publishing") : pub?.live ? t("website.publish.republishAction") : t("website.publish.publishAction")}
              </Button>
            )}
            {(status === "published" || (status === "outdated" && pub?.live)) && (
              <Button size="sm" variant="secondary" onClick={() => setConfirmUnpublish(true)} disabled={!!busy}>
                {t("website.publish.unpublishAction")}
              </Button>
            )}
          </div>
        }
      />
      {publicHref && (
        <CardBody className="flex flex-col gap-3 border-t border-border sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-[12.5px] font-medium text-ink-subtle">{t("website.publish.publicUrl")}</h3>
            <p className="mt-0.5 truncate font-mono text-[13px] text-ink">{publicHref}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <CopyButton text={publicHref} ariaLabel={t("website.publish.copyLink")} />
            <Button size="sm" variant="secondary" onClick={() => window.open(publicHref, "_blank", "noopener,noreferrer")}>
              {t("website.publish.openSite")}
            </Button>
          </div>
        </CardBody>
      )}
      {failed && (
        <p role="alert" className="px-5 py-3 text-[13px] text-danger">
          {failed === "needsFixes" ? t("website.publish.needsFixes") : t("website.publish.failed")}
        </p>
      )}
      <ConfirmDialog
        open={confirmUnpublish}
        title={t("website.publish.unpublishTitle")}
        description={t("website.publish.unpublishDescription")}
        confirmLabel={t("website.publish.unpublishAction")}
        destructive
        onClose={() => setConfirmUnpublish(false)}
        onConfirm={() => run("unpublish", () => unpublishWebsite(pkg.id))}
      />
    </Card>
  );
}

function SeoRow({ label, value }: { label: string; value: string }) {
  const t = useT();
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <h3 className="text-[12.5px] font-medium text-ink-subtle">{label}</h3>
        <CopyButton text={value} variant="ghost" size="icon" ariaLabel={t("common.copyField", { field: label })} />
      </div>
      <p className="text-sm leading-relaxed text-ink">{value}</p>
    </div>
  );
}
