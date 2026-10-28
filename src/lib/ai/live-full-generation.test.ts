/**
 * ONE bounded full business-generation against live OpenAI + configured search.
 * Opt-in only — never runs in CI by default.
 *
 *   $env:STARTUPOS_LIVE_FULL='1'; npx vitest run src/lib/ai/live-full-generation.test.ts
 *
 * Optional: STARTUPOS_LIVE_SKIP_IMAGES=1 skips logo image API calls (still records unavailable).
 * Writes a safe report to tmp-live-full-generation-report.json (no secrets).
 */
import nextEnv from "@next/env";
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("server-only", () => ({}));

const live = process.env.STARTUPOS_LIVE_FULL === "1";
const skipImages = process.env.STARTUPOS_LIVE_SKIP_IMAGES === "1";

if (live) {
  const env = process.env as Record<string, string | undefined>;
  const nodeEnv = env.NODE_ENV;
  env.NODE_ENV = "development";
  nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error }, true);
  env.NODE_ENV = nodeEnv;
}

const BRIEF = {
  idea: "Small-batch natural skincare made in Prishtina, sold online and at weekend markets",
  audience: "Women 25-40 who prefer natural products and transparent ingredients",
  location: "Prishtina, Kosovo",
  budget: "4000 €",
  style: "Organic / Natural",
} as const;

