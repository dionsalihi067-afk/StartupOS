import { makePackage } from "@/test/db";
import { buildWebsiteSpec } from "@/lib/website/builder";
import { toWebsiteCore, type WebsiteCore } from "@/lib/website/legacy";
import type { WebsiteSpec } from "@/lib/website/model";

export function makeWebsiteSpec(): WebsiteSpec {
  const pkg = makePackage();
  return buildWebsiteSpec({ input: pkg.input, brand: pkg.brand, pricing: pkg.pricing });
}

/** A valid website patch whose homepage title is `homeTitle`. */
export function makeWebsiteCore(homeTitle: string): WebsiteCore {
  const spec = makeWebsiteSpec();
  return toWebsiteCore({
    ...spec,
    pages: spec.pages.map((page, index) => (index === 0 ? { ...page, seo: { ...page.seo, title: homeTitle } } : page)),
  });
}
