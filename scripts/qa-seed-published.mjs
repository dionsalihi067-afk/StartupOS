/**
 * Dev-only browser-QA seed. Requires DATABASE_URL pointing at a migrated Postgres.
 * Seeds a live published_website row (and a matching business) for /s/qa-cafe.
 */
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
// Seeds fake users and live public sites: never run it against a shared or remote database.
let host = "";
try {
  host = new URL(url).hostname;
} catch {
  host = "";
}
if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(host)) {
  console.error("Refusing to seed: DATABASE_URL must point at a local database (localhost).");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);
await migrate(db, { migrationsFolder: path.resolve("drizzle") });

function fingerprint(site) {
  const input = JSON.stringify(site);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

function page(id, slug, label, title, description, sections) {
  return {
    id,
    slug,
    label,
    seo: { title, description, canonicalPath: slug },
    metadata: {
      title,
      description,
      canonicalPath: slug,
      locale: "en",
      siteName: "Very Long Business Name For Overflow Testing Cafe",
      openGraph: {
        type: "website",
        title,
        description,
        siteName: "Very Long Business Name For Overflow Testing Cafe",
      },
    },
    sections,
  };
}

const siteName = "Very Long Business Name For Overflow Testing Cafe";
const site = {
  version: 1,
  siteName,
  tagline: "Slow roasted specialty coffee for remote workers",
  language: "en",
  theme: {
    colors: {
      primary: "#1f4d3a",
      secondary: "#c4a35a",
      accent: "#1f4d3a",
      ink: "#14201b",
      surface: "#fbfaf6",
      onPrimary: "#ffffff",
    },
    fonts: {
      heading: "Fraunces",
      headingFallback: "Georgia, serif",
      body: "Source Sans 3",
      bodyFallback: "system-ui, sans-serif",
    },
  },
  primaryCta: { label: "Get in touch", href: "/contact" },
  navigation: [
    { label: "Home", href: "/" },
    { label: "Menu", href: "/menu" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ],
  pages: [
    page("home", "/", "Home", `${siteName} — Slow roasted`, "Specialty coffee for remote workers in Tirana.", [
      {
        type: "hero",
        id: "hero",
        heading: "Coffee for focused mornings and deep work sessions",
        subheading: "Single-origin espresso and quiet tables for people who need to get things done.",
        primaryCta: { label: "Get in touch", href: "/contact" },
        secondaryCta: { label: "See what we offer", href: "/menu" },
      },
      {
        type: "features",
        id: "why",
        heading: "Why us",
        items: [
          { title: "What makes us different", description: "Beans roasted in-house every morning." },
          { title: "What you need", description: "Reliable wifi and good coffee." },
          { title: "The problem we solve", description: "No quiet place to work." },
        ],
      },
      {
        type: "cta",
        id: "cta",
        heading: "Ready to get started?",
        subheading: "Slow roasted specialty coffee for remote workers",
        cta: { label: "Get in touch", href: "/contact" },
      },
    ]),
    page("offer", "/menu", "Menu", "Menu — QA Cafe", "Our menu for remote workers in Tirana.", [
      {
        type: "offer",
        id: "offer",
        heading: "Our menu",
        items: [
          { title: "Single-origin espresso", description: "Rich, balanced shots." },
          { title: "Pour-over" },
          { title: "Pastries" },
          { title: "Seasonal filter coffee with tasting notes written in long form for wrapping checks" },
        ],
      },
      { type: "cta", id: "offer-cta", heading: "Ready to get started?", cta: { label: "Get in touch", href: "/contact" } },
    ]),
    page("about", "/about", "About", "About — QA Cafe", "About our cafe in Tirana.", [
      {
        type: "about",
        id: "about",
        heading: "About us",
        body: "We roast coffee for people who work from cafes. No invented awards. Just coffee, tables, and a quiet corner when you need it.",
      },
    ]),
    page("contact", "/contact", "Contact", "Contact — QA Cafe", "Contact the cafe in Tirana.", [
      {
        type: "contact",
        id: "contact",
        heading: "Get in touch",
        intro: "Tell us what you need.",
        details: [{ label: "Location", value: "Tirana" }],
        channelsPending: true,
      },
      {
        type: "faq",
        id: "faq",
        heading: "Frequently asked questions",
        items: [
          { question: "What do you offer?", answer: "Espresso, pour-over, and pastries." },
          { question: "Where are you based?", answer: "Tirana." },
        ],
      },
    ]),
  ],
};

const fp = fingerprint(site);
const now = new Date();
const nowIso = now.toISOString();
const userId = "qa_user_browser";
const businessId = "biz_qa_browser_1";
const slug = "qa-cafe";

const input = {
  idea: "Specialty coffee shop",
  audience: "Remote workers",
  location: "Tirana",
  budget: "10.000 €",
  style: "Organic / Natural",
};

const minimalPkg = {
  id: businessId,
  createdAt: nowIso,
  input,
  brand: {
    name: siteName,
    slogan: site.tagline,
    description: "Coffee for remote workers.",
    mission: "Quiet tables and good coffee.",
    vision: "A calm place to work.",
    values: ["Quality"],
    voice: ["Warm"],
    personality: ["Calm"],
    logo: { generated: false, imageUrl: "", iconUrl: "", prompt: "", model: null, status: "unavailable", concept: "" },
    palette: [{ name: "Primary", hex: "#1f4d3a", role: "primary", usage: "Brand" }],
    typography: {
      headingFont: "Fraunces",
      headingFallback: "Georgia, serif",
      bodyFont: "Source Sans 3",
      bodyFallback: "system-ui, sans-serif",
      googleFontsHref: "",
      scale: [{ label: "Body", sizePx: 16, weight: 400, lineHeight: 1.5, letterSpacing: "0" }],
    },
    guidelines: [],
  },
  website: {
    spec: {
      version: 1,
      siteName,
      tagline: site.tagline,
      language: "en",
      theme: site.theme,
      primaryCta: site.primaryCta,
      navigation: site.navigation,
      pages: site.pages.map(({ metadata: _m, ...p }) => p),
    },
    pages: site.pages.map((p) => ({
      slug: p.slug,
      title: p.seo.title,
      metaDescription: p.seo.description,
      sections: p.sections.map((s) => ({
        id: s.id,
        type: s.type === "offer" ? "services" : s.type,
        heading: s.heading,
        ...(s.subheading ? { subheading: s.subheading } : {}),
        ...(s.body ? { body: s.body } : {}),
        ...(s.items ? { items: s.items.map((i) => ({ title: i.title, description: i.description ?? "" })) } : {}),
        ...(s.primaryCta ? { primaryCta: s.primaryCta.label } : {}),
      })),
    })),
    seo: { title: siteName, metaDescription: site.tagline, keywords: [], ogTitle: siteName, ogDescription: site.tagline, slugStructure: [], jsonLd: {}, sitemap: site.pages.map((p) => p.slug) },
    navItems: site.navigation,
    footerColumns: [],
    publication: {
      preparedAt: nowIso,
      fingerprint: fp,
      publicSlug: slug,
      publishedAt: nowIso,
      publishedFingerprint: fp,
      live: true,
    },
  },
  marketing: {
    strategy: { positioning: "", channels: [], messaging: [], kpis: [], contentPillars: [], calendar: [] },
    instagram: [],
    facebookAds: [],
    email: { name: "", goal: "", sequence: [] },
    whatsapp: { name: "", goal: "", nodes: [] },
  },
  competitors: {
    available: false,
    status: "search-not-configured",
    provider: null,
    queries: [],
    marketOverview: "",
    competitors: [],
    swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
    differentiation: [],
    opportunityGaps: [],
    sources: [],
  },
  marketResearch: {
    available: false,
    status: "search-not-configured",
    provider: null,
    queries: [],
    summary: "",
    trends: [],
    painPoints: [],
    demandSignals: [],
    opportunities: [],
    sources: [],
  },
  pricing: { model: "", rationale: "", tiers: [], psychology: [], upsells: [] },
  persona: { name: "", archetype: "", age: "", occupation: "", bio: "", goals: [], painPoints: [], channels: [], objections: [], quote: "" },
  salesFunnel: [],
  growth: [],
  launch: { summary: "", prelaunch: [], launchDay: [], postlaunch: [], checklist: [] },
  meta: { engine: "deterministic", searchProvider: null, durationMs: 1, agentLog: [] },
};

const inputJson = JSON.stringify(input);
const pkgJson = JSON.stringify(minimalPkg);
const siteJson = JSON.stringify(site);

await sql.begin(async (tx) => {
  await tx.unsafe(
    `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4::timestamptz, $4::timestamptz)
     ON CONFLICT (id) DO NOTHING`,
    [userId, "QA Browser", "qa-browser@example.test", nowIso],
  );
  await tx.unsafe(
    `INSERT INTO "business" (id, user_id, status, name, slogan, input, package, icon_url, launch_done, launch_total, version, created_at, updated_at)
     VALUES ($1, $2, 'ready', $3, $4, $5::jsonb, $6::jsonb, null, 0, 0, 1, $7::timestamptz, $7::timestamptz)
     ON CONFLICT (id) DO UPDATE SET package = EXCLUDED.package, status = 'ready', name = EXCLUDED.name, updated_at = $7::timestamptz`,
    [businessId, userId, siteName, site.tagline, inputJson, pkgJson, nowIso],
  );
  await tx.unsafe(
    `INSERT INTO "published_website" (business_id, public_slug, status, fingerprint, site, published_at, created_at, updated_at)
     VALUES ($1, $2, 'live', $3, $4::jsonb, $5::timestamptz, $5::timestamptz, $5::timestamptz)
     ON CONFLICT (business_id) DO UPDATE SET
       public_slug = EXCLUDED.public_slug,
       status = 'live',
       fingerprint = EXCLUDED.fingerprint,
       site = EXCLUDED.site,
       published_at = EXCLUDED.published_at,
       updated_at = $5::timestamptz`,
    [businessId, slug, fp, siteJson, nowIso],
  );
});

const studioName = "Short Studio";
const studio = {
  version: 1,
  siteName: studioName,
  tagline: "Design systems for small teams",
  language: "en",
  theme: {
    colors: {
      primary: "#0f172a",
      secondary: "#64748b",
      accent: "#0f172a",
      ink: "#0f172a",
      surface: "#ffffff",
      onPrimary: "#ffffff",
    },
    fonts: {
      heading: "system-ui",
      headingFallback: "sans-serif",
      body: "system-ui",
      bodyFallback: "sans-serif",
    },
  },
  primaryCta: { label: "Contact", href: "/contact" },
  navigation: [
    { label: "Home", href: "/" },
    { label: "Contact", href: "/contact" },
  ],
  pages: [
    page(
      "home",
      "/",
      "Home",
      studioName,
      "Minimal studio site with system fonts and no logo.",
      [
        {
          type: "hero",
          id: "hero",
          heading:
            "A very long heading that stretches across the hero to validate wrapping without inventing claims or statistics for this quality check",
        },
        {
          type: "about",
          id: "about",
          heading: "About",
          body: "We help small teams ship clearer interfaces. Optional sections omitted on purpose.",
        },
      ],
    ),
    page("contact", "/contact", "Contact", `Contact — ${studioName}`, "Contact Short Studio.", [
      { type: "contact", id: "contact", heading: "Contact", details: [], channelsPending: true },
    ]),
  ],
};
// Fix studio page metadata siteName (page() hardcodes cafe name)
for (const p of studio.pages) {
  p.metadata.siteName = studioName;
  p.metadata.openGraph.siteName = studioName;
}

const studioId = "biz_qa_browser_2";
const studioUser = "qa_user_browser_2";
const studioSlug = "qa-studio";
const studioFp = fingerprint(studio);
const studioJson = JSON.stringify(studio);

await sql.begin(async (tx) => {
  await tx.unsafe(
    `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4::timestamptz, $4::timestamptz)
     ON CONFLICT (id) DO NOTHING`,
    [studioUser, "QA Browser 2", "qa-browser-2@example.test", nowIso],
  );
  await tx.unsafe(
    `INSERT INTO "business" (id, user_id, status, name, slogan, input, package, icon_url, launch_done, launch_total, version, created_at, updated_at)
     VALUES ($1, $2, 'ready', $3, $4, '{}'::jsonb, '{}'::jsonb, null, 0, 0, 1, $5::timestamptz, $5::timestamptz)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = $5::timestamptz`,
    [studioId, studioUser, studioName, studio.tagline, nowIso],
  );
  await tx.unsafe(
    `INSERT INTO "published_website" (business_id, public_slug, status, fingerprint, site, published_at, created_at, updated_at)
     VALUES ($1, $2, 'live', $3, $4::jsonb, $5::timestamptz, $5::timestamptz, $5::timestamptz)
     ON CONFLICT (business_id) DO UPDATE SET
       public_slug = EXCLUDED.public_slug,
       status = 'live',
       fingerprint = EXCLUDED.fingerprint,
       site = EXCLUDED.site,
       published_at = EXCLUDED.published_at,
       updated_at = $5::timestamptz`,
    [studioId, studioSlug, studioFp, studioJson, nowIso],
  );
});

console.log(
  JSON.stringify(
    {
      ok: true,
      publicPaths: [`/s/${slug}`, `/s/${studioSlug}`],
      unpublishedCheck: `/s/does-not-exist-qa`,
    },
    null,
    2,
  ),
);
await sql.end();
