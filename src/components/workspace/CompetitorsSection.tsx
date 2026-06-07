"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ExternalLink, Globe, Lightbulb, Search, Target, TrendingUp, User, AlertTriangle, Frown } from "lucide-react";
import type { CompetitorAnalysis, CustomerPersona, MarketInsight, MarketResearch, ResearchStatus } from "@/lib/types";
import { Card, CardBody, SectionTitle, Badge, Button } from "@/components/ui/primitives";

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function CompetitorsSection({
  competitors,
  persona,
  market,
}: {
  competitors: CompetitorAnalysis;
  persona: CustomerPersona;
  market?: MarketResearch;
}) {
  return (
    <div className="space-y-9">
      {/* Persona (recommended target) */}
      <section>
        <SectionTitle eyebrow="Persona Agent" title="Recommended target persona" description="A synthesized profile of your ideal customer to guide messaging." />
        <Card className="mt-5 overflow-hidden">
          <div className="grid lg:grid-cols-[280px_1fr]">
            <div className="bg-radial-brand p-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-white">
                {persona.name.charAt(0)}
              </div>
              <h3 className="mt-4 text-xl font-bold">{persona.name}</h3>
              <Badge tone="brand" className="mt-2">{persona.archetype}</Badge>
              <dl className="mt-4 space-y-1.5 text-[13px]">
                <div className="flex justify-between"><dt className="text-ink-subtle">Age</dt><dd>{persona.age}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-subtle">Occupation</dt><dd className="text-right">{persona.occupation}</dd></div>
              </dl>
              <blockquote className="mt-4 border-l-2 border-brand pl-3 text-[13px] italic text-ink-muted">{persona.quote}</blockquote>
            </div>
            <CardBody className="grid gap-6 sm:grid-cols-2">
              <PersonaList icon={<Target size={14} />} title="Goals" items={persona.goals} tone="accent" />
              <PersonaList icon={<User size={14} />} title="Pain points" items={persona.painPoints} tone="warning" />
              <PersonaList title="Preferred channels" items={persona.channels} tone="brand" />
              <PersonaList title="Objections" items={persona.objections} tone="neutral" />
            </CardBody>
          </div>
        </Card>
      </section>

      {/* Market research (real data) */}
      {market && (
        <section>
          <SectionTitle
            eyebrow="Market Research Agent"
            title="Live market research"
            description={market.available && market.provider ? `Real findings retrieved via ${market.provider} web search — every insight is cited.` : "Real-time market intelligence from live web search."}
          />
          <div className="mt-5">
            {market.available ? <MarketResearchView market={market} /> : <ResearchUnavailable status={market.status} kind="market research" />}
          </div>
        </section>
      )}

      {/* Competitors (real data) */}
      <section>
        <SectionTitle
          eyebrow="Competitor Agent"
          title="Real competitor landscape"
          description={competitors.available && competitors.provider ? `Discovered via ${competitors.provider} web search.` : "Actual competitors discovered through live web search."}
        />
        <div className="mt-5">
          {competitors.available ? (
            <CompetitorView competitors={competitors} />
          ) : (
            <ResearchUnavailable status={competitors.status} kind="competitor analysis" />
          )}
        </div>
      </section>
    </div>
  );
}

/* --------------------------- Market research --------------------------- */

