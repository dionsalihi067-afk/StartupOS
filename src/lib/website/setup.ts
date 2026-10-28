import { createContext } from "@/lib/agents/context";
import { runSeoAgent } from "@/lib/agents/seo";
import { applyRegenerationMeta, applySectionPatches } from "@/lib/regenerate-core";
import type { BusinessPackage } from "@/lib/types";
import type { WebsiteBrief } from "@/lib/website/brief";
import { buildWebsiteSpec } from "@/lib/website/builder";
import { mergeWebsiteContent, rewrittenCopy } from "@/lib/website/content";
import { toWebsiteCore } from "@/lib/website/legacy";

/**
 * Saves the owner's Website setup answers and rebuilds the website from them.
 * The rebuild is deterministic (no AI call), so it is fast, free and never
 * fails because a provider is down. Copy an AI rewrite produced is kept
 * wherever the text it rewrote is unchanged. Everything outside `input.website`, the website and its SEO is
 * left untouched — including the live published snapshot.
 */
export function applyWebsiteBrief(pkg: BusinessPackage, brief: WebsiteBrief): BusinessPackage {
  const input = { ...pkg.input, website: brief };
  const nextBase = buildWebsiteSpec({ input, brand: pkg.brand, pricing: pkg.pricing });
  const current = pkg.website.spec;
  const copy = current ? rewrittenCopy(current, buildWebsiteSpec({ input: pkg.input, brand: pkg.brand, pricing: pkg.pricing }), nextBase) : {};
  const spec = Object.keys(copy).length ? mergeWebsiteContent(nextBase, copy) : nextBase;
  const core = toWebsiteCore(spec);
  const seo = runSeoAgent(createContext(input), pkg.brand, core.pages).data;
  const patched = applySectionPatches({ ...pkg, input }, [
    { section: "website", website: core },
    { section: "seo", seo },
  ]);
  return applyRegenerationMeta(patched, [
    { section: "website", status: "ok", source: spec === nextBase ? "deterministic" : "llm" },
    { section: "seo", status: "ok", source: "deterministic" },
  ]);
}
