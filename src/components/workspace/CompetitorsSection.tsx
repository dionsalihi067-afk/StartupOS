"use client";

import * as React from "react";
import { ChevronDown, ExternalLink, SearchX, Settings2 } from "lucide-react";
import type { BusinessPackage, CompetitorAnalysis, MarketInsight, MarketResearch, ResearchStatus, SearchResult } from "@/lib/types";
import { Badge, ButtonLink, Card, CardBody, CardHeader, SectionHeader } from "@/components/ui/primitives";
import { Provenance } from "@/components/ui/Provenance";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { researchState } from "@/lib/client/insights";
import {
  classifyPersistedCompetitor,
  confirmedCompetitors,
  competitorsNeedingRevalidation,
} from "@/lib/research/competitors/revalidate";
import { useT } from "@/i18n/client";
import type { Messages } from "@/i18n/messages";

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function CompetitorsSection({ pkg }: { pkg: BusinessPackage }) {
  const t = useT();
  const competitors = pkg.competitors;
  const market = pkg.marketResearch;

  return (
    <div className="space-y-8">
      <ResearchStatusBar competitors={competitors} market={market} />

      <section aria-labelledby="competitors-heading" className="space-y-4">
        <SectionHeader id="competitors-heading" title={t("competitors.listTitle")} description={t("competitors.listDescription")} />
        {competitors.available ? (
          <CompetitorList competitors={competitors} />
        ) : (
          <ResearchUnavailable status={competitors.status} kind="competitors" />
        )}
      </section>

      <section aria-labelledby="market-heading" className="space-y-4">
        <SectionHeader id="market-heading" title={t("competitors.marketTitle")} description={t("competitors.marketDescription")} />
        {market.available ? <MarketView market={market} /> : <ResearchUnavailable status={market.status} kind="market" />}
      </section>

      {competitors.available && <StrategyView competitors={competitors} />}

      {(competitors.sources.length > 0 || market.sources.length > 0) && (
        <SourcesList sources={dedupeSources([...competitors.sources, ...market.sources])} />
      )}
    </div>
  );
}

function dedupeSources(list: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
}

/* ---------------------------- Status + legend -------------------------- */

