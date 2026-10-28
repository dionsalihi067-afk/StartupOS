import { describe, expect, it, vi } from "vitest";
import type { BusinessPackage } from "@/lib/types";
import { websiteBriefOf, websiteBriefSchema } from "@/lib/website/brief";
import { buildWebsiteSpec } from "@/lib/website/builder";
import { mergeWebsiteContent } from "@/lib/website/content";
import { toWebsiteCore } from "@/lib/website/legacy";
import type { WebsiteSpec } from "@/lib/website/model";
import { applyWebsiteBrief } from "@/lib/website/setup";
import { makePackage } from "@/test/db";
import { sampleInput } from "@/test/research";

vi.mock("server-only", () => ({}));

const sectionOf = <T extends WebsiteSpec["pages"][number]["sections"][number]["type"]>(spec: WebsiteSpec, type: T) =>
  spec.pages.flatMap((p) => p.sections).find((s): s is Extract<typeof s, { type: T }> => s.type === type);

/** A package whose website copy was rewritten by the model, as the regenerate route stores it. */
function rewrittenPackage(): BusinessPackage {
  const seed = makePackage();
  const input = sampleInput({
    customer: { ideal: "Remote workers", need: "Quiet space" },
    offer: { main: "Espresso", others: "Pastries", differentiator: "Roasted daily" },
    brand: { language: "en" },
  });
  const base = buildWebsiteSpec({ input, brand: seed.brand, pricing: seed.pricing });
  const spec = mergeWebsiteContent(base, {
    hero: { heading: "Coffee for focused mornings", subheading: "Espresso and pastries for remote workers." },
    about: "We roast in small batches and keep the room quiet for people who work.",
    cta: { heading: "Come by for a coffee" },
    offer: [{ description: "Rich, balanced shots." }, { description: "Baked fresh." }],
  });
  expect(sectionOf(spec, "offer")?.items.map((i) => i.title)).toEqual(["Espresso", "Pastries"]);
  return { ...seed, input, website: { ...seed.website, ...toWebsiteCore(spec) } };
}

describe("saving Website setup", () => {
  it("keeps AI-written copy when the answers it was written from are unchanged", () => {
    const pkg = rewrittenPackage();
    const brief = websiteBriefSchema.parse({ ...websiteBriefOf(pkg.input), phone: "+383 44 123 456" });

    const spec = applyWebsiteBrief(pkg, brief).website.spec!;

    expect(sectionOf(spec, "hero")?.heading).toBe("Coffee for focused mornings");
    expect(sectionOf(spec, "hero")?.subheading).toBe("Espresso and pastries for remote workers.");
    expect(sectionOf(spec, "about")?.body).toBe("We roast in small batches and keep the room quiet for people who work.");
    expect(JSON.stringify(spec)).toContain("tel:+38344123456");
  });

  it("keeps item copy with its item and never moves it onto a different one", () => {
    const pkg = rewrittenPackage();
    const brief = websiteBriefSchema.parse({
      ...websiteBriefOf(pkg.input),
      items: [{ name: "Tea" }, { name: "Pastries" }],
    });

    const offer = sectionOf(applyWebsiteBrief(pkg, brief).website.spec!, "offer")!;

    expect(offer.items.find((i) => i.title === "Tea")?.description).toBeUndefined();
    expect(offer.items.find((i) => i.title === "Pastries")?.description).toBe("Baked fresh.");
    expect(JSON.stringify(offer)).not.toContain("Rich, balanced shots.");
  });
});
