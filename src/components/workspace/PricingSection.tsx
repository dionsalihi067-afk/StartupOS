"use client";

import * as React from "react";
import { Check, Sparkles } from "lucide-react";
import type { PricingStrategy } from "@/lib/types";
import { Card, CardBody, SectionTitle, Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export function PricingSection({ pricing }: { pricing: PricingStrategy }) {
  return (
    <div className="space-y-9">
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="brand">Pricing Agent</Badge>
            <span className="text-sm font-semibold">{pricing.model}</span>
          </div>
          <p className="mt-3 leading-relaxed text-ink-muted">{pricing.rationale}</p>
          {pricing.revenueModel && (
            <div className="mt-4 rounded-xl border border-border bg-bg-elevated p-4">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-brand-2">Revenue model</div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{pricing.revenueModel}</p>
            </div>
          )}
        </CardBody>
      </Card>

      <section>
        <SectionTitle title="Pricing tiers" description="Ready to drop into your website and checkout." />
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {pricing.tiers.map((tier) => (
            <div
              key={tier.name}
              className={cn(
                "relative flex flex-col rounded-2xl border p-6 transition",
                tier.highlighted ? "border-brand bg-brand-soft/40 shadow-glow" : "border-border bg-surface",
              )}
            >
              {tier.highlighted && (
                <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-brand px-3 py-1 text-[11px] font-semibold text-white">
                  <Sparkles size={12} /> Most popular
                </span>
              )}
              <div className="text-sm font-semibold text-ink-muted">{tier.name}</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight">{tier.price}</span>
                {tier.cadence && <span className="text-sm text-ink-subtle">{tier.cadence}</span>}
              </div>
              <p className="mt-1.5 text-[13px] text-ink-muted">{tier.tagline}</p>
              <ul className="mt-5 flex-1 space-y-2.5">
                {tier.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <Check size={16} className={cn("mt-0.5 shrink-0", tier.highlighted ? "text-brand-2" : "text-success")} />
                    <span className="text-ink-muted">{f}</span>
                  </li>
                ))}
              </ul>
              <button
                className={cn(
                  "mt-6 h-11 rounded-xl text-sm font-semibold transition",
                  tier.highlighted ? "bg-brand text-white hover:bg-brand-2" : "border border-border-strong text-ink hover:border-brand",
                )}
              >
                {tier.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardBody>
            <SectionTitle title="Pricing psychology" />
            <ul className="mt-4 space-y-2.5">
              {pricing.psychology.map((p, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-ink-muted">
                  <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] text-accent">{i + 1}</span>
                  {p}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <SectionTitle title="Upsell & revenue levers" />
            <div className="mt-4 flex flex-wrap gap-2">
              {pricing.upsells.map((u, i) => (
                <Badge key={i} tone="brand">{u}</Badge>
              ))}
            </div>
          </CardBody>
        </Card>
      </section>

      {pricing.subscriptionOptions.length > 0 && (
        <section>
          <SectionTitle title="Subscription & billing options" description="Recurring options to smooth cash flow and lift retention." />
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pricing.subscriptionOptions.map((o, i) => (
              <Card key={i}>
                <CardBody>
                  <div className="text-sm font-semibold">{o.name}</div>
                  <div className="mt-1.5 flex items-baseline gap-1">
                    <span className="text-2xl font-bold tracking-tight">{o.price}</span>
                    {o.cadence && <span className="text-[13px] text-ink-subtle">{o.cadence}</span>}
                  </div>
                  <p className="mt-1.5 text-[13px] text-ink-muted">{o.note}</p>
                </CardBody>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle title="Profit projection" description="A transparent model from your budget and pricing — an estimate, not a guarantee." />
        <Card className="mt-5">
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <ProjectionStat label="Monthly customers" value={String(pricing.profitEstimation.monthlyCustomers)} />
              <ProjectionStat label="Avg. revenue / customer" value={pricing.profitEstimation.avgRevenuePerCustomer} />
              <ProjectionStat label="Est. monthly revenue" value={pricing.profitEstimation.estimatedMonthlyRevenue} />
              <ProjectionStat label="Est. monthly costs" value={pricing.profitEstimation.estimatedMonthlyCosts} />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-success/30 bg-success/5 p-4">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">Est. monthly profit</div>
                <div className="mt-1 text-2xl font-bold text-success">{pricing.profitEstimation.estimatedMonthlyProfit}</div>
              </div>
              <div className="rounded-xl border border-border bg-bg-elevated p-4">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">Estimated margin</div>
                <div className="mt-1 text-2xl font-bold text-accent">{pricing.profitEstimation.margin}</div>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">Assumptions</div>
              <ul className="mt-2 space-y-1.5">
                {pricing.profitEstimation.assumptions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-ink-muted">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-subtle" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          </CardBody>
        </Card>
      </section>
    </div>
  );
}

function ProjectionStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-bg-elevated p-4">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">{label}</div>
      <div className="mt-1 text-xl font-bold tracking-tight">{value}</div>
    </div>
  );
}
