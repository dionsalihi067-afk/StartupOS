import * as React from "react";
import type { WebsiteLink, WebsiteSectionSpec, WebsiteTheme } from "@/lib/website/model";
import { publicSitePath, type PublishablePage, type PublishableWebsite } from "@/lib/website/publish";

/**
 * Renders a publishable website — the single renderer for the dashboard
 * preview and published pages. Layout is CSS-responsive; the optional
 * `mobile` prop forces the narrow layout in the workspace preview.
 */

export interface SiteRendererLabels {
  navigation: string;
  /** Shown on contact sections until the owner adds real contact channels. */
  contactPending: string;
  /** Accessible label for the site identity link home. */
  homeAria?: string;
  /** Label for the mobile navigation control. */
  menuLabel?: string;
  /** Keyboard "skip to content" link; defaults to the site language. */
  skipToContent?: string;
  /** Heading of the opening-hours list; defaults to the site language. */
  openingHours?: string;
}

const DEFAULT_LABELS: Record<string, { skip: string; hours: string }> = {
  en: { skip: "Skip to content", hours: "Opening hours" },
  sq: { skip: "Kalo te përmbajtja", hours: "Orari" },
};

interface SiteRendererProps {
  site: PublishableWebsite;
  page: PublishablePage;
  labels: SiteRendererLabels;
  /** Force narrow layout (dashboard mobile preview). Public pages rely on CSS instead. */
  mobile?: boolean;
  /** Preview: intercept clicks. Public site: omit and pass `publicSlug` for real navigation. */
  onNavigate?: (slug: string) => void;
  /** When set (and `onNavigate` is not), links resolve to `/s/<publicSlug>/…`. */
  publicSlug?: string;
}

interface SectionProps<T extends WebsiteSectionSpec["type"]> {
  section: Extract<WebsiteSectionSpec, { type: T }>;
  link: (l: WebsiteLink, className: string) => React.ReactNode;
  first: boolean;
  contactPending: string;
  openingHours: string;
}

const fontStack = (name: string, fallback: string) => `"${name.replace(/["<>]/g, "")}", ${fallback}`;