function MarketResearchView({ market }: { market: MarketResearch }) {
  return (
    <div className="space-y-5">
      {market.summary && (
        <Card>
          <CardBody>
            <div className="text-[12px] font-semibold uppercase tracking-wide text-brand-2">Overview</div>
            <p className="mt-2 text-[15px] leading-relaxed">{market.summary}</p>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InsightColumn title="Trends" icon={<TrendingUp size={15} />} items={market.trends} />
        <InsightColumn title="Pain points" icon={<Frown size={15} />} items={market.painPoints} />
        <InsightColumn title="Demand signals" icon={<Target size={15} />} items={market.demandSignals} />
        <InsightColumn title="Opportunities" icon={<Lightbulb size={15} />} items={market.opportunities} />
      </div>

      {market.sources.length > 0 && <SourceList title="Sources" sources={market.sources} />}
    </div>
  );
}

function InsightColumn({ title, icon, items }: { title: string; icon: React.ReactNode; items: MarketInsight[] }) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2 text-sm font-semibold">{icon} {title}</div>
        {items.length === 0 ? (
          <p className="mt-3 text-[13px] text-ink-subtle">No grounded {title.toLowerCase()} found in the sources.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {items.map((it, i) => (
              <li key={i} className="text-[13px] leading-relaxed text-ink-muted">
                {it.insight}
                {it.sources.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    {it.sources.map((s, j) => (
                      <a key={j} href={s} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-brand-2 hover:underline">
                        <ExternalLink size={10} /> {domainOf(s)}
                      </a>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/* ----------------------------- Competitors ----------------------------- */

function CompetitorView({ competitors }: { competitors: CompetitorAnalysis }) {
  return (
    <div className="space-y-8">
      {competitors.marketOverview && (
        <Card>
          <CardBody>
            <div className="text-[12px] font-semibold uppercase tracking-wide text-brand-2">Market overview</div>
            <p className="mt-2 text-[15px] leading-relaxed">{competitors.marketOverview}</p>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {competitors.competitors.map((c, i) => (
          <Card key={i}>
            <CardBody>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="truncate font-semibold">{c.name}</h4>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <Badge tone={c.type === "direct" ? "danger" : c.type === "local" ? "accent" : "neutral"}>{c.type}</Badge>
                    {c.category && <Badge tone="brand">{c.category}</Badge>}
                    {c.website && (
                      <a href={c.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-brand-2 hover:underline">
                        <Globe size={12} /> {domainOf(c.website)}
                      </a>
                    )}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">{c.description}</p>
              {(c.strengths.length > 0 || c.weaknesses.length > 0) && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {c.strengths.length > 0 && <MiniList title="Strengths" items={c.strengths} up />}
                  {c.weaknesses.length > 0 && <MiniList title="Weaknesses" items={c.weaknesses} />}
                </div>
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      {hasSwot(competitors) && (
        <section>
          <SectionTitle title="SWOT — your strategic position" description="Forward-looking analysis for entering this market." />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <SwotCard title="Strengths" items={competitors.swot.strengths} tone="success" />
            <SwotCard title="Weaknesses" items={competitors.swot.weaknesses} tone="danger" />
            <SwotCard title="Opportunities" items={competitors.swot.opportunities} tone="accent" />
            <SwotCard title="Threats" items={competitors.swot.threats} tone="warning" />
          </div>
        </section>
      )}

      {(competitors.differentiation.length > 0 || competitors.opportunityGaps.length > 0) && (
        <section className="grid gap-4 lg:grid-cols-2">
          {competitors.differentiation.length > 0 && (
            <Card>
              <CardBody>
                <SectionTitle title="How to win" />
                <ul className="mt-4 space-y-2.5">
                  {competitors.differentiation.map((d, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] text-white">{i + 1}</span>
                      {d}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
          {competitors.opportunityGaps.length > 0 && (
            <Card>
              <CardBody>
                <SectionTitle title="Opportunity gaps" />
                <ul className="mt-4 space-y-2.5">
                  {competitors.opportunityGaps.map((g, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-ink-muted">
                      <Target size={15} className="mt-0.5 shrink-0 text-accent" />
                      {g}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </section>
      )}

      {competitors.sources.length > 0 && <SourceList title="Search sources" sources={competitors.sources} />}
    </div>
  );
}

function hasSwot(c: CompetitorAnalysis): boolean {
  const s = c.swot;
  return s.strengths.length + s.weaknesses.length + s.opportunities.length + s.threats.length > 0;
}

/* ------------------------------ Shared --------------------------------- */

function ResearchUnavailable({ status, kind }: { status: ResearchStatus; kind: string }) {
  const configNeeded = status === "search-not-configured";
  return (
    <Card>
      <CardBody className="flex flex-col items-center py-12 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-bg-elevated text-brand-2">
          {configNeeded ? <Search size={26} /> : <AlertTriangle size={26} />}
        </div>
        <h3 className="text-lg font-semibold">
          {configNeeded ? "Live web search not configured" : status === "no-results" ? "No real results found" : "Research unavailable"}
        </h3>
        <p className="mt-2 max-w-md text-sm text-ink-muted">
          {configNeeded ? (
            <>
              StartupOS never fabricates {kind}. To produce real {kind}, add a web search API key
              (<code className="rounded bg-surface-2 px-1.5 py-0.5 text-[12px] text-accent">TAVILY_API_KEY</code>,{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[12px] text-accent">SERPER_API_KEY</code> or{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[12px] text-accent">BRAVE_API_KEY</code>) to{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[12px] text-accent">.env.local</code> and regenerate.
            </>
          ) : status === "no-results" ? (
            <>The live search returned no usable results for this business. Try a more specific idea or location, then regenerate.</>
          ) : (
            <>The {kind} step could not complete. Your other assets are unaffected.</>
          )}
        </p>
        {configNeeded && (
          <Link href="/dashboard/settings" className="mt-5">
            <Button variant="secondary" size="sm">Configure search</Button>
          </Link>
        )}
      </CardBody>
    </Card>
  );
}

function SourceList({ title, sources }: { title: string; sources: { title: string; url: string; snippet: string }[] }) {
  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Globe size={15} className="text-brand-2" /> {title} ({sources.length})</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {sources.map((s, i) => (
            <a
              key={i}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-lg border border-border bg-bg-elevated p-3 transition hover:border-brand/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-medium group-hover:text-white">{s.title}</span>
                <ExternalLink size={13} className="shrink-0 text-ink-subtle" />
              </div>
              <div className="mt-0.5 truncate text-[11px] text-brand-2">{domainOf(s.url)}</div>
              {s.snippet && <p className="mt-1 line-clamp-2 text-[12px] text-ink-subtle">{s.snippet}</p>}
            </a>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function PersonaList({ title, items, icon, tone }: { title: string; items: string[]; icon?: React.ReactNode; tone: "accent" | "warning" | "brand" | "neutral" }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">
        {icon} {title}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <Badge key={i} tone={tone}>{it}</Badge>
        ))}
      </div>
    </div>
  );
}

function MiniList({ title, items, up }: { title: string; items: string[]; up?: boolean }) {
  return (
    <div>
      <div className={`mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide ${up ? "text-success" : "text-danger"}`}>
        {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />} {title}
      </div>
      <ul className="space-y-1 text-[12px] text-ink-muted">
        {items.map((it, i) => (
          <li key={i}>• {it}</li>
        ))}
      </ul>
    </div>
  );
}

function SwotCard({ title, items, tone }: { title: string; items: string[]; tone: "success" | "danger" | "accent" | "warning" }) {
  const ring: Record<string, string> = {
    success: "border-success/30",
    danger: "border-danger/30",
    accent: "border-accent/30",
    warning: "border-warning/30",
  };
  return (
    <div className={`card border ${ring[tone]} p-5`}>
      <Badge tone={tone}>{title}</Badge>
      <ul className="mt-3 space-y-2 text-sm text-ink-muted">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current opacity-50" />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
