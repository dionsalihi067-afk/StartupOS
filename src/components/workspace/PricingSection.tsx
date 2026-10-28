"use client";

import * as React from "react";
import { Check } from "lucide-react";
import type { BusinessPackage, PricingGrounding } from "@/lib/types";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

export function PricingSection({ pkg }: { pkg: BusinessPackage }) {
  const t = useT();
  const pricing = pkg.pricing;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t("pricing.model")} description={pricing.model} />
        <CardBody>
          <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">{pricing.rationale}</p>
        </CardBody>
      </Card>

      <div className={cn("grid gap-4", pricing.tiers.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
        {pricing.tiers.map((tier) => (
          <div
            key={tier.name}
            className={cn(
              "flex flex-col rounded-[10px] border bg-surface p-6 shadow-[var(--shadow-card)]",
              tier.highlighted ? "border-ink ring-1 ring-ink" : "border-border",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">{tier.name}</h3>
              {tier.highlighted && <Badge tone="accent">{t("pricing.recommended")}</Badge>}
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-semibold tracking-tight text-ink">{tier.price}</span>
              {tier.cadence && <span className="text-sm text-ink-subtle">{tier.cadence}</span>}
            </div>
            <p className="mt-1.5 text-[13px] text-ink-muted">{tier.tagline}</p>
            <ul className="mt-5 flex-1 space-y-2 border-t border-border pt-5">
              {tier.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13px] text-ink-muted">
                  <Check size={15} className="mt-0.5 shrink-0 text-ink" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-5 rounded-md bg-surface-2 px-3 py-2 text-[12.5px] text-ink-muted">
              {t("pricing.suggestedCta")} <span className="font-medium text-ink">{tier.cta}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {pricing.psychology.length > 0 && (
          <Card>
            <CardHeader title={t("pricing.tactics.title")} description={t("pricing.tactics.description")} />
            <ol className="divide-y divide-border">
              {pricing.psychology.map((p, i) => (
                <li key={i} className="flex gap-3 px-5 py-3 text-[13px] leading-relaxed text-ink">
                  <span className="w-4 shrink-0 tabular-nums text-ink-subtle">{i + 1}</span>
                  {p}
                </li>
              ))}
            </ol>
          </Card>
        )}
        {pricing.upsells.length > 0 && (
          <Card>
            <CardHeader title={t("pricing.upsells.title")} description={t("pricing.upsells.description")} />
            <ul className="divide-y divide-border">
              {pricing.upsells.map((u, i) => (
                <li key={i} className="px-5 py-3 text-[13px] leading-relaxed text-ink">
                  {u}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {pricing.grounding && <PricingGroundingCard grounding={pricing.grounding} />}

      <p className="text-[12.5px] text-ink-subtle">{t("pricing.disclaimer")}</p>
    </div>
  );
}

function PricingGroundingCard({ grounding }: { grounding: PricingGrounding }) {
  const t = useT();
  const lists = [
    { key: "signals", title: t("pricing.grounding.signals"), items: grounding.signals },
    { key: "limitations", title: t("pricing.grounding.limitations"), items: grounding.limitations },
  ].filter((l) => l.items.length > 0);
  return (
    <Card>
      <CardHeader title={t("pricing.grounding.title")} description={t(`pricing.grounding.status.${grounding.evidence}`)} />
      <CardBody className="space-y-4">
        {grounding.observations.length > 0 && (
          <div>
            <div className="text-[12.5px] font-medium text-ink">{t("pricing.grounding.observed")}</div>
            <ul className="mt-1.5 space-y-1">
              {grounding.observations.map((o, i) => (
                <li key={i} className="text-[13px] text-ink-muted">
                  <span className="font-medium text-ink">{o.price}</span> · {o.competitor} <span className="text-ink-subtle">({o.domain})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {lists.map((l) => (
          <div key={l.key}>
            <div className="text-[12.5px] font-medium text-ink">{l.title}</div>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              {l.items.map((item, i) => (
                <li key={i} className="text-[13px] leading-relaxed text-ink-muted">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