/** Build a Google Fonts stylesheet URL from theme font names when they are not system stacks. */
export function themeFontsHref(theme: WebsiteTheme): string | null {
  const system = /^(system-ui|sans-serif|serif|monospace|ui-sans-serif|ui-serif|cursive|fantasy)$/i;
  const families = [...new Set([theme.fonts.heading, theme.fonts.body].map((f) => f.trim()).filter((f) => f && !system.test(f)))];
  if (families.length === 0) return null;
  const q = families.map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`).join("&");
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

function cssEscape(value: string): string {
  return value.replace(/[<>\\"']/g, "");
}

function siteStyles(theme: WebsiteTheme): string {
  const { colors, fonts } = theme;
  const primary = cssEscape(colors.primary);
  const secondary = cssEscape(colors.secondary);
  const ink = cssEscape(colors.ink);
  const surface = cssEscape(colors.surface);
  const onPrimary = cssEscape(colors.onPrimary);
  return `
.sos-site{
  --sos-primary:${primary};
  --sos-secondary:${secondary};
  --sos-ink:${ink};
  --sos-surface:${surface};
  --sos-on-primary:${onPrimary};
  --sos-muted:color-mix(in srgb, ${ink} 58%, ${surface});
  --sos-line:color-mix(in srgb, ${ink} 12%, ${surface});
  --sos-soft:color-mix(in srgb, ${ink} 4%, ${surface});
  --sos-heading:${fontStack(fonts.heading, fonts.headingFallback)};
  --sos-body:${fontStack(fonts.body, fonts.bodyFallback)};
  --sos-pad-x:clamp(1.25rem, 4vw, 3rem);
  --sos-pad-y:clamp(3rem, 7vw, 5.5rem);
  --sos-max:68rem;
  --sos-narrow:40rem;
  background:var(--sos-surface);
  color:var(--sos-ink);
  font-family:var(--sos-body);
  font-size:1rem;
  line-height:1.6;
  -webkit-font-smoothing:antialiased;
  overflow-x:clip;
  isolation:isolate;
}
.sos-site *,.sos-site *::before,.sos-site *::after{box-sizing:border-box}
.sos-site a:focus-visible,.sos-site button:focus-visible,.sos-site summary:focus-visible{
  outline:2px solid var(--sos-primary);outline-offset:3px;
}
.sos-skip{
  position:absolute;left:var(--sos-pad-x);top:0;z-index:30;
  transform:translateY(-140%);
  background:var(--sos-ink);color:var(--sos-surface);
  padding:.5rem .85rem;border-radius:.4rem;font-size:.875rem;font-weight:600;text-decoration:none;
}
.sos-skip:focus{transform:translateY(.75rem)}
.sos-header{
  position:sticky;top:0;z-index:20;
  background:color-mix(in srgb, var(--sos-surface) 92%, transparent);
  backdrop-filter:blur(10px);
  border-bottom:1px solid var(--sos-line);
}
.sos-header-inner{
  max-width:var(--sos-max);margin:0 auto;padding:.85rem var(--sos-pad-x);
  display:flex;align-items:center;justify-content:space-between;gap:1rem;
}
.sos-brand{
  display:inline-flex;align-items:center;gap:.65rem;min-width:0;flex:1 1 0%;
  color:var(--sos-ink);text-decoration:none;
  font-family:var(--sos-heading);font-weight:700;font-size:1.125rem;letter-spacing:-.02em;
}
.sos-brand img{width:1.75rem;height:1.75rem;object-fit:contain;flex-shrink:0}
.sos-brand-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.sos-menu{margin:0;flex:0 0 auto}
.sos-menu > summary{
  list-style:none;cursor:pointer;user-select:none;
  border:1px solid var(--sos-line);background:var(--sos-surface);color:var(--sos-ink);
  border-radius:.5rem;padding:.45rem .75rem;font:inherit;font-size:.8125rem;font-weight:600;
}
.sos-menu > summary::-webkit-details-marker{display:none}
.sos-nav{
  display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:.15rem .25rem;
}
.sos-nav-link{
  color:var(--sos-muted);text-decoration:none;font-size:.875rem;font-weight:500;
  padding:.4rem .65rem;border-radius:.45rem;
}
.sos-nav-link[aria-current="page"]{color:var(--sos-primary);font-weight:650}
.sos-nav-link:hover{color:var(--sos-ink);background:var(--sos-soft)}
.sos-btn{
  display:inline-flex;align-items:center;justify-content:center;text-decoration:none;
  font-weight:650;font-size:.9375rem;line-height:1.2;padding:.8rem 1.35rem;border-radius:.65rem;
  border:1px solid transparent;
  transition:transform .15s ease, filter .15s ease;
}
@media (prefers-reduced-motion:reduce){.sos-btn{transition:none}}
.sos-btn:hover{transform:translateY(-1px)}
.sos-btn-primary{background:var(--sos-primary);color:var(--sos-on-primary)}
.sos-btn-primary:hover{filter:brightness(1.05)}
.sos-btn-on-hero{background:var(--sos-surface);color:var(--sos-primary)}
.sos-btn-ghost-hero{background:transparent;color:var(--sos-on-primary);border-color:color-mix(in srgb, var(--sos-on-primary) 45%, transparent)}
.sos-header-cta{margin-left:.4rem}
.sos-main{min-width:0}
.sos-section{padding:var(--sos-pad-y) var(--sos-pad-x)}
.sos-section-soft{background:var(--sos-soft)}
.sos-wrap{max-width:var(--sos-max);margin:0 auto}
.sos-wrap-narrow{max-width:var(--sos-narrow);margin:0 auto}
.sos-hero{
  position:relative;overflow:hidden;background:var(--sos-primary);color:var(--sos-on-primary);
  padding:clamp(3.5rem, 10vw, 6.5rem) var(--sos-pad-x);text-align:center;
}
.sos-hero::after{
  content:"";position:absolute;inset:auto -20% -45% 35%;height:75%;pointer-events:none;
  background:radial-gradient(closest-side, color-mix(in srgb, var(--sos-secondary) 50%, transparent), transparent 72%);
}
.sos-hero-inner{position:relative;z-index:1;max-width:42rem;margin:0 auto}
.sos-hero h1,.sos-hero h2{
  margin:0;font-family:var(--sos-heading);font-weight:750;letter-spacing:-.03em;line-height:1.1;
  font-size:clamp(2rem, 5.5vw, 3.35rem);
}
.sos-hero-sub{margin:1.1rem 0 0;font-size:clamp(1rem, 2.2vw, 1.175rem);line-height:1.65;opacity:.92}
.sos-hero-actions{margin-top:1.75rem;display:flex;flex-wrap:wrap;gap:.75rem;justify-content:center}
.sos-section-head{text-align:center;max-width:36rem;margin:0 auto 2rem}
.sos-section-head :is(h1,h2),.sos-cta :is(h1,h2),.sos-about :is(h1,h2),.sos-faq :is(h1,h2),.sos-contact :is(h1,h2){
  margin:0;font-family:var(--sos-heading);font-weight:700;letter-spacing:-.025em;line-height:1.15;
  font-size:clamp(1.5rem, 3.2vw, 2.1rem);
}
.sos-section-head p{margin:.7rem 0 0;color:var(--sos-muted);font-size:1.0125rem}
.sos-grid{
  list-style:none;margin:0;padding:0;display:grid;gap:1.1rem;
  grid-template-columns:repeat(auto-fit, minmax(min(100%, 16.5rem), 1fr));
}
.sos-card{
  background:var(--sos-surface);border:1px solid var(--sos-line);border-radius:1rem;
  padding:1.35rem 1.4rem;min-width:0;
}
.sos-card-index{
  width:2rem;height:2rem;border-radius:.55rem;margin-bottom:.9rem;
  display:flex;align-items:center;justify-content:center;
  background:color-mix(in srgb, var(--sos-primary) 12%, var(--sos-surface));
  color:var(--sos-primary);font-weight:700;font-size:.875rem;
}
.sos-card h3{margin:0;font-size:1.05rem;font-weight:700;letter-spacing:-.01em;line-height:1.3}
.sos-card p{margin:.45rem 0 0;color:var(--sos-muted);font-size:.9375rem;line-height:1.6}
.sos-price{margin:.65rem 0 0;font-size:1.65rem;font-weight:750;color:var(--sos-primary);letter-spacing:-.02em;line-height:1.2}
.sos-price span{font-size:.875rem;font-weight:500;color:var(--sos-muted)}
.sos-card-hl{border:2px solid var(--sos-primary);box-shadow:0 10px 28px color-mix(in srgb, var(--sos-primary) 12%, transparent)}
.sos-feat-list{list-style:none;margin:1rem 0 0;padding:0;font-size:.9rem;line-height:1.75}
.sos-feat-list li{position:relative;padding-left:1.1rem}
.sos-feat-list li::before{content:"";position:absolute;left:0;top:.7em;width:.4rem;height:.4rem;border-radius:999px;background:var(--sos-primary)}
.sos-about p,.sos-faq dd{margin:.9rem 0 0;font-size:1.05rem;line-height:1.8;color:color-mix(in srgb, var(--sos-ink) 82%, var(--sos-surface))}
.sos-faq dl{margin:0}
.sos-faq-item{border-bottom:1px solid var(--sos-line);padding:1.1rem 0}
.sos-faq-item:first-child{padding-top:0}
.sos-faq dt{font-weight:700;font-size:1.0125rem;letter-spacing:-.01em}
.sos-faq dd{margin-top:.45rem;font-size:.975rem}
.sos-contact{text-align:center}
.sos-contact .sos-grid{margin-top:1.5rem;text-align:left}
.sos-contact dt{font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--sos-primary);font-weight:700}
.sos-contact dd{margin:.35rem 0 0;font-size:1rem;color:var(--sos-ink);overflow-wrap:anywhere}
.sos-note{
  margin:1.35rem auto 0;max-width:34rem;font-size:.875rem;color:var(--sos-muted);
  border:1px dashed color-mix(in srgb, var(--sos-ink) 22%, var(--sos-surface));
  border-radius:.75rem;padding:.85rem 1rem;
}
.sos-cta{background:var(--sos-ink);color:var(--sos-surface);text-align:center}
.sos-cta :is(h1,h2){color:var(--sos-surface)}
.sos-cta p{margin:.85rem auto 0;max-width:34rem;opacity:.82;font-size:1.0125rem}
.sos-cta .sos-btn{margin-top:1.5rem}
.sos-btn-outline{background:var(--sos-surface);color:var(--sos-primary);border-color:color-mix(in srgb, var(--sos-primary) 40%, var(--sos-surface))}
.sos-more{margin-top:1.75rem;text-align:center}
.sos-item-price{margin:.75rem 0 0 !important;font-weight:700;color:var(--sos-primary) !important;font-size:1.05rem !important}
.sos-product{display:flex;flex-direction:column}
.sos-product-mark{
  aspect-ratio:4/3;border-radius:.75rem;margin:-.35rem -.4rem 1rem;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(135deg, color-mix(in srgb, var(--sos-primary) 16%, var(--sos-surface)), color-mix(in srgb, var(--sos-secondary) 22%, var(--sos-surface)));
  color:var(--sos-primary);font-family:var(--sos-heading);font-size:2.4rem;font-weight:700;
}
.sos-menu-list,.sos-service-list{list-style:none;margin:0;padding:0}
.sos-menu-list li,.sos-service-list li{display:flex;gap:1rem;padding:1rem 0;border-bottom:1px solid var(--sos-line)}
.sos-row-body{flex:1;min-width:0}
.sos-row-head{display:flex;align-items:baseline;gap:.6rem}
.sos-row-head h3{margin:0;font-size:1.05rem;font-weight:700;letter-spacing:-.01em;line-height:1.35;overflow-wrap:anywhere}
.sos-leader{flex:1;min-width:1.5rem;border-bottom:1px dotted color-mix(in srgb, var(--sos-ink) 35%, var(--sos-surface));transform:translateY(-.3em)}
.sos-row-price{font-weight:700;color:var(--sos-primary);white-space:nowrap;margin-left:auto}
.sos-row-body p{margin:.3rem 0 0;color:var(--sos-muted);font-size:.9375rem;line-height:1.6}
.sos-service-index{font-family:var(--sos-heading);font-weight:700;color:var(--sos-primary);font-size:.95rem;min-width:2rem;padding-top:.1rem}
.sos-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:.65rem;margin:0 0 1.5rem}
.sos-hours{margin:1.5rem auto 0;max-width:24rem;text-align:left;border:1px solid var(--sos-line);border-radius:1rem;padding:1.1rem 1.3rem;background:var(--sos-surface)}
.sos-hours h3{margin:0 0 .5rem;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--sos-primary);font-weight:700}
.sos-hours dl{margin:0}
.sos-hours dl > div{display:flex;justify-content:space-between;gap:1rem;padding:.35rem 0;border-top:1px solid var(--sos-line)}
.sos-hours dl > div:first-child{border-top:0}
.sos-hours dt{font-weight:600;font-size:.9375rem;text-transform:none;letter-spacing:0;color:var(--sos-ink)}
.sos-hours dd{margin:0;font-size:.9375rem;color:var(--sos-muted)}
.sos-l-editorial .sos-hero{background:var(--sos-surface);color:var(--sos-ink);text-align:left;border-bottom:1px solid var(--sos-line)}
.sos-l-editorial .sos-hero::after{display:none}
.sos-l-editorial .sos-hero-inner{max-width:var(--sos-max)}
.sos-l-editorial .sos-hero :is(h1,h2){font-size:clamp(2.4rem, 6.5vw, 4.2rem);font-weight:600;letter-spacing:-.035em;max-width:16ch;color:var(--sos-primary)}
.sos-l-editorial .sos-hero-sub{max-width:36rem;color:var(--sos-muted);opacity:1}
.sos-l-editorial .sos-hero-actions{justify-content:flex-start}
.sos-l-editorial .sos-btn-on-hero{background:var(--sos-primary);color:var(--sos-on-primary)}
.sos-l-editorial .sos-btn-ghost-hero{color:var(--sos-primary);border-color:var(--sos-line)}
.sos-l-editorial .sos-section-head{text-align:left;margin-left:0;max-width:none;border-top:2px solid var(--sos-ink);padding-top:1rem}
.sos-l-editorial .sos-card{border:0;border-top:1px solid var(--sos-line);border-radius:0;padding:1.2rem 0;background:transparent}
.sos-l-editorial .sos-section-soft{background:transparent}
.sos-l-editorial .sos-btn{border-radius:0}
.sos-l-split .sos-hero{text-align:left;background:linear-gradient(110deg, var(--sos-primary) 0 58%, color-mix(in srgb, var(--sos-secondary) 70%, var(--sos-primary)) 58% 100%)}
.sos-l-split .sos-hero::after{inset:10% 4% 10% 62%;height:auto;border-radius:1.5rem;background:color-mix(in srgb, var(--sos-surface) 14%, transparent);border:1px solid color-mix(in srgb, var(--sos-on-primary) 25%, transparent)}
.sos-l-split .sos-hero-inner{max-width:var(--sos-max);padding-right:min(40%, 26rem)}
.sos-l-split .sos-hero-actions{justify-content:flex-start}
.sos-l-split .sos-section-head{text-align:left;margin-left:0}
:is(.sos-l-editorial,.sos-l-split) .sos-wrap-narrow{margin-left:max(0px, calc((100% - var(--sos-max)) / 2))}
:is(.sos-l-editorial,.sos-l-split) .sos-contact{text-align:left}
:is(.sos-l-editorial,.sos-l-split) .sos-actions{justify-content:flex-start}
:is(.sos-l-editorial,.sos-l-split) .sos-hours{margin-left:0}
.sos-l-split .sos-card{border-radius:.75rem}
.sos-l-bold .sos-hero{padding:clamp(4.5rem, 13vw, 8.5rem) var(--sos-pad-x)}
.sos-l-bold .sos-hero :is(h1,h2){font-size:clamp(2.5rem, 8vw, 5rem);font-weight:850;letter-spacing:-.045em;line-height:1}
.sos-l-bold .sos-btn{border-radius:999px;padding:.9rem 1.6rem}
.sos-l-bold .sos-card{border:2px solid var(--sos-ink);border-radius:1.1rem;box-shadow:5px 5px 0 var(--sos-primary)}
.sos-l-bold .sos-section-head :is(h1,h2){font-size:clamp(1.8rem, 4.2vw, 2.7rem);font-weight:800}
@media (max-width:720px){
  .sos-l-split .sos-hero{background:var(--sos-primary)}
  .sos-l-split .sos-hero::after{display:none}
  .sos-l-split .sos-hero-inner{padding-right:0}
}
.sos-site.sos-force-mobile.sos-l-split .sos-hero{background:var(--sos-primary)}
.sos-site.sos-force-mobile.sos-l-split .sos-hero::after{display:none}
.sos-site.sos-force-mobile.sos-l-split .sos-hero-inner{padding-right:0}
.sos-site .sos-hero.sos-hero-photo{
  background:#111;color:#fff;text-align:left;border-bottom:0;
  min-height:clamp(26rem, 72vh, 44rem);display:flex;align-items:flex-end;
}
.sos-site .sos-hero.sos-hero-photo::after{
  display:block;inset:0;height:auto;border:0;border-radius:0;
  background:linear-gradient(180deg, rgba(0,0,0,.08) 0%, rgba(0,0,0,.28) 45%, rgba(0,0,0,.72) 100%);
}
.sos-hero-media{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;animation:sos-hero-settle 1.6s cubic-bezier(.2,.7,.2,1) both}
.sos-site .sos-hero.sos-hero-photo .sos-hero-inner{max-width:var(--sos-max);width:100%;padding-right:0;animation:sos-hero-rise .9s .15s cubic-bezier(.2,.7,.2,1) both}
.sos-site .sos-hero.sos-hero-photo :is(h1,h2){color:#fff;max-width:18ch;text-shadow:0 1px 18px rgba(0,0,0,.35)}
.sos-site .sos-hero.sos-hero-photo .sos-hero-sub{max-width:36rem;color:rgba(255,255,255,.92);opacity:1}
.sos-site .sos-hero.sos-hero-photo .sos-hero-actions{justify-content:flex-start}
@keyframes sos-hero-settle{from{transform:scale(1.06)}to{transform:scale(1)}}
@keyframes sos-hero-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.sos-hero-media,.sos-site .sos-hero.sos-hero-photo .sos-hero-inner{animation:none}}
.sos-footer{
  background:var(--sos-ink);color:color-mix(in srgb, var(--sos-surface) 78%, transparent);
  padding:2rem var(--sos-pad-x);text-align:center;font-size:.8125rem;
}
.sos-footer strong{display:block;color:var(--sos-surface);font-size:.9375rem;margin-bottom:.25rem}
.sos-footer-nav{display:flex;flex-wrap:wrap;justify-content:center;gap:.35rem .85rem;margin:1rem 0 0;padding:0;list-style:none}
.sos-footer-nav a{color:inherit;text-decoration:none}
.sos-footer-nav a:hover{color:var(--sos-surface)}
@media (min-width:721px){
  .sos-menu{display:none}
}
@media (max-width:720px){
  .sos-nav-wide{display:none}
  .sos-header-inner{position:relative;flex-wrap:wrap}
  .sos-menu{width:auto}
  .sos-menu > summary{display:inline-flex}
  .sos-menu:not([open]) .sos-nav{display:none}
  .sos-menu[open] .sos-nav{
    display:flex;flex-direction:column;align-items:stretch;gap:.15rem;
    position:absolute;left:0;right:0;top:100%;
    background:var(--sos-surface);border-bottom:1px solid var(--sos-line);
    padding:.65rem var(--sos-pad-x) .9rem;
    box-shadow:0 12px 24px color-mix(in srgb, var(--sos-ink) 8%, transparent);
  }
  .sos-header-cta{margin-left:0;width:100%;justify-content:center}
  .sos-nav-link{padding:.65rem .75rem}
}
.sos-site.sos-force-mobile .sos-nav-wide{display:none}
.sos-site.sos-force-mobile .sos-menu > summary{display:inline-flex}
.sos-site.sos-force-mobile .sos-menu{display:block;width:auto}
.sos-site.sos-force-mobile .sos-header-inner{position:relative;flex-wrap:wrap}
.sos-site.sos-force-mobile .sos-menu:not([open]) .sos-nav{display:none}
.sos-site.sos-force-mobile .sos-menu[open] .sos-nav{
  display:flex;flex-direction:column;align-items:stretch;gap:.15rem;
  position:absolute;left:0;right:0;top:100%;
  background:var(--sos-surface);border-bottom:1px solid var(--sos-line);
  padding:.65rem var(--sos-pad-x) .9rem;
}
.sos-site.sos-force-mobile .sos-header-cta{margin-left:0;width:100%;justify-content:center}
`.replace(/\n/g, "");
}

export function SiteRenderer({ site, page, labels, mobile = false, onNavigate, publicSlug }: SiteRendererProps) {
  const { colors, fonts, logoUrl } = site.theme;
  const homeHref = publicSlug ? publicSitePath(publicSlug, "/") : "/";
  const hrefFor = (pageSlug: string) => (publicSlug ? publicSitePath(publicSlug, pageSlug) : pageSlug);
  const homeAria = labels.homeAria ?? site.siteName;
  const menuLabel = labels.menuLabel ?? labels.navigation;
  const defaults = DEFAULT_LABELS[site.language] ?? DEFAULT_LABELS.en!;
  const sectionLabels = { contactPending: labels.contactPending, openingHours: labels.openingHours ?? defaults.hours };
  const layout = site.layout ?? "classic";

  const link = (l: WebsiteLink, className: string) => (
    <a
      href={hrefFor(l.href)}
      className={className || undefined}
      aria-current={className.includes("sos-nav-link") && l.href === page.slug ? "page" : undefined}
      onClick={
        onNavigate
          ? (e) => {
              e.preventDefault();
              onNavigate(l.href);
            }
          : undefined
      }
    >
      {l.label}
    </a>
  );

  const navLinks = (
    <>
      {site.navigation.map((n) => (
        <React.Fragment key={n.href}>{link(n, "sos-nav-link")}</React.Fragment>
      ))}
      {link(site.primaryCta, "sos-btn sos-btn-primary sos-header-cta")}
    </>
  );

  let soft = false;

  return (
    <div
      lang={site.language}
      className={`sos-site sos-l-${layout}${mobile ? " sos-force-mobile" : ""}`}
      data-layout={layout}
      style={{ background: colors.surface, color: colors.ink, fontFamily: fontStack(fonts.body, fonts.bodyFallback) }}
    >
      {/* Theme tokens are schema-validated hex/font names; styles are authored here, not model HTML. */}
      <style dangerouslySetInnerHTML={{ __html: siteStyles(site.theme) }} />
      <a className="sos-skip" href="#sos-main">
        {labels.skipToContent ?? defaults.skip}
      </a>

      <header className="sos-header">
        <div className="sos-header-inner">
          <a
            className="sos-brand"
            href={homeHref}
            aria-label={homeAria}
            onClick={
              onNavigate
                ? (e) => {
                    e.preventDefault();
                    onNavigate("/");
                  }
                : undefined
            }
          >
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" width={28} height={28} />
            )}
            <span className="sos-brand-name">{site.siteName}</span>
          </a>

          <nav aria-label={labels.navigation} className="sos-nav sos-nav-wide">
            {navLinks}
          </nav>
          <details className="sos-menu">
            <summary>{menuLabel}</summary>
            <nav aria-label={labels.navigation} className="sos-nav">
              {navLinks}
            </nav>
          </details>
        </div>
      </header>

      <main id="sos-main" className="sos-main">
        {page.sections.map((section, index) => {
          const first = index === 0;
          if (section.type === "hero" || section.type === "cta") {
            return <Section key={section.id} section={section} link={link} first={first} {...sectionLabels} />;
          }
          soft = !soft;
          return (
            <div key={section.id} className={soft ? "sos-section-soft" : undefined}>
              <Section section={section} link={link} first={first} {...sectionLabels} />
            </div>
          );
        })}
      </main>

      <footer className="sos-footer">
        <strong>{site.siteName}</strong>
        {site.tagline ? <div>{site.tagline}</div> : null}
        <ul className="sos-footer-nav">
          {site.navigation.map((n) => (
            <li key={n.href}>{link(n, "")}</li>
          ))}
        </ul>
      </footer>
    </div>
  );
}

function Section({
  section,
  ...rest
}: Omit<SectionProps<WebsiteSectionSpec["type"]>, "section"> & { section: WebsiteSectionSpec }) {
  switch (section.type) {
    case "hero":
      return <HeroSection section={section} {...rest} />;
    case "features":
      return <ItemsSection section={section} {...rest} numbered />;
    case "offer":
      return section.display === "menu" || section.display === "list" ? (
        <OfferListSection section={section} {...rest} />
      ) : (
        <ItemsSection section={section} {...rest} numbered={false} />
      );
    case "pricing":
      return <PricingSection section={section} {...rest} />;
    case "about":
      return <AboutSection section={section} {...rest} />;
    case "faq":
      return <FaqSection section={section} {...rest} />;
    case "contact":
      return <ContactSection section={section} {...rest} />;
    case "cta":
      return <CtaSection section={section} {...rest} />;
    default: {
      const unknown: never = section;
      void unknown;
      return null;
    }
  }
}

function HeroSection({ section, link, first }: SectionProps<"hero">) {
  return (
    <section className={section.image ? "sos-hero sos-hero-photo" : "sos-hero"} aria-labelledby={first ? "sos-hero-title" : undefined}>
      {section.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="sos-hero-media" src={section.image.src} alt={section.image.alt} fetchPriority={first ? "high" : "auto"} decoding="async" />
      ) : null}
      <div className="sos-hero-inner">
        {first ? <h1 id="sos-hero-title">{section.heading}</h1> : <h2>{section.heading}</h2>}
        {section.subheading ? <p className="sos-hero-sub">{section.subheading}</p> : null}
        {(section.primaryCta || section.secondaryCta) && (
          <div className="sos-hero-actions">
            {section.primaryCta ? link(section.primaryCta, "sos-btn sos-btn-on-hero") : null}
            {section.secondaryCta ? link(section.secondaryCta, "sos-btn sos-btn-ghost-hero") : null}
          </div>
        )}
      </div>
    </section>
  );
}

/** The page's first section carries its only h1. */
function SectionHeading({ first, children }: { first: boolean; children: React.ReactNode }) {
  return first ? <h1>{children}</h1> : <h2>{children}</h2>;
}

function ItemsSection({ section, first, numbered, link }: SectionProps<"features" | "offer"> & { numbered: boolean }) {
  const catalog = section.type === "offer" && section.display === "catalog";
  return (
    <section className="sos-section" data-display={section.type === "offer" ? (section.display ?? "cards") : undefined}>
      <div className="sos-wrap">
        <header className="sos-section-head">
          <SectionHeading first={first}>{section.heading}</SectionHeading>
          {section.intro ? <p>{section.intro}</p> : null}
        </header>
        <ul className="sos-grid">
          {section.items.map((item, i) => (
            <li key={i} className={catalog ? "sos-card sos-product" : "sos-card"}>
              {numbered ? (
                <div className="sos-card-index" aria-hidden>
                  {i + 1}
                </div>
              ) : null}
              {catalog ? (
                <div className="sos-product-mark" aria-hidden>
                  {item.title.trim().charAt(0).toUpperCase()}
                </div>
              ) : null}
              <h3>{item.title}</h3>
              {item.description ? <p>{item.description}</p> : null}
              {item.price ? <p className="sos-item-price">{item.price}</p> : null}
            </li>
          ))}
        </ul>
        {section.type === "offer" && section.more ? <div className="sos-more">{link(section.more, "sos-btn sos-btn-outline")}</div> : null}
      </div>
    </section>
  );
}

/** Menu (name · price rows) and service list (numbered rows) displays of the offer. */
function OfferListSection({ section, first, link }: SectionProps<"offer">) {
  const menu = section.display === "menu";
  return (
    <section className="sos-section" data-display={section.display}>
      <div className="sos-wrap-narrow">
        <header className="sos-section-head">
          <SectionHeading first={first}>{section.heading}</SectionHeading>
          {section.intro ? <p>{section.intro}</p> : null}
        </header>
        <ul className={menu ? "sos-menu-list" : "sos-service-list"}>
          {section.items.map((item, i) => (
            <li key={i}>
              {menu ? null : (
                <span className="sos-service-index" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
              )}
              <div className="sos-row-body">
                <div className="sos-row-head">
                  <h3>{item.title}</h3>
                  {menu ? <span className="sos-leader" aria-hidden /> : null}
                  {item.price ? <span className="sos-row-price">{item.price}</span> : null}
                </div>
                {item.description ? <p>{item.description}</p> : null}
              </div>
            </li>
          ))}
        </ul>
        {section.more ? <div className="sos-more">{link(section.more, "sos-btn sos-btn-outline")}</div> : null}
      </div>
    </section>
  );
}

function PricingSection({ section, first }: SectionProps<"pricing">) {
  return (
    <section className="sos-section">
      <div className="sos-wrap">
        <header className="sos-section-head">
          <SectionHeading first={first}>{section.heading}</SectionHeading>
          {section.intro ? <p>{section.intro}</p> : null}
        </header>
        <ul className="sos-grid">
          {section.tiers.map((tier, i) => (
            <li key={i} className={tier.highlighted ? "sos-card sos-card-hl" : "sos-card"}>
              <h3>{tier.name}</h3>
              {tier.price ? (
                <p className="sos-price">
                  {tier.price}
                  {tier.cadence ? <span> {tier.cadence}</span> : null}
                </p>
              ) : null}
              {tier.description ? <p>{tier.description}</p> : null}
              {tier.features.length > 0 ? (
                <ul className="sos-feat-list">
                  {tier.features.map((f, j) => (
                    <li key={j}>{f}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
        {section.note ? <p className="sos-note">{section.note}</p> : null}
      </div>
    </section>
  );
}

function AboutSection({ section, first }: SectionProps<"about">) {
  return (
    <section className="sos-section sos-about">
      <div className="sos-wrap-narrow">
        <SectionHeading first={first}>{section.heading}</SectionHeading>
        <p>{section.body}</p>
      </div>
    </section>
  );
}

function FaqSection({ section, first }: SectionProps<"faq">) {
  return (
    <section className="sos-section sos-faq">
      <div className="sos-wrap-narrow">
        <header className="sos-section-head">
          <SectionHeading first={first}>{section.heading}</SectionHeading>
        </header>
        <dl>
          {section.items.map((item, i) => (
            <div key={i} className="sos-faq-item">
              <dt>{item.question}</dt>
              <dd>{item.answer}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** Contact / CTA action hrefs: allow mailto, tel, https, and in-site paths only. */
function safeActionHref(href: string): string {
  const t = href.trim();
  if (!t || /^javascript:/i.test(t) || /^data:/i.test(t)) return "#";
  if (/^(mailto:|tel:|https:)/i.test(t)) return t;
  if (t.startsWith("/") && !t.startsWith("//")) return t;
  return "#";
}

function ContactSection({ section, first, contactPending, openingHours }: SectionProps<"contact">) {
  return (
    <section className="sos-section sos-contact">
      <div className="sos-wrap-narrow">
        <header className="sos-section-head">
          <SectionHeading first={first}>{section.heading}</SectionHeading>
          {section.intro ? <p>{section.intro}</p> : null}
        </header>
        {section.actions && section.actions.length > 0 ? (
          <div className="sos-actions">
            {section.actions.map((a, i) => {
              const href = safeActionHref(a.href);
              const external = href.startsWith("https://");
              return (
                <a
                  key={`${a.kind}-${i}`}
                  href={href}
                  className={i === 0 ? "sos-btn sos-btn-primary" : "sos-btn sos-btn-outline"}
                  data-action={a.kind}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                >
                  {a.label}
                </a>
              );
            })}
          </div>
        ) : null}
        {section.details.length > 0 ? (
          <dl className="sos-grid">
            {section.details.map((d, i) => (
              <div key={i} className="sos-card">
                <dt>{d.label}</dt>
                <dd>{d.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {section.hours && section.hours.length > 0 ? (
          <div className="sos-hours">
            <h3>{openingHours}</h3>
            <dl>
              {section.hours.map((h, i) => (
                <div key={i}>
                  <dt>{h.days}</dt>
                  <dd>{h.time}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
        {section.channelsPending ? (
          <p className="sos-note" role="note" data-preview-notice>
            {contactPending}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function CtaSection({ section, first, link }: SectionProps<"cta">) {
  return (
    <section className="sos-section sos-cta">
      <div className="sos-wrap-narrow">
        <SectionHeading first={first}>{section.heading}</SectionHeading>
        {section.subheading ? <p>{section.subheading}</p> : null}
        {link(section.cta, "sos-btn sos-btn-primary")}
      </div>
    </section>
  );
}
