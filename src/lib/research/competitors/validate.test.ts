import { describe, expect, it } from "vitest";
import type { ResearchEvidence, ResearchSource } from "@/lib/research/model";
import { canonicalDomain, rejectSearchArtifact, validateCandidate } from "@/lib/research/competitors/validate";
import { deriveName, locationTerms, matchTerms, offerTerms, readPricing, targetsBusinesses } from "@/lib/research/competitors/signals";

const TERMS = ["specialty", "coffee"];

function candidate(url: string, title: string, excerpt: string): [ResearchSource, ResearchEvidence] {
  const source: ResearchSource = {
    id: "src_000000000001",
    url,
    domain: new URL(url).hostname.replace(/^www\./, ""),
    title,
    snippet: excerpt,
    retrievedAt: "2026-10-08T12:00:00.000Z",
    queryIds: ["localCompetitors"],
  };
  return [source, { id: "ev_000000000001", sourceId: source.id, excerpt, category: "competitor", queryIds: ["localCompetitors"] }];
}

const check = (url: string, title: string, excerpt: string) => validateCandidate(...candidate(url, title, excerpt), TERMS);

describe("validateCandidate", () => {
  it("accepts an identifiable business page that mentions the offer", () => {
    expect(check("https://riocafe.al/", "Rio Café | Specialty coffee in Tirana", "Specialty coffee roasted daily.")).toEqual({
      ok: true,
      matchedTerms: ["specialty", "coffee"],
    });
  });

  it("rejects articles, listicles, guides and dated posts", () => {
    expect(check("https://site.al/blog/coffee", "Rio Café", "Specialty coffee.")).toMatchObject({ reason: "article" });
    expect(check("https://site.al/", "10 best coffee shops in Tirana", "Coffee guide.")).toMatchObject({ reason: "article" });
    expect(check("https://site.al/", "Best coffee in town", "Coffee.")).toMatchObject({ reason: "article" });
    expect(check("https://news.al/2025/03/coffee", "Coffee prices rise", "Coffee.")).toMatchObject({ reason: "article" });
    expect(check("https://site.al/", "Rio Café vs Nomad Hub", "Coffee.")).toMatchObject({ reason: "article" });
  });

  it("rejects listing and directory pages", () => {
    expect(check("https://cafes.example/location/usa", "Find a coffee shop in the United States | 261 Listings", "Specialty coffee directory.")).toMatchObject({ reason: "article" });
    expect(check("https://cafes.example/", "Specialty coffee | 120 listings", "Coffee.")).toMatchObject({ reason: "article" });
    expect(check("https://cafes.example/", "Coffee shops near you", "Coffee.")).toMatchObject({ reason: "article" });
  });

  it("does not mistake a business describing itself as the best for an article", () => {
    expect(check("https://riocafe.al/", "Rio Café - the best coffee in Tirana", "Specialty coffee.")).toMatchObject({ ok: true });
  });

  it("rejects platforms, marketplaces and directories on any TLD", () => {
    expect(check("https://www.instagram.com/riocafe", "Rio Café", "Coffee.")).toMatchObject({ reason: "platform" });
    expect(check("https://www.tripadvisor.co.uk/Restaurant-Rio", "Rio Café", "Coffee.")).toMatchObject({ reason: "platform" });
    expect(check("https://amazon.de/coffee", "Coffee beans", "Coffee.")).toMatchObject({ reason: "platform" });
  });

  it("rejects suppliers unless the business itself is a supplier", () => {
    expect(check("https://beans.com/", "Coffee Bean Wholesale", "Wholesale coffee beans.")).toMatchObject({ reason: "supplier" });
    expect(validateCandidate(...candidate("https://beans.com/", "Coffee Bean Wholesale", "Wholesale coffee."), ["wholesale", "coffee"])).toMatchObject({ ok: true });
  });

  it("rejects irrelevant businesses", () => {
    expect(check("https://cars.al/", "Tirana Car Rental", "Rent a car in Tirana.")).toMatchObject({ reason: "irrelevant" });
  });

  it("rejects a bank when the offer is clothing/streetwear", () => {
    const clothing = ["streetwear", "clothing", "hoodie"];
    expect(
      validateCandidate(
        ...candidate("https://raiffeisen.example/", "Raiffeisen Bank Kosovo", "Retail banking and loans in Prishtina."),
        clothing,
      ),
    ).toMatchObject({ reason: "irrelevant" });
  });

  it("rejects newspapers for a clothing boutique offer", () => {
    const clothing = ["clothing", "boutique", "fashion", "apparel"];
    expect(
      validateCandidate(
        ...candidate("https://kohaditore.example/", "Koha Ditore Newspaper", "Daily newspaper covering fashion in Fushë Kosovë."),
        clothing,
      ),
    ).toMatchObject({ reason: "irrelevant" });
  });

  // Live acceptance (Velnua Test Boutique): directory/map aggregators were saved as "competitors".
  it("rejects findglocal directories and MapQuest listings for clothing retail", () => {
    const clothing = ["clothing", "boutique", "apparel", "seasonal"];
    expect(
      validateCandidate(
        ...candidate(
          "https://www.findglocal.com/XK/Fush%C3%AB-Kosova/245321-6",
          "Clothing stores in Fushë-Kosova - Find Local Businesses",
          "Find clothing stores in Fushë-Kosova. Listings include Moda Italia Store, GLAMfashion.",
        ),
        clothing,
      ),
    ).toMatchObject({ ok: false, reason: "platform" });
    expect(
      validateCandidate(
        ...candidate(
          "https://www.mapquest.com/us/new-york/kosovo-grocery-541322577",
          "Kosovo Grocery, 3720 3rd Ave, Bronx, NY 10456, US - MapQuest",
          "Kosovo Grocery is a neighborhood store in Bronx, NY. Your printable directions will be ready.",
        ),
        clothing,
      ),
    ).toMatchObject({ ok: false, reason: "platform" });
  });

  // Seen in a live run: a government place-name factfile matched the offer term "albanian".
  it("rejects government and academic publications even when they mention an offer term", () => {
    const terms = ["traditional", "albanian", "pastries"];
    const factfile = candidate(
      "https://assets.publishing.service.gov.uk/media/68aee194969253904d155895/Kosovo_Toponymic_Factfile.pdf",
      "Kosovo",
      "38 municipalities (in Albanian: komunë) in Kosovo: 27 of these have an Albanian majority.",
    );
    expect(validateCandidate(...factfile, terms)).toMatchObject({ ok: false, reason: "platform" });
    expect(validateCandidate(...candidate("https://tourism.gov.al/", "Albanian pastries", "Traditional Albanian pastries."), terms)).toMatchObject({ reason: "platform" });
    expect(validateCandidate(...candidate("https://www.ox.ac.uk/", "Albanian pastries", "Traditional Albanian pastries."), terms)).toMatchObject({ reason: "platform" });
  });

  it("rejects downloadable documents", () => {
    expect(check("https://riocafe.al/files/menu.pdf", "Rio Café menu", "Specialty coffee.")).toMatchObject({ reason: "article" });
    expect(check("https://report.al/coffee-market.DOCX", "Coffee market", "Specialty coffee.")).toMatchObject({ reason: "article" });
  });

  describe("business suppliers versus competitors", () => {
    const bakeryTerms = ["traditional", "albanian", "pastries", "byrek", "bakery"];
    // Live-run text from a half-baked byrek supplier that was accepted as a competitor of a consumer bakery.
    const gerti = candidate(
      "https://gertifoods.com/en",
      "Half-Baked Byrek & Tortillas for Businesses in Kosovo",
      "Fresh golden byrek baked by Gerti Foods Half-baked · Industrial scale · Prizren, Kosovo # Byrek and tortillas ready for your oven. No baker needed. We supply bakeries, hotels, restaurants and supermarkets with half-baked products that bake in 15–20 minutes.",
    );

    it("rejects a business-only supplier when the new business sells to consumers", () => {
      expect(validateCandidate(...gerti, bakeryTerms)).toEqual({ ok: false, reason: "supplier" });
    });

    it("keeps the same supplier as a competitor when the new business also sells to businesses", () => {
      expect(validateCandidate(...gerti, bakeryTerms, { businessMarket: true })).toMatchObject({ ok: true });
    });

    it("keeps a producer that supplies businesses but also serves consumers directly", () => {
      const furra = candidate(
        "https://furraprizreni.com/",
        "Furra Prizreni | Byrek & pastries",
        "Traditional byrek baked daily. Open daily from 6am, visit us in the old town. We also supply cafes and hotels for events.",
      );
      expect(validateCandidate(...furra, bakeryTerms)).toMatchObject({ ok: true });
    });

    it("does not treat a single passing mention of business customers as a supplier", () => {
      const bakery = candidate("https://pekaradrita.al/", "Pekara Drita", "Traditional byrek and pastries, with catering for businesses.");
      expect(validateCandidate(...bakery, bakeryTerms)).toMatchObject({ ok: true });
    });

    it("keeps a wholesaler that also sells retail to consumers", () => {
      const roaster = candidate("https://beanhouse.al/", "Bean House", "Specialty coffee roasted daily. Wholesale beans for offices. Shop now or visit us.");
      expect(check(...([roaster[0].url, roaster[0].title, roaster[1].excerpt] as const))).toMatchObject({ ok: true });
    });
  });

  it("does not treat businesses whose names merely contain institutional words as institutions", () => {
    expect(check("https://govcoffee.com/", "Gov Coffee", "Specialty coffee.")).toMatchObject({ ok: true });
    expect(check("https://edu.riocafe.al/", "Rio Café", "Specialty coffee.")).toMatchObject({ ok: true });
  });
});

