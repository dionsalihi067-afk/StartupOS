"use client";

import * as React from "react";
import type { BusinessPackage, BusinessStrategy, FinancialPlan, StrategyPriority } from "@/lib/types";
import type { FactBasis } from "@/lib/engine/profile";
import { CUSTOMER_TYPES, REVENUE_MODELS, SALES_CHANNELS, STAGES } from "@/lib/discovery";
import { SCENARIOS } from "@/lib/finance/model";
import { Badge, Button, Card, CardBody, CardHeader, DataList, type BadgeTone } from "@/components/ui/primitives";
import { InlineNotice } from "@/components/dashboard/EmptyState";
import { useFormat, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";

const BASIS_TONE: Record<FactBasis, BadgeTone> = {
  provided: "success",
  inferred: "accent",
  assumed: "warning",
  unavailable: "outline",
};

const PRIORITY_TONE: Record<StrategyPriority["priority"], BadgeTone> = { high: "danger", medium: "warning", low: "neutral" };

/** Message key for a stored discovery option code, or null for free text the owner typed. */
const OPTION_LABEL: Partial<Record<string, (code: string) => string | null>> = {
  stage: (c) => ((STAGES as readonly string[]).includes(c) ? `discovery.options.stage.${c}.label` : null),
  customerType: (c) => ((CUSTOMER_TYPES as readonly string[]).includes(c) ? `discovery.options.customerType.${c}.label` : null),
  revenueModel: (c) => ((REVENUE_MODELS as readonly string[]).includes(c) ? `discovery.options.revenue.${c}` : null),
  salesChannels: (c) => ((SALES_CHANNELS as readonly string[]).includes(c) ? `discovery.options.channels.${c}` : null),
};

function factLabel(key: string, value: string, t: (key: MessageKey) => string): string {
  const label = OPTION_LABEL[key];
  if (!label) return value;
  return value
    .split(", ")
    .map((code) => {
      const k = label(code);
      return k ? t(k as MessageKey) : code;
    })
    .join(", ");
}

export function StrategySection({ pkg, onRegenerate }: { pkg: BusinessPackage; onRegenerate?: () => void }) {
  const t = useT();
  const strategy = pkg.strategy;
  if (!strategy) {
    return (
      <Card>
        <CardBody className="space-y-3 text-center">
          <p className="text-sm font-medium text-ink">{t("strategy.emptyTitle")}</p>
          <p className="mx-auto max-w-md text-[13px] text-ink-muted">{t("strategy.emptyDescription")}</p>
          {onRegenerate && (
            <Button type="button" size="sm" variant="secondary" onClick={onRegenerate}>
              {t("strategy.generate")}
            </Button>
          )}
        </CardBody>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {strategy.source === "template" && <InlineNotice tone="warning" title={t("strategy.templateNotice")} />}
      <Executive strategy={strategy} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Profile strategy={strategy} />
        <Considerations strategy={strategy} />
      </div>
      <Financials plan={strategy.financials} />
      <Roadmap priorities={strategy.executive.priorities} />
    </div>
  );
}

function Executive({ strategy }: { strategy: BusinessStrategy }) {
  const t = useT();
  const e = strategy.executive;
  const fields = [
    { label: t("strategy.executive.problem"), value: e.problem },
    { label: t("strategy.executive.solution"), value: e.solution },
    { label: t("strategy.executive.valueProposition"), value: e.valueProposition },
    { label: t("strategy.executive.businessModel"), value: e.businessModel },
    { label: t("strategy.executive.entryStrategy"), value: e.entryStrategy },
  ].filter((f) => f.value);
  const lists = [
    { key: "revenueStreams", title: t("strategy.executive.revenueStreams"), items: e.revenueStreams },
    { key: "segments", title: t("strategy.executive.segments"), items: e.segments.map((s) => (s.need ? `${s.name} — ${s.need}` : s.name)) },
    { key: "differentiation", title: t("strategy.executive.differentiation"), items: e.differentiation },
    { key: "assumptions", title: t("strategy.executive.assumptions"), items: e.assumptions },
    { key: "risks", title: t("strategy.executive.risks"), items: e.risks.map((r) => (r.mitigation ? `${r.risk} — ${r.mitigation}` : r.risk)) },
    { key: "missing", title: t("strategy.executive.missingInformation"), items: e.missingInformation.map((m) => t.optional(`strategy.facts.${m}`) ?? m) },
  ].filter((l) => l.items.length > 0);
  return (
    <Card>
      <CardHeader title={t("strategy.executive.title")} description={t("strategy.executive.description")} />
      <CardBody className="space-y-5">
        <p className="max-w-3xl text-sm leading-relaxed text-ink">{e.summary}</p>
        {fields.length > 0 && <DataList items={fields} />}
        {lists.length > 0 && (
          <div className="grid gap-5 md:grid-cols-2">
            {lists.map((l) => (
              <div key={l.key}>
                <h3 className="text-[12.5px] font-medium text-ink">{l.title}</h3>
                <ul className="mt-1.5 list-disc space-y-1 pl-5">
                  {l.items.map((item, i) => (
                    <li key={i} className="text-[13px] leading-relaxed text-ink-muted">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Profile({ strategy }: { strategy: BusinessStrategy }) {
  const t = useT();
  const p = strategy.profile;
  return (
    <Card>
      <CardHeader title={t("strategy.profile.title")} description={t("strategy.profile.description")} />
      <ul className="divide-y divide-border">
        {p.facts.map((f) => (
          <li key={f.key} className="flex items-start justify-between gap-3 px-5 py-2.5 text-[13px]">
            <div className="min-w-0">
              <div className="text-ink-subtle">{t(`strategy.facts.${f.key}` as MessageKey)}</div>
              <div className="break-words text-ink">
                {f.key === "modelKind" ? t(`strategy.models.${p.modelKind}` as MessageKey) : f.value ? factLabel(f.key, f.value, t) : "—"}
              </div>
            </div>
            <Badge tone={BASIS_TONE[f.basis]} className="shrink-0">
              {t(`strategy.basis.${f.basis}` as MessageKey)}
            </Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Considerations({ strategy }: { strategy: BusinessStrategy }) {
  const t = useT();
  const list = strategy.profile.considerations;
  return (
    <Card>
      <CardHeader title={t("strategy.considerations.title")} description={t("strategy.considerations.description")} />
      <CardBody>
        {list.length === 0 ? (
          <p className="text-[13px] text-ink-muted">{t("strategy.considerations.none")}</p>
        ) : (
          <ul className="list-disc space-y-1.5 pl-5">
            {list.map((c) => (
              <li key={c} className="text-[13px] leading-relaxed text-ink">
                {t(`strategy.considerations.items.${c}` as MessageKey)}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function useMoney(currency: string) {
  const format = useFormat();
  return React.useCallback(
    (value: number) => {
      try {
        return format.number(value, { style: "currency", currency, maximumFractionDigits: 0 });
      } catch {
        return `${format.number(value, { maximumFractionDigits: 0 })} ${currency}`;
      }
    },
    [format, currency],
  );
}

function Financials({ plan }: { plan: FinancialPlan }) {
  const t = useT();
  const format = useFormat();
  const money = useMoney(plan.currency);
  const limitations = plan.limitations.map((l) => t.optional(`strategy.finance.limitations.${l}`) ?? l);

  if (plan.status === "insufficient" || !plan.assumptions || !plan.results) {
    return (
      <Card>
        <CardHeader title={t("strategy.finance.title")} />
        <CardBody>
          <InlineNotice tone="neutral" title={t("strategy.finance.insufficientTitle")}>
            {limitations.join(" ")}
          </InlineNotice>
        </CardBody>
      </Card>
    );
  }

  const { assumptions: a, results: r } = plan;
  const be = r.breakEven;
  const rows: { key: string; label: string; value: (s: (typeof r.scenarios)[number]) => string }[] = [
    { key: "revenue", label: t("strategy.finance.rows.revenue"), value: (s) => money(s.monthlyRevenue) },
    { key: "variable", label: t("strategy.finance.rows.variableCosts"), value: (s) => money(s.monthlyVariableCosts) },
    { key: "gross", label: t("strategy.finance.rows.grossProfit"), value: (s) => money(s.monthlyGrossProfit) },
    { key: "margin", label: t("strategy.finance.rows.grossMargin"), value: (s) => (s.grossMarginPct === null ? "—" : format.percent(s.grossMarginPct)) },
    { key: "fixed", label: t("strategy.finance.rows.fixedCosts"), value: (s) => money(s.monthlyFixedCosts) },
    { key: "operating", label: t("strategy.finance.rows.operatingProfit"), value: (s) => money(s.monthlyOperatingProfit) },
    {
      key: "payback",
      label: t("strategy.finance.rows.payback"),
      value: (s) => (s.paybackMonths === null ? t("strategy.finance.notReached") : t("strategy.finance.months", { count: Math.ceil(s.paybackMonths) })),
    },
  ];

  return (
    <Card>
      <CardHeader title={t("strategy.finance.title")} description={t("strategy.finance.description")} />
      <CardBody className="space-y-6">
        <InlineNotice tone="warning" title={t("strategy.finance.estimateTitle")}>
          {limitations.join(" ")}
        </InlineNotice>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label={t("strategy.finance.startupCosts")} value={money(r.totalStartupCosts)} />
          <Stat label={t("strategy.finance.monthlyFixedCosts")} value={money(r.totalMonthlyFixedCosts)} />
          <Stat
            label={t("strategy.finance.breakEven")}
            value={be.unitsPerMonth === null ? "—" : t("strategy.finance.breakEvenUnits", { units: be.unitsPerMonth, unit: be.unit })}
            hint={
              be.unitsPerMonth === null
                ? t("strategy.finance.noBreakEven")
                : be.monthlyRevenue !== null
                  ? t("strategy.finance.breakEvenRevenue", { revenue: money(be.monthlyRevenue) })
                  : undefined
            }
          />
        </div>

        <BudgetCheck plan={plan} money={money} />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-[13px]">
            <caption className="mb-2 text-left text-[12.5px] font-medium text-ink">{t("strategy.finance.scenariosTitle")}</caption>
            <thead>
              <tr className="border-b border-border text-left text-ink-subtle">
                <th scope="col" className="py-2 pr-3 font-medium">
                  <span className="sr-only">{t("strategy.finance.metric")}</span>
                </th>
                {SCENARIOS.map((s) => (
                  <th key={s} scope="col" className="py-2 pr-3 text-right font-medium">
                    {t(`strategy.finance.scenarios.${s}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row" className="py-2 pr-3 text-left font-normal text-ink-muted">
                    {row.label}
                  </th>
                  {r.scenarios.map((s) => (
                    <td key={s.scenario} className="py-2 pr-3 text-right tabular-nums text-ink">
                      {row.value(s)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <details className="rounded-md border border-border">
          <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">{t("strategy.finance.assumptionsTitle")}</summary>
          <div className="grid gap-5 border-t border-border p-4 md:grid-cols-2">
            <CostList title={t("strategy.finance.startupCosts")} items={a.startupCosts} money={money} />
            <CostList title={t("strategy.finance.monthlyFixedCosts")} items={a.monthlyFixedCosts} money={money} />
            <div className="md:col-span-2">
              <h3 className="text-[12.5px] font-medium text-ink">{t("strategy.finance.revenueStreams")}</h3>
              <ul className="mt-1.5 space-y-1">
                {a.revenueStreams.map((s, i) => (
                  <li key={i} className="text-[13px] text-ink-muted">
                    {t("strategy.finance.streamLine", {
                      name: s.name,
                      price: money(s.price),
                      unit: s.unit,
                      cost: money(s.variableCost),
                      conservative: s.monthlyUnits.conservative,
                      base: s.monthlyUnits.base,
                      optimistic: s.monthlyUnits.optimistic,
                    })}
                  </li>
                ))}
              </ul>
            </div>
            {a.notes.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 md:col-span-2">
                {a.notes.map((n, i) => (
                  <li key={i} className="text-[13px] text-ink-muted">
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </CardBody>
    </Card>
  );
}

function BudgetCheck({ plan, money }: { plan: FinancialPlan; money: (n: number) => string }) {
  const t = useT();
  const b = plan.results!.budget;
  if (b.status === "unknown") return <p className="text-[13px] text-ink-muted">{t("strategy.finance.budget.unknown")}</p>;
  if (b.status === "over") {
    const essential = b.essentialStartupCosts;
    const deferrable = essential !== undefined && essential < b.startupCosts;
    return (
      <InlineNotice tone="danger" title={t("strategy.finance.budget.overTitle")}>
        {t("strategy.finance.budget.overDetail", { budget: money(b.budget!), startup: money(b.startupCosts), shortfall: money(b.shortfall ?? b.startupCosts - b.budget!) })}{" "}
        {deferrable && essential <= b.budget!
          ? t("strategy.finance.budget.deferOptional", { essential: money(essential) })
          : deferrable
            ? t("strategy.finance.budget.essentialOver", { essential: money(essential) })
            : t("strategy.finance.budget.reduceScope")}
      </InlineNotice>
    );
  }
  return (
    <InlineNotice tone="neutral" title={t("strategy.finance.budget.withinTitle")}>
      {t("strategy.finance.budget.detail", { budget: money(b.budget!), startup: money(b.startupCosts), remaining: money(b.remainingAfterStartup!) })}
      {b.runwayMonths !== null && ` ${t("strategy.finance.budget.runway", { count: Math.floor(b.runwayMonths) })}`}
    </InlineNotice>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-border px-4 py-3">
      <div className="text-[12px] text-ink-subtle">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-[12px] text-ink-subtle">{hint}</div>}
    </div>
  );
}

function CostList({ title, items, money }: { title: string; items: { item: string; amount: number; essential?: boolean }[]; money: (n: number) => string }) {
  const t = useT();
  return (
    <div>
      <h3 className="text-[12.5px] font-medium text-ink">{title}</h3>
      <ul className="mt-1.5 divide-y divide-border">
        {items.map((c, i) => (
          <li key={i} className="flex justify-between gap-3 py-1.5 text-[13px]">
            <span className="text-ink-muted">
              {c.item}
              {c.essential === false && <span className="ml-1.5 text-[11.5px] text-ink-subtle">({t("strategy.finance.optionalCost")})</span>}
            </span>
            <span className="tabular-nums text-ink">{money(c.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Roadmap({ priorities }: { priorities: StrategyPriority[] }) {
  const t = useT();
  const windows = ["0-30", "31-60", "61-90"] as const;
  return (
    <Card>
      <CardHeader title={t("strategy.roadmap.title")} description={t("strategy.roadmap.description")} />
      {priorities.length === 0 ? (
        <CardBody className="text-[13px] text-ink-muted">{t("strategy.roadmap.empty")}</CardBody>
      ) : (
        <div className="divide-y divide-border">
          {windows.map((w) => {
            const items = priorities.filter((p) => p.window === w);
            if (items.length === 0) return null;
            return (
              <section key={w} className="px-5 py-4">
                <h3 className="text-[12.5px] font-medium uppercase tracking-wide text-ink-subtle">{t("growth.days", { range: w })}</h3>
                <ul className="mt-2 space-y-3">
                  {items.map((p, i) => (
                    <li key={i} className="rounded-md border border-border px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-ink">{p.action}</span>
                        <Badge tone={PRIORITY_TONE[p.priority]}>{t(`strategy.roadmap.priority.${p.priority}`)}</Badge>
                      </div>
                      <DataList
                        className="mt-2"
                        items={[
                          { label: t("strategy.roadmap.outcome"), value: p.outcome },
                          { label: t("strategy.roadmap.metric"), value: p.metric },
                          { label: t("strategy.roadmap.resources"), value: p.resources },
                          { label: t("strategy.roadmap.dependsOn"), value: p.dependsOn },
                          { label: t("strategy.roadmap.assumption"), value: p.assumption },
                        ].filter((f) => f.value)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Card>
  );
}
