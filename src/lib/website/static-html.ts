import type { PublishablePage, PublishableWebsite } from "@/lib/website/publish";
import type { WebsiteSectionSpec } from "@/lib/website/model";

/**
 * Deterministic static HTML export from a publishable website specification.
 * This is a downloadable website artifact (navigable multi-page HTML), not a
 * claim that the site is publicly hosted. No React, no network.
 */

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pageFileName(slug: string): string {
  if (slug === "/") return "index.html";
  const clean = slug.replace(/^\//, "").replace(/\/$/, "");
  return `${clean || "page"}.html`;
}

function pageAnchorId(slug: string): string {
  if (slug === "/") return "home";
  return slug.replace(/^\//, "").replace(/\/$/, "") || "page";
}

/** Safe href for export: allow mailto/tel/http(s) and internal paths; block script URLs. */
function safeHref(href: string, mapInternal: (path: string) => string): string {
  const trimmed = href.trim();
  if (!trimmed || /^javascript:/i.test(trimmed) || /^data:/i.test(trimmed)) return "#";
  if (/^(mailto:|tel:|https?:)/i.test(trimmed)) return trimmed;
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return mapInternal(path);
}

/** Maps internal slug hrefs to exported filenames; leaves mailto/tel/https alone. */
function hrefToFile(href: string): string {
  return safeHref(href, (path) => pageFileName(path));
}

/** Maps internal slug hrefs to in-document anchors for the single-file bundle. */
function hrefToBundleAnchor(href: string): string {
  return safeHref(href, (path) => `#${pageAnchorId(path)}`);
}

type HrefMapper = (href: string) => string;

function sectionHtml(section: WebsiteSectionSpec, mapHref: HrefMapper = hrefToFile): string {
  switch (section.type) {
    case "hero":
      return `<section class="hero"><h1>${esc(section.heading)}</h1>${
        section.subheading ? `<p>${esc(section.subheading)}</p>` : ""
      }${section.primaryCta ? `<p><a class="btn" href="${esc(mapHref(section.primaryCta.href))}">${esc(section.primaryCta.label)}</a></p>` : ""}${
        section.secondaryCta ? `<p><a href="${esc(mapHref(section.secondaryCta.href))}">${esc(section.secondaryCta.label)}</a></p>` : ""
      }</section>`;
    case "features":
    case "offer":
      return `<section><h2>${esc(section.heading)}</h2>${section.intro ? `<p>${esc(section.intro)}</p>` : ""}<ul>${section.items
        .map((i) => `<li><strong>${esc(i.title)}</strong>${i.description ? ` — ${esc(i.description)}` : ""}${i.price ? ` (${esc(i.price)})` : ""}</li>`)
        .join("")}</ul>${
        section.type === "offer" && section.more
          ? `<p><a href="${esc(mapHref(section.more.href))}">${esc(section.more.label)}</a></p>`
          : ""
      }</section>`;
    case "pricing":
      return `<section><h2>${esc(section.heading)}</h2>${section.intro ? `<p>${esc(section.intro)}</p>` : ""}<div class="tiers">${section.tiers
        .map(
          (t) =>
            `<article><h3>${esc(t.name)}</h3>${t.price ? `<p class="price">${esc(t.price)}${t.cadence ? ` ${esc(t.cadence)}` : ""}</p>` : ""}${t.description ? `<p>${esc(t.description)}</p>` : ""}<ul>${t.features
              .map((f) => `<li>${esc(f)}</li>`)
              .join("")}</ul></article>`,
        )
        .join("")}</div>${section.note ? `<p>${esc(section.note)}</p>` : ""}</section>`;
    case "about":
      return `<section><h2>${esc(section.heading)}</h2><p>${esc(section.body)}</p></section>`;
    case "faq":
      return `<section><h2>${esc(section.heading)}</h2><dl>${section.items
        .map((i) => `<dt>${esc(i.question)}</dt><dd>${esc(i.answer)}</dd>`)
        .join("")}</dl></section>`;
    case "contact":
      return `<section><h2>${esc(section.heading)}</h2>${section.intro ? `<p>${esc(section.intro)}</p>` : ""}<ul>${section.details
        .map((d) => `<li><strong>${esc(d.label)}:</strong> ${esc(d.value)}</li>`)
        .join("")}</ul>${
        section.hours?.length
          ? `<ul class="hours">${section.hours.map((h) => `<li>${esc(h.days)}: ${esc(h.time)}</li>`).join("")}</ul>`
          : ""
      }${
        section.actions?.length
          ? `<p>${section.actions.map((a) => `<a class="btn" href="${esc(mapHref(a.href))}">${esc(a.label)}</a>`).join(" ")}</p>`
          : ""
      }</section>`;
    case "cta":
      return `<section class="cta"><h2>${esc(section.heading)}</h2>${section.subheading ? `<p>${esc(section.subheading)}</p>` : ""}<p><a class="btn" href="${esc(mapHref(section.cta.href))}">${esc(section.cta.label)}</a></p></section>`;
    default:
      return "";
  }
}

function navHtml(site: PublishableWebsite, current: string): string {
  return `<nav aria-label="Primary">${site.pages
    .map((p) => {
      const href = pageFileName(p.slug);
      const currentAttr = p.slug === current ? ' aria-current="page"' : "";
      return `<a href="${esc(href)}"${currentAttr}>${esc(p.label)}</a>`;
    })
    .join(" ")}</nav>`;
}

function renderPage(site: PublishableWebsite, page: PublishablePage): string {
  const primary = site.theme.colors.primary ?? "#0f766e";
  const ink = site.theme.colors.ink ?? "#12201c";
  const bg = site.theme.colors.surface ?? "#ffffff";
  return `<!DOCTYPE html>
<html lang="${esc(site.language)}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(page.metadata.title)}</title>
<meta name="description" content="${esc(page.metadata.description)}"/>
<style>
:root{--brand:${esc(primary)};--ink:${esc(ink)};--bg:${esc(bg)};}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;color:var(--ink);background:var(--bg);line-height:1.5}
header,main,footer{max-width:960px;margin:0 auto;padding:1.25rem 1.5rem}
header{display:flex;flex-wrap:wrap;gap:1rem;align-items:center;justify-content:space-between;border-bottom:1px solid #ddd}
nav a{margin-right:.75rem;color:var(--ink);text-decoration:none;font-size:.95rem}nav a[aria-current="page"]{font-weight:600;color:var(--brand)}
h1{font-size:clamp(1.8rem,4vw,2.6rem);line-height:1.15;margin:.2rem 0 .8rem}h2{font-size:1.35rem;margin:1.5rem 0 .6rem}
.hero{padding:2rem 0 1rem}.btn{display:inline-block;background:var(--brand);color:#fff;padding:.65rem 1rem;border-radius:8px;text-decoration:none}
.tiers{display:grid;gap:1rem}@media(min-width:720px){.tiers{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}}
footer{border-top:1px solid #ddd;font-size:.85rem;color:#666;margin-top:2rem}
</style>
</head>
<body>
<header>
  <strong>${esc(site.siteName)}</strong>
  ${navHtml(site, page.slug)}
</header>
<main>
${page.sections.map((s) => sectionHtml(s, hrefToFile)).join("\n")}
</main>
<footer>
  <p>${esc(site.siteName)}${site.tagline ? ` — ${esc(site.tagline)}` : ""}</p>
  <p>Static export from StartupOS. Not a claim of public hosting.</p>
</footer>
</body>
</html>`;
}

export interface StaticWebsiteFile {
  path: string;
  contents: string;
}

/** Builds one HTML file per page plus a simple README. */
export function buildStaticWebsiteFiles(site: PublishableWebsite): StaticWebsiteFile[] {
  const pages = site.pages.map((page) => ({
    path: pageFileName(page.slug),
    contents: renderPage(site, page),
  }));
  return [
    ...pages,
    {
      path: "README.txt",
      contents: [
        `${site.siteName} — static website export`,
        "",
        "Open index.html in a browser. Internal links work between the exported pages.",
        "This archive is a downloadable website artifact, not proof of a published URL.",
      ].join("\n"),
    },
  ];
}

/** Single-file convenience: homepage HTML (other pages linked relatively). */
export function buildStaticHomepageHtml(site: PublishableWebsite): string {
  const home = site.pages.find((p) => p.slug === "/") ?? site.pages[0];
  if (!home) return "<!DOCTYPE html><html><body><p>No pages.</p></body></html>";
  return renderPage(site, home);
}

/**
 * One downloadable HTML document containing every page (in-document anchors).
 * Prefer this in the browser when a multi-file zip is unavailable.
 */
export function buildStaticWebsiteBundleHtml(site: PublishableWebsite): string {
  const primary = site.theme.colors.primary ?? "#0f766e";
  const ink = site.theme.colors.ink ?? "#12201c";
  const bg = site.theme.colors.surface ?? "#ffffff";
  const toc = site.pages
    .map((p) => {
      const id = pageAnchorId(p.slug);
      return `<a href="#${esc(id)}">${esc(p.label)}</a>`;
    })
    .join(" ");
  const articles = site.pages
    .map((p) => {
      const id = pageAnchorId(p.slug);
      return `<article id="${esc(id)}"><h1 class="page-title">${esc(p.label)}</h1>${p.sections
        .map((s) => sectionHtml(s, hrefToBundleAnchor))
        .join("\n")}</article>`;
    })
    .join("\n<hr/>\n");
  return `<!DOCTYPE html>
<html lang="${esc(site.language)}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(site.siteName)}</title>
<style>
:root{--brand:${esc(primary)};--ink:${esc(ink)};--bg:${esc(bg)};}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;color:var(--ink);background:var(--bg);line-height:1.5}
header,main,footer{max-width:960px;margin:0 auto;padding:1.25rem 1.5rem}
header{border-bottom:1px solid #ddd}nav a{margin-right:.75rem;color:var(--brand);text-decoration:none}
.page-title{font-size:1.1rem;color:#666;margin:2rem 0 .5rem}h1{font-size:clamp(1.8rem,4vw,2.6rem)}.btn{display:inline-block;background:var(--brand);color:#fff;padding:.65rem 1rem;border-radius:8px;text-decoration:none}
hr{border:none;border-top:1px solid #ddd;margin:2rem 0}footer{border-top:1px solid #ddd;font-size:.85rem;color:#666}
</style>
</head>
<body>
<header><strong>${esc(site.siteName)}</strong><nav aria-label="Primary">${toc}</nav></header>
<main>${articles}</main>
<footer><p>${esc(site.siteName)} — static export from StartupOS. Not a published URL.</p></footer>
</body>
</html>`;
}