function ResearchStatusBar({ competitors, market }: { competitors: CompetitorAnalysis; market: MarketResearch }) {
  const t = useT();
  const c = researchState(competitors.status, t);
  const m = researchState(market.status, t);
  const provider = competitors.provider ?? market.provider;
  const queries = [...competitors.queries, ...market.queries];
  const sources = dedupeSources([...competitors.sources, ...market.sources]).length;

  return (
    <Card>
      <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        <StatusCell label={t("competitors.statusBar.competitorResearch")}>
          <Badge tone={c.tone} dot>
            {c.label}
          </Badge>
        </StatusCell>
        <StatusCell label={t("competitors.statusBar.marketResearch")}>
          <Badge tone={m.tone} dot>
            {m.label}
          </Badge>
        </StatusCell>
        <StatusCell label={t("competitors.statusBar.provider")}>
          <span className="text-sm text-ink">
            {provider ? t("competitors.statusBar.webSearch") : t("common.none")}
          </span>
        </StatusCell>
        <StatusCell label={t("competitors.statusBar.evidence")}>
          <span className="text-sm tabular-nums text-ink">
            {t("competitors.statusBar.queries", { count: queries.length })} ·{" "}
            {t("competitors.statusBar.sources", { count: sources })}
          </span>
        </StatusCell>
      </div>
      <div className="flex flex-col gap-2 border-t border-border px-5 py-3 text-[12.5px] text-ink-muted md:flex-row md:items-center md:gap-4">
        <span className="font-medium text-ink-subtle">{t("competitors.statusBar.howToRead")}</span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5">
            <Provenance kind="fact" /> {t("competitors.statusBar.legendFact")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Provenance kind="analysis" /> {t("competitors.statusBar.legendAnalysis")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Provenance kind="recommendation" /> {t("competitors.statusBar.legendRecommendation")}
          </span>
        </span>
      </div>
      {queries.length > 0 && (
        <details className="group border-t border-border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-2.5 text-[12.5px] font-medium text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
            {t("competitors.statusBar.queriesUsed")}
            <ChevronDown size={14} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="space-y-1 px-5 pb-3">
            {queries.map((q, i) => (
              <li key={i} className="font-mono text-[12px] text-ink-subtle">
                {q}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function StatusCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-3.5">
      <div className="mb-1.5 text-[12px] text-ink-subtle">{label}</div>
      {children}
    </div>
  );
}

/* ----------------------------- Competitors ----------------------------- */

type CompetitorType = keyof Messages["competitors"]["types"];

function CompetitorList({ competitors }: { competitors: CompetitorAnalysis }) {
  const t = useT();
  const confirmed = confirmedCompetitors(competitors.competitors);
  const flagged = competitorsNeedingRevalidation(competitors.competitors);
  if (competitors.competitors.length === 0) {
    return (
      <EmptyState
        compact
        icon={SearchX}
        title={t("competitors.noCompetitorsTitle")}
        description={t("competitors.noCompetitorsDescription")}
        action={null}
      />
    );
  }
  if (confirmed.length === 0 && flagged.length > 0) {
    return (
      <EmptyState
        compact
        icon={SearchX}
        title={t("competitors.noConfirmedTitle")}
        description={t("competitors.noConfirmedDescription", { count: flagged.length })}
        action={null}
      />
    );
  }
  return (
    <div className="space-y-4">
      {competitors.marketOverview && (
        <Card>
          <CardHeader title={t("competitors.landscapeSummary")} actions={<Provenance kind="analysis" />} />
          <CardBody>
            <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">{competitors.marketOverview}</p>
          </CardBody>
        </Card>
      )}
      {flagged.length > 0 && (
        <p className="text-[12.5px] text-ink-muted">{t("competitors.filteredPlatformNote", { count: flagged.length })}</p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {confirmed.map((c, i) => (
          <Card key={`${c.name}-${i}`} className="flex flex-col">
            <div className="border-b border-border px-5 py-4">
              {/*
                Identity (name, type, website URL from research) may be labeled as a fact.
                Description and SWOT must not inherit that label — they are often AI analysis.
              */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-ink">{c.name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge tone="outline">{t.optional(`competitors.types.${c.type as CompetitorType}`) ?? c.type}</Badge>
                    {c.category && <Badge>{c.category}</Badge>}
                    {classifyPersistedCompetitor(c) === "platformListing" ? (
                      <Badge tone="warning" title={t("competitors.platformListingHint")}>
                        {t("competitors.platformListingBadge")}
                      </Badge>
                    ) : (
                      <Provenance kind="fact" label={t("competitors.identityProvenance")} />
                    )}
                  </div>
                </div>
              </div>
              {c.website && (
                <a
                  href={c.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-ink-muted hover:text-ink hover:underline"
                >
                  {domainOf(c.website)} <ExternalLink size={11} aria-hidden />
                  <span className="sr-only">{t("common.opensInNewTab")}</span>
                </a>
              )}
              {c.description ? (
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Provenance kind="analysis" label={t("competitors.descriptionProvenance")} />
                  </div>
                  <p className="text-[13px] leading-relaxed text-ink-muted">{c.description}</p>
                </div>
              ) : null}
            </div>
            {(c.strengths.length > 0 || c.weaknesses.length > 0) && (
              <div className="flex-1 px-5 py-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium text-ink-subtle">{t("competitors.assessment")}</span>
                  <Provenance kind="analysis" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <PlainList title={t("competitors.strengths")} items={c.strengths} />
                  <PlainList title={t("competitors.weaknesses")} items={c.weaknesses} />
                </div>
              </div>
            )}
            {c.sources.length > 0 && (
              <div className="border-t border-border px-5 py-2.5 text-[12px] text-ink-subtle">
                {t("competitors.basedOn", { count: c.sources.length })}{" "}
                {c.sources.slice(0, 3).map((s, j) => (
                  <React.Fragment key={s}>
                    {j > 0 && ", "}
                    <a href={s} target="_blank" rel="noopener noreferrer" className="hover:text-ink hover:underline">
                      {domainOf(s)}
                    </a>
                  </React.Fragment>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function PlainList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-1.5 text-[12.5px] font-medium text-ink">{title}</div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-[13px] leading-snug text-ink-muted">
            <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-subtle" />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------- Market research --------------------------- */

function MarketView({ market }: { market: MarketResearch }) {
  const t = useT();
  const groups: [string, string, MarketInsight[]][] = [
    ["trends", t("competitors.market.trends"), market.trends],
    ["painPoints", t("competitors.market.painPoints"), market.painPoints],
    ["demandSignals", t("competitors.market.demandSignals"), market.demandSignals],
    ["opportunities", t("competitors.market.opportunities"), market.opportunities],
  ];
  return (
    <div className="space-y-4">
      {market.summary && (
        <Card>
          <CardHeader title={t("competitors.market.summary")} actions={<Provenance kind="analysis" />} />
          <CardBody>
            <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">{market.summary}</p>
          </CardBody>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map(([id, title, items]) => (
          <Card key={id}>
            <CardHeader title={title} />
            {items.length === 0 ? (
              <CardBody className="text-[13px] text-ink-subtle">{t("competitors.market.nothingFound")}</CardBody>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((it, i) => (
                  <li key={i} className="px-5 py-3">
                    <p className="text-[13px] leading-relaxed text-ink">{it.insight}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      {it.sources.length > 0 ? (
                        <>
                          <Provenance kind="analysis" label={t("competitors.market.cited")} />
                          {it.sources.map((s, j) => (
                            <a
                              key={j}
                              href={s}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink hover:underline"
                            >
                              {domainOf(s)} <ExternalLink size={10} aria-hidden />
                            </a>
                          ))}
                        </>
                      ) : (
                        // Unsourced insights should be rare after agent filtering; never label as fact.
                        <Provenance kind="estimate" label={t("competitors.market.unsourced")} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ Strategy ------------------------------- */

function hasSwot(c: CompetitorAnalysis): boolean {
  const s = c.swot;
  return s.strengths.length + s.weaknesses.length + s.opportunities.length + s.threats.length > 0;
}

function StrategyView({ competitors }: { competitors: CompetitorAnalysis }) {
  const t = useT();
  const showSwot = hasSwot(competitors);
  const showWin = competitors.differentiation.length > 0 || competitors.opportunityGaps.length > 0;
  if (!showSwot && !showWin) return null;
  const quadrants: [string, string, string[], string][] = [
    ["strengths", t("competitors.strengths"), competitors.swot.strengths, "sm:border-b sm:border-r"],
    ["weaknesses", t("competitors.weaknesses"), competitors.swot.weaknesses, "sm:border-b"],
    ["opportunities", t("competitors.opportunities"), competitors.swot.opportunities, "sm:border-r"],
    ["threats", t("competitors.threats"), competitors.swot.threats, ""],
  ];
  return (
    <section aria-labelledby="strategy-heading" className="space-y-4">
      <SectionHeader
        id="strategy-heading"
        title={t("competitors.strategy.title")}
        description={t("competitors.strategy.description")}
        actions={<Provenance kind="recommendation" />}
      />
      {showSwot && (
        <Card className="overflow-hidden">
          <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
            {quadrants.map(([id, title, items, cls]) => (
              <div key={id} className={`border-border p-5 ${cls}`}>
                {items.length > 0 ? (
                  <PlainList title={title} items={items} />
                ) : (
                  <>
                    <div className="mb-1.5 text-[12.5px] font-medium text-ink">{title}</div>
                    <p className="text-[13px] text-ink-subtle">{t("competitors.strategy.noneIdentified")}</p>
                  </>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
      {showWin && (
        <div className="grid gap-4 lg:grid-cols-2">
          {competitors.differentiation.length > 0 && (
            <Card>
              <CardHeader title={t("competitors.strategy.differentiate")} actions={<Provenance kind="recommendation" />} />
              <ol className="divide-y divide-border">
                {competitors.differentiation.map((d, i) => (
                  <li key={i} className="flex gap-3 px-5 py-3 text-[13px] leading-relaxed text-ink">
                    <span className="w-4 shrink-0 tabular-nums text-ink-subtle">{i + 1}</span>
                    {d}
                  </li>
                ))}
              </ol>
            </Card>
          )}
          {competitors.opportunityGaps.length > 0 && (
            <Card>
              <CardHeader title={t("competitors.strategy.gaps")} actions={<Provenance kind="analysis" />} />
              <ul className="divide-y divide-border">
                {competitors.opportunityGaps.map((g, i) => (
                  <li key={i} className="px-5 py-3 text-[13px] leading-relaxed text-ink">
                    {g}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------ Shared --------------------------------- */

function ResearchUnavailable({ status, kind }: { status: ResearchStatus; kind: "competitors" | "market" }) {
  const t = useT();
  const configNeeded = status === "search-not-configured";
  const title = configNeeded
    ? t("competitors.unavailable.notConfiguredTitle")
    : status === "no-results"
      ? t("competitors.unavailable.noResultsTitle")
      : t("competitors.unavailable.failedTitle");
  const description = configNeeded
    ? kind === "competitors"
      ? t("competitors.unavailable.notConfiguredCompetitors")
      : t("competitors.unavailable.notConfiguredMarket")
    : status === "no-results"
      ? t("competitors.unavailable.noResults")
      : kind === "competitors"
        ? t("competitors.unavailable.failedCompetitors")
        : t("competitors.unavailable.failedMarket");
  return (
    <EmptyState
      compact
      icon={configNeeded ? Settings2 : SearchX}
      title={title}
      description={description}
      action={
        configNeeded ? (
          <ButtonLink href="/dashboard/settings#integrations" variant="secondary" size="sm">
            {t("competitors.unavailable.viewIntegrations")}
          </ButtonLink>
        ) : null
      }
    />
  );
}

function SourcesList({ sources }: { sources: SearchResult[] }) {
  const t = useT();
  return (
    <details className="card group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
        <div>
          <div className="text-sm font-semibold text-ink">{t("competitors.sources.title")}</div>
          <div className="mt-0.5 text-[12.5px] text-ink-subtle">{t("competitors.sources.count", { count: sources.length })}</div>
        </div>
        <ChevronDown size={16} className="shrink-0 text-ink-subtle transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="divide-y divide-border border-t border-border">
        {sources.map((s, i) => (
          <li key={i}>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="group/src block px-5 py-3 hover:bg-surface-2">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-[13px] font-medium text-ink group-hover/src:underline">{s.title}</span>
                <ExternalLink size={12} className="shrink-0 text-ink-subtle" aria-hidden />
                <span className="sr-only">{t("common.opensInNewTab")}</span>
              </div>
              <div className="text-[12px] text-ink-subtle">{domainOf(s.url)}</div>
              {s.snippet && <p className="mt-1 line-clamp-2 text-[12.5px] text-ink-muted">{s.snippet}</p>}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
