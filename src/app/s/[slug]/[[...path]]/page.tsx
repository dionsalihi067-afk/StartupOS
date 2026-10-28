import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteRenderer, themeFontsHref } from "@/components/website/SiteRenderer";
import { getDb } from "@/lib/db";
import { getLivePublishedWebsite } from "@/lib/businesses/repository";
import { getAppOrigin } from "@/lib/env";
import { publicSiteUrl, resolvePublishedPage } from "@/lib/website/publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; path?: string[] }> };

function pagePath(segments: string[] | undefined): string {
  if (!segments || segments.length === 0) return "/";
  return `/${segments.join("/")}`;
}

const LABELS = {
  en: {
    navigation: "Site navigation",
    contactPending: "Contact details will be added by the business owner.",
    homeAria: "Home",
    menuLabel: "Menu",
  },
  sq: {
    navigation: "Navigimi i faqes",
    contactPending: "Të dhënat e kontaktit do të shtohen nga pronari i biznesit.",
    homeAria: "Kryefaqja",
    menuLabel: "Menu",
  },
} as const;

async function load(slug: string, path: string) {
  const live = await getLivePublishedWebsite(getDb(), slug);
  if (!live.ok) return null;
  const resolved = resolvePublishedPage(live.site, path);
  if (!resolved.ok) return null;
  return { ...live, page: resolved.page };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, path } = await params;
  const loaded = await load(slug, pagePath(path));
  if (!loaded) return { title: "Not found", robots: { index: false, follow: false } };

  const origin = getAppOrigin();
  const canonical = publicSiteUrl(loaded.publicSlug, loaded.page.slug, origin);
  const { metadata } = loaded.page;
  return {
    title: metadata.title,
    description: metadata.description,
    ...(origin ? { alternates: { canonical } } : {}),
    openGraph: {
      type: "website",
      title: metadata.openGraph.title,
      description: metadata.openGraph.description,
      siteName: metadata.openGraph.siteName,
      locale: metadata.locale === "sq" ? "sq_AL" : "en_US",
      ...(origin ? { url: canonical } : {}),
      ...(metadata.icon ? { images: [{ url: metadata.icon }] } : {}),
    },
    robots: { index: true, follow: true },
  };
}

/**
 * Anonymous public website. Served from the persisted published snapshot only —
 * never from the owner's draft package, research, or account data.
 */
export default async function PublicWebsitePage({ params }: Props) {
  const { slug, path } = await params;
  const loaded = await load(slug, pagePath(path));
  if (!loaded) notFound();

  const labels = LABELS[loaded.site.language] ?? LABELS.en;
  const fontsHref = themeFontsHref(loaded.site.theme);

  return (
    <>
      {fontsHref ? (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={fontsHref} />
        </>
      ) : null}
      <div className="min-h-screen">
        <SiteRenderer site={loaded.site} page={loaded.page} labels={labels} publicSlug={loaded.publicSlug} />
      </div>
    </>
  );
}
