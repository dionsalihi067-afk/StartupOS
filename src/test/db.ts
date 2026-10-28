import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { schema, user } from "@/lib/db/schema";
import type { BusinessPackage } from "@/lib/types";

const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../drizzle");

/**
 * One migrated PGlite per Vitest worker. Each `createTestDb()` clones it instead of
 * re-running migrations (WASM boot + migrate under parallel load previously hit the
 * 60s hookTimeout when many files called `createTestDb` at once).
 */
let templateReady: Promise<PGlite> | null = null;

async function migratedTemplate(): Promise<PGlite> {
  if (!templateReady) {
    templateReady = (async () => {
      const client = new PGlite();
      const db = drizzle(client, { schema });
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
      return client;
    })().catch((err) => {
      // Allow a later retry in the same worker if the first migrate fails.
      templateReady = null;
      throw err;
    });
  }
  return templateReady;
}

/** In-process PostgreSQL with the real migration history applied (via clone). */
export async function createTestDb() {
  const template = await migratedTemplate();
  // clone() is typed as PGliteInterface; drizzle's overload expects the concrete PGlite class.
  const client = (await template.clone()) as PGlite;
  const db = drizzle(client, { schema });
  return {
    db,
    close: async () => {
      await client.close();
    },
  };
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>["db"];

export async function createUser(db: TestDb, id: string) {
  await db.insert(user).values({ id, name: id, email: `${id}@example.test` });
  return id;
}

export function makePackage(overrides: Partial<BusinessPackage> = {}): BusinessPackage {
  return {
    id: "biz_legacy_1",
    createdAt: "2026-01-02T03:04:05.000Z",
    input: { idea: "Organic coffee roastery", audience: "Remote workers", location: "Prishtinë", budget: "10.000 €", style: "Organic / Natural" },
    brand: {
      name: "Kafeja",
      slogan: "Slow roasted",
      description: "d",
      mission: "m",
      vision: "v",
      values: ["Quality"],
      voice: ["Warm"],
      personality: ["Calm"],
      logo: { generated: false, imageUrl: "", iconUrl: "", prompt: "", model: null, status: "unavailable", concept: "" },
      palette: [{ name: "Primary", hex: "#000000", role: "primary", usage: "u" }],
      typography: {
        headingFont: "Inter",
        headingFallback: "sans-serif",
        bodyFont: "Inter",
        bodyFallback: "sans-serif",
        googleFontsHref: "",
        scale: [{ label: "Body", sizePx: 16, weight: 400, lineHeight: 1.5, letterSpacing: "0" }],
      },
      guidelines: [],
    },
    website: {
      pages: [{ slug: "/", title: "Home", metaDescription: "", sections: [{ id: "hero", type: "hero", heading: "Hi" }] }],
      seo: { title: "", metaDescription: "", keywords: [], ogTitle: "", ogDescription: "", slugStructure: [], jsonLd: {}, sitemap: [] },
      navItems: [],
      footerColumns: [],
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
    launch: {
      summary: "",
      prelaunch: [],
      launchDay: [],
      postlaunch: [],
      checklist: [
        { item: "Brand identity finalized", done: false },
        { item: "Website live", done: false },
      ],
    },
    meta: { engine: "deterministic", searchProvider: null, durationMs: 1, agentLog: [] },
    ...overrides,
  };
}