describe("rejectSearchArtifact", () => {
  const clothing = ["clothing", "boutique", "apparel"];

  it("accepts a real relevant retailer", () => {
    expect(
      rejectSearchArtifact({
        title: "Moda Italia Store",
        url: "https://modaitalia.example/",
        snippet: "Seasonal clothing boutique in Fushë Kosovë.",
        offerTerms: clothing,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects the directory platform itself, not every business that appears in a snippet", () => {
    expect(
      rejectSearchArtifact({
        title: "Clothing stores - Find Local Businesses",
        url: "https://www.findglocal.com/XK/list",
        snippet: "Listings include Moda Italia Store.",
        offerTerms: clothing,
      }),
    ).toMatchObject({ ok: false, reason: "platform" });

    expect(
      rejectSearchArtifact({
        title: "Moda Italia Store",
        url: "https://modaitalia.example/",
        snippet: "Seasonal clothing and apparel boutique.",
        offerTerms: clothing,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects an unrelated business when offer terms are provided", () => {
    expect(
      rejectSearchArtifact({
        title: "Raiffeisen Bank Kosovo",
        url: "https://bank.example/",
        snippet: "Retail banking and loans.",
        offerTerms: clothing,
      }),
    ).toMatchObject({ ok: false, reason: "irrelevant" });
  });

  it("returns insufficientEvidence for an unparseable URL", () => {
    expect(
      rejectSearchArtifact({
        title: "Mystery Shop",
        url: "not-a-url",
        snippet: "Clothing boutique.",
        offerTerms: clothing,
      }),
    ).toMatchObject({ ok: false, reason: "insufficientEvidence" });
  });
});

describe("canonicalDomain", () => {
  it("collapses subdomains and mobile/www prefixes to the registrable domain", () => {
    expect(canonicalDomain("www.riocafe.al")).toBe("riocafe.al");
    expect(canonicalDomain("shop.riocafe.al")).toBe("riocafe.al");
    expect(canonicalDomain("m.riocafe.al")).toBe("riocafe.al");
    expect(canonicalDomain("RIOCAFE.AL")).toBe("riocafe.al");
  });

  it("keeps country second-level domains and shared-host tenants distinct", () => {
    expect(canonicalDomain("shop.nomadhub.co.uk")).toBe("nomadhub.co.uk");
    expect(canonicalDomain("www.kafe.com.al")).toBe("kafe.com.al");
    expect(canonicalDomain("riocafe.wixsite.com")).toBe("riocafe.wixsite.com");
    expect(canonicalDomain("other.wixsite.com")).toBe("other.wixsite.com");
  });
});

describe("signals", () => {
  it("derives offer and location terms without generic words", () => {
    const context = { idea: "Specialty coffee shop", offer: "Pour-over coffee", location: "Prishtinë, Kosovo", revenueModels: [] };
    expect(offerTerms(context)).toEqual(["pour", "over", "coffee", "specialty"]);
    expect(locationTerms(context)).toEqual(["prishtine", "kosovo"]);
  });

  it("matches accent-insensitively and tolerates simple inflections", () => {
    expect(matchTerms(["tirana", "coffee"], "Kafe in Tiranë, best coffees")).toEqual(["tirana", "coffee"]);
    expect(matchTerms(["bar"], "barista")).toEqual([]);
  });

  it("reads only explicit prices, keeping the cadence", () => {
    expect(readPricing("Desks from €8/day and €120 per month.")).toEqual({
      status: "observed",
      prices: [
        { amount: "€8/day", excerpt: expect.stringContaining("€8/day") },
        { amount: "€120 per month", excerpt: expect.stringContaining("€120 per month") },
      ],
    });
    expect(readPricing("Espresso 150 ALL, cappuccino 200 lekë.")).toMatchObject({ status: "observed", prices: [{ amount: "150 ALL" }, { amount: "200 lekë" }] });
  });

  it("treats company figures as ambiguous and missing prices as unavailable", () => {
    expect(readPricing("The startup raised $5 million last year.")).toEqual({ status: "ambiguous" });
    expect(readPricing("Revenue reached €2 billion.")).toEqual({ status: "ambiguous" });
    expect(readPricing("We serve all customers in 2025.")).toEqual({ status: "unavailable" });
  });

  it("derives a business name from a title, falling back to the domain", () => {
    expect(deriveName("Rio Café | Specialty coffee", "riocafe.al")).toBe("Rio Café");
    expect(deriveName("Home - Rio Café", "riocafe.al")).toBe("Rio Café");
    expect(deriveName("x", "riocafe.al")).toBe("riocafe.al");
  });

  it("prefers the name that the page text and domain agree on over a headline title", () => {
    const title = "Half-Baked Byrek & Tortillas for Businesses in Kosovo";
    const excerpt = "Fresh golden byrek baked by Gerti Foods Half-baked · Industrial scale";
    expect(deriveName(title, "gertifoods.com", excerpt)).toBe("Gerti Foods");
    expect(deriveName("Specialty coffee | Rio Café", "riocafe.al")).toBe("Rio Café");
    expect(deriveName("Mulliri Vjetër | Kafe", "mulliri.al")).toBe("Mulliri Vjetër");
  });

  it("uses a provider-supplied publisher when text and domain do not agree", () => {
    expect(deriveName("Fresh pastries delivered every morning in Prizren", "bakes-example.com", "", "Furra e Vjetër")).toBe("Furra e Vjetër");
  });

  it("never turns a headline into a name; falls back to the domain when identity is unclear", () => {
    const headline = "Traditional byrek and pastries for families in Prizren";
    expect(deriveName(headline, "bakes-example.com", "Fresh byrek every morning.")).toBe("bakes-example.com");
    expect(deriveName("Kafe Drita", "kafedrita.al")).toBe("Kafe Drita");
    expect(deriveName("Gov Coffee | Specialty coffee bar", "govcoffee.com")).toBe("Gov Coffee");
  });

  it("detects whether the new business itself sells to businesses", () => {
    const base = { revenueModels: [] };
    expect(targetsBusinesses({ ...base, idea: "A small bakery selling traditional pastries", customer: "Office workers and families nearby" })).toBe(false);
    expect(targetsBusinesses({ ...base, idea: "Wholesale bakery supplying cafes and hotels" })).toBe(true);
    expect(targetsBusinesses({ ...base, idea: "Catering", customer: "Companies hosting events" })).toBe(true);
  });
});