describe.skipIf(!live)("live full business generation (opt-in, one run)", () => {
  it(
    "runs research + orchestrate once, persists, and reports honest provenance",
    { timeout: 900_000 },
    async () => {
      const { resolveLlmProvider } = await import("@/lib/ai/provider");
      const { isImageGenConfigured } = await import("@/lib/ai/image");
      const { getSearchProvider } = await import("@/lib/services/search");
      const { researchForGeneration } = await import("@/lib/research/generation");
      const { orchestrate } = await import("@/lib/orchestrator");
      const { createTestDb, createUser } = await import("@/test/db");
      const {
        createGeneratingBusiness,
        completeGeneration,
        getBusiness,
      } = await import("@/lib/businesses/repository");
      const { businessAssetStore } = await import("@/lib/businesses/assets");

      const provider = resolveLlmProvider();
      expect(provider.configured).toBe(true);
      expect(provider.kind).toBe("openai");
      expect(provider.baseUrl).toContain("api.openai.com");
      expect(provider.ignoredLocalBase).toBe(true);

      if (skipImages) {
        vi.spyOn(await import("@/lib/ai/image"), "isImageGenConfigured").mockReturnValue(false);
      }

      const startedAt = Date.now();
      const researchStarted = Date.now();
      const research = await researchForGeneration({ ...BRIEF });
      const researchMs = Date.now() - researchStarted;

      const { db, close } = await createTestDb();
      try {
        const userId = await createUser(db, `live_full_${Date.now()}`);
        const businessId = await createGeneratingBusiness(db, userId, { ...BRIEF });
        const storeAsset = businessAssetStore(db, userId, businessId);

        const events: { type: string; agent?: string; source?: string; fallback?: boolean; message?: string }[] = [];
        let detail: NonNullable<Awaited<ReturnType<typeof getBusiness>>> | undefined;
        let completePkg: import("@/lib/types").BusinessPackage | undefined;

        for await (const event of orchestrate(
          { ...BRIEF },
          { research, storeAsset, businessId },
        )) {
          if (event.type === "agent-start" || event.type === "agent-complete" || event.type === "agent-error") {
            events.push({
              type: event.type,
              agent: "agent" in event ? event.agent : undefined,
              source: "source" in event ? event.source : undefined,
              fallback: "fallback" in event ? event.fallback : undefined,
              message: "message" in event ? event.message : undefined,
            });
          }
          if (event.type === "error") {
            events.push({ type: "error", message: event.message });
          }
          if (event.type === "complete" && event.result) {
            completePkg = event.result;
            const stored = await completeGeneration(db, userId, businessId, event.result);
            expect(stored).toBeTruthy();
            detail = (await getBusiness(db, userId, businessId))!;
          }
        }

        const elapsedMs = Date.now() - startedAt;
        expect(completePkg).toBeDefined();
        expect(detail).toBeTruthy();
        expect(detail!.status).toBe("ready");
        expect(detail!.package).toBeTruthy();

        const log = completePkg!.meta.agentLog;
        const stages = log.map((e) => ({
          agent: e.agent,
          agentKey: e.agentKey,
          status: e.status,
          source: e.source,
          durationMs: e.durationMs,
          note: e.note,
          modelId: e.modelId,
          costUsd: e.costUsd,
        }));

        const llmStages = stages.filter((s) => s.source === "llm");
        const detStages = stages.filter((s) => s.source === "deterministic");
        const fallbackStages = stages.filter((s) => s.status === "fallback" || s.note);

        // Core AI specialists must not all silently become deterministic while OpenAI is configured.
        const mustPreferLlm = ["brand", "persona", "pricing", "website", "marketing", "strategy"];
        const llmKeys = new Set(llmStages.map((s) => s.agentKey).filter(Boolean));
        const missingLlm = mustPreferLlm.filter((k) => !llmKeys.has(k as never));

        const researchSources =
          completePkg!.marketResearch?.sources?.slice(0, 8).map((s) => ({
            title: s.title,
            url: s.url,
          })) ?? [];
        const competitorSources =
          completePkg!.competitors?.sources?.slice(0, 8).map((s) => ({
            title: s.title,
            url: s.url,
          })) ?? [];

        const report = {
          kind: "live-full-generation",
          brief: BRIEF,
          businessId,
          userId,
          elapsedMs,
          researchMs,
          researchStatus: research.status,
          researchProvider:
            research.status === "failed"
              ? research.provider
              : research.snapshot.provider,
          researchQueryCount:
            research.status === "failed"
              ? research.queries.length
              : research.snapshot.queries.length,
          researchSourcesFound:
            research.status === "failed" ? 0 : research.snapshot.stats.sourcesFound,
          provider: {
            kind: provider.kind,
            baseUrl: provider.baseUrl,
            model: provider.model,
            preference: provider.preference,
            selectionReason: provider.selectionReason,
            ignoredLocalBase: provider.ignoredLocalBase ?? false,
          },
          searchProviderConfigured: getSearchProvider(),
          imageGenConfigured: skipImages ? false : isImageGenConfigured(),
          imagesSkippedByFlag: skipImages,
          meta: {
            engine: completePkg!.meta.engine,
            llmProvider: completePkg!.meta.llmProvider,
            llmSelectionReason: completePkg!.meta.llmSelectionReason,
            searchProvider: completePkg!.meta.searchProvider,
            durationMs: completePkg!.meta.durationMs,
            estimatedCostUsd: completePkg!.meta.estimatedCostUsd,
            quality: completePkg!.meta.quality,
            runId: completePkg!.meta.runId,
          },
          stages,
          llmStageCount: llmStages.length,
          deterministicStageCount: detStages.length,
          fallbackOrNotedStages: fallbackStages,
          mustPreferLlmMissing: missingLlm,
          sections: {
            brandName: completePkg!.brand.name,
            brandSlogan: completePkg!.brand.slogan,
            logoStatus: completePkg!.brand.logo.status,
            logoGenerated: completePkg!.brand.logo.generated,
            personaName: completePkg!.persona.name,
            competitorsAvailable: completePkg!.competitors.available,
            competitorsStatus: completePkg!.competitors.status,
            competitorCount: completePkg!.competitors.competitors?.length ?? 0,
            marketAvailable: completePkg!.marketResearch.available,
            marketStatus: completePkg!.marketResearch.status,
            pricingTiers: completePkg!.pricing.tiers?.length ?? 0,
            strategyPresent: Boolean(completePkg!.strategy),
            websitePages: completePkg!.website.pages?.length ?? 0,
            marketingInstagram: completePkg!.marketing.instagram?.length ?? 0,
            emailSteps: completePkg!.marketing.email?.sequence?.length ?? 0,
            whatsappNodes: completePkg!.marketing.whatsapp?.nodes?.length ?? 0,
            growthPhases: completePkg!.growth?.length ?? 0,
            launchChecklist: completePkg!.launch?.checklist?.length ?? 0,
            seoTitle: completePkg!.website.seo?.title ?? null,
          },
          researchSources,
          competitorSources,
          eventSummary: {
            starts: events.filter((e) => e.type === "agent-start").length,
            completes: events.filter((e) => e.type === "agent-complete").length,
            errors: events.filter((e) => e.type === "agent-error" || e.type === "error").length,
          },
          finishedAt: new Date().toISOString(),
        };

        const outPath = path.resolve(process.cwd(), "tmp-live-full-generation-report.json");
        fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
        console.log(`[live-full] wrote ${outPath}`);
        console.log(
          `[live-full] businessId=${businessId} elapsedMs=${elapsedMs} engine=${report.meta.engine} quality=${report.meta.quality?.outcome} llmStages=${llmStages.length} missingLlm=${missingLlm.join(",") || "none"}`,
        );

        expect(completePkg!.meta.engine).not.toBe("deterministic");
        expect(completePkg!.meta.llmProvider).toBe("openai");
        expect(missingLlm.length).toBe(0);
        expect(completePkg!.brand.name.length).toBeGreaterThan(1);
        expect(completePkg!.website.pages.length).toBeGreaterThan(0);
        expect(detail!.package!.brand.name).toBe(completePkg!.brand.name);
      } finally {
        await close();
      }
    },
  );
});
