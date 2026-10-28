import { describe, expect, it } from "vitest";
import { buildWebsiteSpec } from "@/lib/website/builder";
import { checkWebsite, hasBlockingIssues } from "@/lib/website/quality";
import type { WebsiteSpec } from "@/lib/website/model";
import { makePackage } from "@/test/db";

const brand = makePackage().brand;
const input = makePackage().input;

function built(): WebsiteSpec {
  return buildWebsiteSpec({
    input,
    brand: { ...brand, name: "Kafeja", slogan: "Slow roasted" },
    pricing: { model: "", rationale: "", tiers: [], psychology: [], upsells: [] },
  });
}

describe("checkWebsite", () => {
  it("allows a deterministic builder site without blocking errors", () => {
    const checks = checkWebsite(built(), input);
    expect(hasBlockingIssues(checks)).toBe(false);
    expect(checks.map((c) => c.id)).not.toContain("missingHomeHero");
  });

  it("blocks publishing when the homepage has no hero", () => {
    const spec = built();
    const home = spec.pages.find((p) => p.slug === "/")!;
    home.sections = home.sections.filter((s) => s.type !== "hero");
    if (home.sections.length === 0) {
      home.sections = [{ type: "about", id: "about", heading: "About", body: "We roast carefully." }];
    }
    const checks = checkWebsite(spec, input);
    expect(checks).toContainEqual({ id: "missingHomeHero", severity: "error", page: "/" });
    expect(hasBlockingIssues(checks)).toBe(true);
  });

  it("blocks publishing when placeholder copy is present", () => {
    const spec = built();
    const hero = spec.pages[0]!.sections.find((s) => s.type === "hero");
    if (hero?.type === "hero") hero.heading = "Lorem ipsum dolor";
    expect(hasBlockingIssues(checkWebsite(spec, input))).toBe(true);
  });
});
