"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Pencil } from "lucide-react";
import type { ZodIssue } from "zod";
import {
  ADAPTIVE_QUESTIONS,
  BUSINESS_TYPES,
  CATEGORIES,
  CONTENT_LANGUAGES,
  CUSTOMER_TYPES,
  DISCOVERY_SECTION_SCHEMAS,
  DISCOVERY_SECTIONS,
  OFFER_STATUSES,
  PRIORITIES,
  REVENUE_MODELS,
  SALES_CHANNELS,
  STAGES,
  TIMEFRAMES,
  TONES,
  discoverySchema,
  FLEXIBLE_BUDGET,
  toBusinessInput,
  type Discovery,
  type DiscoverySectionKey,
} from "@/lib/discovery";
import { BUSINESS_STYLES } from "@/lib/styles";
import type { BusinessInput, BusinessStyle } from "@/lib/types";
import { getDefaultStyle } from "@/lib/client/preferences";
import { buildBusinessProfile, contextReadiness, type ProfileFactKey } from "@/lib/engine/profile";
import { Button, Card, CardBody } from "@/components/ui/primitives";
import { Field, Input, Textarea } from "@/components/ui/form";
import { InlineNotice } from "@/components/dashboard/EmptyState";
import { ChoiceCards, ChoiceField, Chips, StepIndicator, type ChoiceOption } from "@/components/discovery/controls";
import { useLocale, useT } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { STYLE_KEYS } from "@/i18n/labels";
import type { MessageKey } from "@/i18n/messages";
import type { TranslationValues } from "@/i18n/translator";

const CONTEXT_GAP_KEYS: Partial<Record<ProfileFactKey, MessageKey>> = {
  customers: "discovery.review.contextGaps.customers",
  market: "discovery.review.contextGaps.market",
  industry: "discovery.review.contextGaps.industry",
};

type StepKey = DiscoverySectionKey | "review";
const STEPS: readonly StepKey[] = [...DISCOVERY_SECTIONS, "review"];
const REVIEW_INDEX = STEPS.length - 1;

/** Answers while they are being typed: choices may still be unset. */
type Draft = { [K in DiscoverySectionKey]: Partial<Discovery[K]> };
type FieldError = { key: MessageKey; values?: TranslationValues };
type Errors = Partial<Record<string, FieldError>>;

export type DiscoveryWizardMode = "create" | "edit";

function emptyDraft(locale: Locale): Draft {
  return {
    business: { name: "", idea: "", offering: "", location: "" },
    customer: { ideal: "", problem: "", need: "", geography: "" },
    offer: { main: "", others: "", priceRange: "", priceUnknown: false, differentiator: "", details: {} },
    model: { revenue: [], budget: "", budgetUnknown: false, channels: [], currentRevenue: "", currentCustomers: "" },
    market: { competitors: "", alternatives: "", positioning: "", difference: "", challenges: "" },
    brand: { references: "", colors: "", avoidColors: "", notes: "", language: locale },
    goals: { goal: "", outcome: "" },
  };
}

/** Seeds the wizard from a saved BusinessInput (full discovery, or legacy core fields only). */
function draftFromInput(input: BusinessInput, locale: Locale): Draft {
  if (input.discovery) {
    return {
      business: { ...input.discovery.business },
      customer: { ...input.discovery.customer },
      offer: { ...input.discovery.offer, details: { ...input.discovery.offer.details } },
      model: { ...input.discovery.model, revenue: [...input.discovery.model.revenue], channels: [...input.discovery.model.channels] },
      market: { ...input.discovery.market },
      brand: { ...input.discovery.brand },
      goals: { ...input.discovery.goals },
    };
  }
  const base = emptyDraft(locale);
  const budgetUnknown = !input.budget || input.budget === FLEXIBLE_BUDGET;
  return {
    ...base,
    business: { ...base.business, idea: input.idea, location: input.location },
    customer: { ...base.customer, ideal: input.audience },
    model: { ...base.model, budget: budgetUnknown ? "" : input.budget, budgetUnknown },
    brand: { ...base.brand, style: input.style, language: locale },
  };
}

interface Saved {
  draft: Draft;
  step: number;
  furthest: number;
  returnToReview: boolean;
}

/** Create-mode draft only — kept outside so answers survive a language remount until generation succeeds. */
let saved: Saved | null = null;

export function resetDiscoveryDraft() {
  saved = null;
}

const isOperating = (d: Draft) => d.business.stage === "operating" || d.business.stage === "growing";

/** Removes answers that do not apply to the chosen stage before validation and submission. */
function normalize(d: Draft): Draft {
  if (isOperating(d)) return d;
  return { ...d, model: { ...d.model, currentRevenue: "", currentCustomers: "" } };
}

function issueToError(issue: ZodIssue, value: unknown): FieldError {
  const empty = value === undefined || value === null || (typeof value === "string" && value.trim() === "");
  if (Array.isArray(value) && value.length === 0) return { key: "discovery.errors.chooseOne" };
  if (empty) return { key: typeof value === "string" ? "discovery.errors.required" : "discovery.errors.choose" };
  if (issue.code === "too_small") return { key: "discovery.errors.tooShort", values: { min: Number(issue.minimum) } };
  if (issue.code === "too_big") return { key: "discovery.errors.tooLong", values: { max: Number(issue.maximum) } };
  return { key: "discovery.errors.choose" };
}

function validateSection(section: DiscoverySectionKey, draft: Draft): Errors {
  const result = DISCOVERY_SECTION_SCHEMAS[section].safeParse(draft[section]);
  if (result.success) return {};
  const errors: Errors = {};
  const values = draft[section] as Record<string, unknown>;
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? "");
    if (!field || errors[field]) continue;
    errors[field] = issueToError(issue, values[field]);
  }
  return errors;
}

export function DiscoveryWizard({
  mode = "create",
  initialInput,
  onSubmit,
  onCancel,
  saving = false,
  aside,
}: {
  mode?: DiscoveryWizardMode;
  /** Saved context used to populate edit mode. Ignored in create mode. */
  initialInput?: BusinessInput;
  onSubmit: (input: BusinessInput) => void;
  onCancel?: () => void;
  saving?: boolean;
  /** Extra content for the review step (e.g. which generation features are available). */
  aside?: React.ReactNode;
}) {
  const t = useT();
  const locale = useLocale();
  const isEdit = mode === "edit";

  const [draft, setDraft] = React.useState<Draft>(() => {
    if (isEdit && initialInput) return draftFromInput(initialInput, locale);
    return saved?.draft ?? emptyDraft(locale);
  });
  const [step, setStep] = React.useState(() => {
    if (isEdit && initialInput?.discovery) return REVIEW_INDEX;
    return isEdit ? 0 : (saved?.step ?? 0);
  });
  const [furthest, setFurthest] = React.useState(() => {
    if (isEdit && initialInput?.discovery) return REVIEW_INDEX;
    return isEdit ? 0 : (saved?.furthest ?? 0);
  });
  const [returnToReview, setReturnToReview] = React.useState(() => (isEdit ? false : (saved?.returnToReview ?? false)));
  const [errors, setErrors] = React.useState<Errors>({});
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const shownStep = React.useRef(step);

  React.useEffect(() => {
    if (isEdit) return;
    if (saved?.draft.brand.style) return;
    const preferred = getDefaultStyle();
    if (preferred) setDraft((d) => (d.brand.style ? d : { ...d, brand: { ...d.brand, style: preferred } }));
  }, [isEdit]);

  React.useEffect(() => {
    if (isEdit) return;
    saved = { draft, step, furthest, returnToReview };
  }, [isEdit, draft, step, furthest, returnToReview]);

  React.useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    headingRef.current?.focus();
  }, [step]);

  const current = STEPS[step] ?? "review";

  function set<S extends DiscoverySectionKey, F extends keyof Discovery[S]>(section: S, field: F, value: Discovery[S][F]) {
    setDraft((d) => ({ ...d, [section]: { ...d[section], [field]: value } }));
    const key = String(field);
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function goTo(index: number) {
    setErrors({});
    setStep(index);
  }

  function focusFirstError(next: Errors) {
    const first = Object.keys(next)[0];
    if (first) requestAnimationFrame(() => document.getElementById(`d-${current}-${first}`)?.focus());
  }

  function next() {
    if (current === "review") return;
    const found = validateSection(current, normalize(draft));
    if (Object.keys(found).length > 0) {
      setErrors(found);
      focusFirstError(found);
      return;
    }
    const target = returnToReview ? REVIEW_INDEX : step + 1;
    setFurthest((f) => Math.max(f, target));
    if (target === REVIEW_INDEX) setReturnToReview(false);
    goTo(target);
  }

  function back() {
    if (step > 0) goTo(step - 1);
  }

  function edit(section: DiscoverySectionKey) {
    setReturnToReview(true);
    goTo(DISCOVERY_SECTIONS.indexOf(section));
  }

  function submit() {
    const normalized = normalize(draft);
    for (const [i, section] of DISCOVERY_SECTIONS.entries()) {
      const found = validateSection(section, normalized);
      if (Object.keys(found).length > 0) {
        setReturnToReview(true);
        setStep(i);
        setErrors(found);
        return;
      }
    }
    const parsed = discoverySchema.safeParse(normalized);
    if (!parsed.success) return;
    onSubmit(toBusinessInput(parsed.data));
  }

  const err = (field: string) => {
    const e = errors[field];
    return e ? t(e.key, e.values) : undefined;
  };
  const id = (field: string) => `d-${current}-${field}`;

  const stepTitle = (key: StepKey) => t(`discovery.steps.${key}.title`);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (current === "review") submit();
        else next();
      }}
      className="mx-auto max-w-3xl space-y-5"
    >
      <StepIndicator
        label={t("discovery.nav.stepsLabel")}
        steps={STEPS.map((key) => ({ key, label: stepTitle(key) }))}
        current={step}
        furthest={furthest}
        onSelect={(i) => goTo(i)}
      />

      <Card>
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <p className="text-[12px] tabular-nums text-ink-subtle">
            {t("discovery.nav.stepOf", { current: step + 1, total: STEPS.length })}
          </p>
          <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-[17px] font-semibold tracking-tight text-ink outline-none">
            {isEdit && current === "review" ? t("discovery.edit.reviewTitle") : stepTitle(current)}
          </h2>
          <p className="mt-1 text-[13px] text-ink-muted">
            {isEdit
              ? current === "review"
                ? t("discovery.edit.reviewDescription")
                : t("discovery.edit.stepDescription")
              : t(`discovery.steps.${current}.description`)}
          </p>
        </div>

        <CardBody className="space-y-6 sm:px-6">
          {current === "business" && (
            <>
              <Field id={id("idea")} label={t("discovery.business.idea.label")} hint={t("discovery.business.idea.hint")} error={err("idea")}>
                <Textarea
                  id={id("idea")}
                  rows={3}
                  value={draft.business.idea ?? ""}
                  onChange={(e) => set("business", "idea", e.target.value)}
                  placeholder={t("discovery.business.idea.placeholder")}
                  invalid={!!errors.idea}
                  hasHint
                  maxLength={600}
                />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id={id("name")} label={t("discovery.business.name.label")} hint={t("discovery.business.name.hint")} error={err("name")} optional>
                  <Input
                    id={id("name")}
                    value={draft.business.name ?? ""}
                    onChange={(e) => set("business", "name", e.target.value)}
                    placeholder={t("discovery.business.name.placeholder")}
                    invalid={!!errors.name}
                    hasHint
                    maxLength={80}
                  />
                </Field>
                <Field id={id("location")} label={t("discovery.business.location.label")} error={err("location")}>
                  <Input
                    id={id("location")}
                    value={draft.business.location ?? ""}
                    onChange={(e) => set("business", "location", e.target.value)}
                    placeholder={t("discovery.business.location.placeholder")}
                    autoComplete="address-level2"
                    invalid={!!errors.location}
                    maxLength={160}
                  />
                </Field>
              </div>
              <Field id={id("offering")} label={t("discovery.business.offering.label")} error={err("offering")} optional>
                <Input
                  id={id("offering")}
                  value={draft.business.offering ?? ""}
                  onChange={(e) => set("business", "offering", e.target.value)}
                  placeholder={t("discovery.business.offering.placeholder")}
                  invalid={!!errors.offering}
                  maxLength={300}
                />
              </Field>
              <ChoiceField id={id("stage")} label={t("discovery.business.stage.label")} error={err("stage")}>
                <ChoiceCards
                  name="stage"
                  columns={4}
                  value={draft.business.stage}
                  onChange={(v) => set("business", "stage", v)}
                  options={STAGES.map((v) => ({
                    value: v,
                    label: t(`discovery.options.stage.${v}.label`),
                    hint: t(`discovery.options.stage.${v}.hint`),
                  }))}
                />
              </ChoiceField>
              <ChoiceField id={id("type")} label={t("discovery.business.type.label")} error={err("type")}>
                <ChoiceCards
                  name="type"
                  columns={3}
                  value={draft.business.type}
                  onChange={(v) => set("business", "type", v)}
                  options={BUSINESS_TYPES.map((v) => ({
                    value: v,
                    label: t(`discovery.options.type.${v}.label`),
                    hint: t(`discovery.options.type.${v}.hint`),
                  }))}
                />
              </ChoiceField>
              <ChoiceField
                id={id("category")}
                label={t("discovery.business.category.label")}
                hint={t("discovery.business.category.hint")}
                error={err("category")}
              >
                <Chips
                  name="category"
                  selected={draft.business.category ? [draft.business.category] : []}
                  onToggle={(v) => set("business", "category", v)}
                  options={CATEGORIES.map((v) => ({ value: v, label: t(`discovery.options.category.${v}`) }))}
                />
              </ChoiceField>
            </>
          )}

          {current === "customer" && (
            <>
              <Field id={id("ideal")} label={t("discovery.customer.ideal.label")} error={err("ideal")}>
                <Input
                  id={id("ideal")}
                  value={draft.customer.ideal ?? ""}
                  onChange={(e) => set("customer", "ideal", e.target.value)}
                  placeholder={t("discovery.customer.ideal.placeholder")}
                  invalid={!!errors.ideal}
                  maxLength={300}
                />
              </Field>
              <ChoiceField id={id("type")} label={t("discovery.customer.type.label")} error={err("type")}>
                <ChoiceCards
                  name="customerType"
                  columns={3}
                  value={draft.customer.type}
                  onChange={(v) => set("customer", "type", v)}
                  options={CUSTOMER_TYPES.map((v) => ({
                    value: v,
                    label: t(`discovery.options.customerType.${v}.label`),
                    hint: t(`discovery.options.customerType.${v}.hint`),
                  }))}
                />
              </ChoiceField>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id={id("problem")} label={t("discovery.customer.problem.label")} error={err("problem")} optional>
                  <Textarea
                    id={id("problem")}
                    rows={3}
                    value={draft.customer.problem ?? ""}
                    onChange={(e) => set("customer", "problem", e.target.value)}
                    placeholder={t("discovery.customer.problem.placeholder")}
                    invalid={!!errors.problem}
                    maxLength={400}
                  />
                </Field>
                <Field id={id("need")} label={t("discovery.customer.need.label")} error={err("need")} optional>
                  <Textarea
                    id={id("need")}
                    rows={3}
                    value={draft.customer.need ?? ""}
                    onChange={(e) => set("customer", "need", e.target.value)}
                    placeholder={t("discovery.customer.need.placeholder")}
                    invalid={!!errors.need}
                    maxLength={400}
                  />
                </Field>
              </div>
              <Field id={id("geography")} label={t("discovery.customer.geography.label")} error={err("geography")} optional>
                <Input
                  id={id("geography")}
                  value={draft.customer.geography ?? ""}
                  onChange={(e) => set("customer", "geography", e.target.value)}
                  placeholder={t("discovery.customer.geography.placeholder")}
                  invalid={!!errors.geography}
                  maxLength={160}
                />
              </Field>
            </>
          )}

          {current === "offer" && (
            <>
              <Field id={id("main")} label={t("discovery.offer.main.label")} error={err("main")} optional>
                <Input
                  id={id("main")}
                  value={draft.offer.main ?? ""}
                  onChange={(e) => set("offer", "main", e.target.value)}
                  placeholder={t("discovery.offer.main.placeholder")}
                  invalid={!!errors.main}
                  maxLength={200}
                />
              </Field>
              <Field id={id("others")} label={t("discovery.offer.others.label")} error={err("others")} optional>
                <Textarea
                  id={id("others")}
                  rows={2}
                  value={draft.offer.others ?? ""}
                  onChange={(e) => set("offer", "others", e.target.value)}
                  placeholder={t("discovery.offer.others.placeholder")}
                  invalid={!!errors.others}
                  maxLength={400}
                />
              </Field>
              <Field id={id("priceRange")} label={t("discovery.offer.priceRange.label")} error={err("priceRange")} optional>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    id={id("priceRange")}
                    value={draft.offer.priceUnknown ? "" : (draft.offer.priceRange ?? "")}
                    disabled={draft.offer.priceUnknown}
                    onChange={(e) => set("offer", "priceRange", e.target.value)}
                    placeholder={t("discovery.offer.priceRange.placeholder")}
                    invalid={!!errors.priceRange}
                    className="sm:max-w-xs"
                    maxLength={120}
                  />
                  <Checkbox
                    checked={!!draft.offer.priceUnknown}
                    onChange={(v) => set("offer", "priceUnknown", v)}
                    label={t("discovery.offer.priceUnknown")}
                  />
                </div>
              </Field>
              <Field id={id("differentiator")} label={t("discovery.offer.differentiator.label")} error={err("differentiator")} optional>
                <Textarea
                  id={id("differentiator")}
                  rows={2}
                  value={draft.offer.differentiator ?? ""}
                  onChange={(e) => set("offer", "differentiator", e.target.value)}
                  placeholder={t("discovery.offer.differentiator.placeholder")}
                  invalid={!!errors.differentiator}
                  maxLength={400}
                />
              </Field>
              <ChoiceField id={id("status")} label={t("discovery.offer.status.label")} error={err("status")}>
                <Chips
                  name="offerStatus"
                  selected={draft.offer.status ? [draft.offer.status] : []}
                  onToggle={(v) => set("offer", "status", v)}
                  options={OFFER_STATUSES.map((v) => ({ value: v, label: t(`discovery.options.offerStatus.${v}`) }))}
                />
              </ChoiceField>
              {draft.business.category && ADAPTIVE_QUESTIONS[draft.business.category].length > 0 && (
                <AdaptiveQuestions
                  category={draft.business.category}
                  details={draft.offer.details ?? {}}
                  onChange={(details) => set("offer", "details", details)}
                />
              )}
            </>
          )}

          {current === "model" && (
            <>
              <ChoiceField id={id("revenue")} label={t("discovery.model.revenue.label")} hint={t("discovery.model.revenue.hint")} error={err("revenue")}>
                <Chips
                  name="revenue"
                  multiple
                  selected={draft.model.revenue ?? []}
                  onToggle={(v) => set("model", "revenue", toggle(draft.model.revenue ?? [], v))}
                  options={REVENUE_MODELS.map((v) => ({ value: v, label: t(`discovery.options.revenue.${v}`) }))}
                />
              </ChoiceField>
              <Field id={id("budget")} label={t("discovery.model.budget.label")} hint={t("discovery.model.budget.hint")} error={err("budget")} optional>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    id={id("budget")}
                    value={draft.model.budgetUnknown ? "" : (draft.model.budget ?? "")}
                    disabled={draft.model.budgetUnknown}
                    onChange={(e) => set("model", "budget", e.target.value)}
                    placeholder={t("discovery.model.budget.placeholder")}
                    invalid={!!errors.budget}
                    hasHint
                    className="sm:max-w-xs"
                    maxLength={120}
                  />
                  <Checkbox
                    checked={!!draft.model.budgetUnknown}
                    onChange={(v) => set("model", "budgetUnknown", v)}
                    label={t("discovery.model.budgetUnknown")}
                  />
                </div>
              </Field>
              <ChoiceField id={id("channels")} label={t("discovery.model.channels.label")} hint={t("discovery.model.channels.hint")} error={err("channels")} optional>
                <Chips
                  name="channels"
                  multiple
                  selected={draft.model.channels ?? []}
                  onToggle={(v) => set("model", "channels", toggle(draft.model.channels ?? [], v))}
                  options={SALES_CHANNELS.map((v) => ({ value: v, label: t(`discovery.options.channels.${v}`) }))}
                />
              </ChoiceField>
              {isOperating(draft) && (
                <div className="space-y-4 rounded-lg border border-border p-4">
                  <div>
                    <p className="text-[13px] font-medium text-ink">{t("discovery.model.existingTitle")}</p>
                    <p className="mt-0.5 text-[12.5px] text-ink-subtle">{t("discovery.model.existingHint")}</p>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field id={id("currentRevenue")} label={t("discovery.model.currentRevenue.label")} error={err("currentRevenue")} optional>
                      <Input
                        id={id("currentRevenue")}
                        value={draft.model.currentRevenue ?? ""}
                        onChange={(e) => set("model", "currentRevenue", e.target.value)}
                        placeholder={t("discovery.model.currentRevenue.placeholder")}
                        invalid={!!errors.currentRevenue}
                        maxLength={120}
                      />
                    </Field>
                    <Field id={id("currentCustomers")} label={t("discovery.model.currentCustomers.label")} error={err("currentCustomers")} optional>
                      <Input
                        id={id("currentCustomers")}
                        value={draft.model.currentCustomers ?? ""}
                        onChange={(e) => set("model", "currentCustomers", e.target.value)}
                        placeholder={t("discovery.model.currentCustomers.placeholder")}
                        invalid={!!errors.currentCustomers}
                        maxLength={120}
                      />
                    </Field>
                  </div>
                </div>
              )}
            </>
          )}

          {current === "market" && (
            <>
              <p className="rounded-lg bg-surface-2 px-3.5 py-3 text-[12.5px] text-ink-muted">{t("discovery.market.notice")}</p>
              {(["competitors", "alternatives", "positioning", "difference", "challenges"] as const).map((field) => (
                <Field key={field} id={id(field)} label={t(`discovery.market.${field}.label`)} error={err(field)} optional>
                  <Textarea
                    id={id(field)}
                    rows={2}
                    value={draft.market[field] ?? ""}
                    onChange={(e) => set("market", field, e.target.value)}
                    placeholder={t(`discovery.market.${field}.placeholder`)}
                    invalid={!!errors[field]}
                    maxLength={field === "positioning" ? 300 : 400}
                  />
                </Field>
              ))}
            </>
          )}

          {current === "brand" && (
            <>
              <ChoiceField id={id("style")} label={t("discovery.brand.style.label")} hint={t("discovery.brand.style.hint")} error={err("style")}>
                <ChoiceCards<BusinessStyle>
                  name="style"
                  value={draft.brand.style}
                  onChange={(v) => set("brand", "style", v)}
                  options={BUSINESS_STYLES.map((s) => ({
                    value: s,
                    label: t(`styles.${STYLE_KEYS[s]}.label`),
                    hint: t(`styles.${STYLE_KEYS[s]}.hint`),
                  }))}
                />
              </ChoiceField>
              <ChoiceField id={id("tone")} label={t("discovery.brand.tone.label")} error={err("tone")}>
                <Chips
                  name="tone"
                  selected={draft.brand.tone ? [draft.brand.tone] : []}
                  onToggle={(v) => set("brand", "tone", v)}
                  options={TONES.map((v) => ({ value: v, label: t(`discovery.options.tone.${v}`) }))}
                />
              </ChoiceField>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id={id("colors")} label={t("discovery.brand.colors.label")} error={err("colors")} optional>
                  <Input
                    id={id("colors")}
                    value={draft.brand.colors ?? ""}
                    onChange={(e) => set("brand", "colors", e.target.value)}
                    placeholder={t("discovery.brand.colors.placeholder")}
                    invalid={!!errors.colors}
                    maxLength={120}
                  />
                </Field>
                <Field id={id("avoidColors")} label={t("discovery.brand.avoidColors.label")} error={err("avoidColors")} optional>
                  <Input
                    id={id("avoidColors")}
                    value={draft.brand.avoidColors ?? ""}
                    onChange={(e) => set("brand", "avoidColors", e.target.value)}
                    placeholder={t("discovery.brand.avoidColors.placeholder")}
                    invalid={!!errors.avoidColors}
                    maxLength={120}
                  />
                </Field>
              </div>
              <Field id={id("references")} label={t("discovery.brand.references.label")} error={err("references")} optional>
                <Input
                  id={id("references")}
                  value={draft.brand.references ?? ""}
                  onChange={(e) => set("brand", "references", e.target.value)}
                  placeholder={t("discovery.brand.references.placeholder")}
                  invalid={!!errors.references}
                  maxLength={300}
                />
              </Field>
              <ChoiceField id={id("language")} label={t("discovery.brand.language.label")} hint={t("discovery.brand.language.hint")} error={err("language")}>
                <Chips
                  name="language"
                  selected={draft.brand.language ? [draft.brand.language] : []}
                  onToggle={(v) => set("brand", "language", v)}
                  options={CONTENT_LANGUAGES.map((v) => ({ value: v, label: t(`discovery.options.language.${v}`) }))}
                />
              </ChoiceField>
              <Field id={id("notes")} label={t("discovery.brand.notes.label")} error={err("notes")} optional>
                <Textarea
                  id={id("notes")}
                  rows={2}
                  value={draft.brand.notes ?? ""}
                  onChange={(e) => set("brand", "notes", e.target.value)}
                  placeholder={t("discovery.brand.notes.placeholder")}
                  invalid={!!errors.notes}
                  maxLength={300}
                />
              </Field>
            </>
          )}

          {current === "goals" && (
            <>
              <ChoiceField id={id("priority")} label={t("discovery.goals.priority.label")} error={err("priority")}>
                <ChoiceCards
                  name="priority"
                  columns={3}
                  value={draft.goals.priority}
                  onChange={(v) => set("goals", "priority", v)}
                  options={PRIORITIES.map((v) => ({ value: v, label: t(`discovery.options.priority.${v}`) }))}
                />
              </ChoiceField>
              <Field id={id("goal")} label={t("discovery.goals.goal.label")} error={err("goal")} optional>
                <Input
                  id={id("goal")}
                  value={draft.goals.goal ?? ""}
                  onChange={(e) => set("goals", "goal", e.target.value)}
                  placeholder={t("discovery.goals.goal.placeholder")}
                  invalid={!!errors.goal}
                  maxLength={300}
                />
              </Field>
              <Field id={id("outcome")} label={t("discovery.goals.outcome.label")} error={err("outcome")} optional>
                <Textarea
                  id={id("outcome")}
                  rows={2}
                  value={draft.goals.outcome ?? ""}
                  onChange={(e) => set("goals", "outcome", e.target.value)}
                  placeholder={t("discovery.goals.outcome.placeholder")}
                  invalid={!!errors.outcome}
                  maxLength={300}
                />
              </Field>
              <ChoiceField id={id("timeframe")} label={t("discovery.goals.timeframe.label")} error={err("timeframe")} optional>
                <Chips
                  name="timeframe"
                  selected={draft.goals.timeframe ? [draft.goals.timeframe] : []}
                  onToggle={(v) => set("goals", "timeframe", draft.goals.timeframe === v ? undefined : v)}
                  options={TIMEFRAMES.map((v) => ({ value: v, label: t(`discovery.options.timeframe.${v}`) }))}
                />
              </ChoiceField>
            </>
          )}

          {current === "review" && <Review draft={normalize(draft)} onEdit={edit} mode={mode} />}
        </CardBody>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3.5 sm:px-6">
          <div className="flex items-center gap-1">
            {step === 0 && onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
                {t("common.cancel")}
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={back} disabled={step === 0 || saving} className="gap-1.5">
                <ArrowLeft size={14} aria-hidden />
                {t("discovery.nav.back")}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {current === "review" && onCancel && (
              <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
                {t("common.cancel")}
              </Button>
            )}
            {current === "review" ? (
              <Button type="submit" size="lg" disabled={saving}>
                {saving ? t("discovery.edit.saving") : isEdit ? t("discovery.edit.save") : t("discovery.review.generate")}
              </Button>
            ) : (
              <Button type="submit" className="gap-1.5" disabled={saving}>
                {returnToReview ? t("discovery.nav.toReview") : t("discovery.nav.next")}
                <ArrowRight size={14} aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </Card>

      {current === "review" && aside}
    </form>
  );
}

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 text-[13px] text-ink-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border-strong accent-[var(--color-ink)]"
      />
      {label}
    </label>
  );
}

function AdaptiveQuestions({
  category,
  details,
  onChange,
}: {
  category: Discovery["business"]["category"];
  details: Discovery["offer"]["details"];
  onChange: (details: Discovery["offer"]["details"]) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-5 rounded-lg border border-border p-4">
      <p className="text-[13px] font-medium text-ink">
        {t("discovery.offer.adaptiveTitle", { category: t(`discovery.options.category.${category}`) })}
      </p>
      {ADAPTIVE_QUESTIONS[category].map((q) => {
        const label = t.optional(`discovery.adaptive.${category}.${q.id}`) ?? q.id;
        const fieldId = `d-offer-detail-${q.id}`;
        if (q.kind === "text") {
          const value = details[q.id];
          return (
            <Field key={q.id} id={fieldId} label={label} optional>
              <Input
                id={fieldId}
                value={typeof value === "string" ? value : ""}
                onChange={(e) => onChange({ ...details, [q.id]: e.target.value })}
                maxLength={q.max}
              />
            </Field>
          );
        }
        const value = details[q.id];
        const selected = Array.isArray(value) ? value : [];
        const options: ChoiceOption<string>[] = q.options.map((o) => ({ value: o, label: t.optional(`discovery.adaptive.options.${o}`) ?? o }));
        return (
          <ChoiceField key={q.id} id={fieldId} label={label} optional>
            <Chips name={fieldId} multiple selected={selected} onToggle={(v) => onChange({ ...details, [q.id]: toggle(selected, v) })} options={options} />
          </ChoiceField>
        );
      })}
    </div>
  );
}

/* --------------------------------- Review -------------------------------- */

function Review({
  draft,
  onEdit,
  mode,
}: {
  draft: Draft;
  onEdit: (section: DiscoverySectionKey) => void;
  mode: DiscoveryWizardMode;
}) {
  const t = useT();
  const list = (values: readonly string[] | undefined, label: (v: string) => string) =>
    values && values.length > 0 ? values.map(label).join(", ") : "";
  const { business: b, customer: c, offer: o, model: m, market: k, brand: br, goals: g } = draft;

  const adaptive = b.category
    ? ADAPTIVE_QUESTIONS[b.category].map((q) => {
        const v = o.details?.[q.id];
        const value = Array.isArray(v) ? list(v, (x) => t.optional(`discovery.adaptive.options.${x}`) ?? x) : (v ?? "");
        return { label: t.optional(`discovery.adaptive.${b.category}.${q.id}`) ?? q.id, value };
      })
    : [];

  const sections: { key: DiscoverySectionKey; rows: { label: string; value: string }[] }[] = [
    {
      key: "business",
      rows: [
        { label: t("discovery.business.name.label"), value: b.name ?? "" },
        { label: t("discovery.business.idea.label"), value: b.idea ?? "" },
        { label: t("discovery.business.offering.label"), value: b.offering ?? "" },
        { label: t("discovery.business.stage.label"), value: b.stage ? t(`discovery.options.stage.${b.stage}.label`) : "" },
        { label: t("discovery.business.type.label"), value: b.type ? t(`discovery.options.type.${b.type}.label`) : "" },
        { label: t("discovery.business.category.label"), value: b.category ? t(`discovery.options.category.${b.category}`) : "" },
        { label: t("discovery.business.location.label"), value: b.location ?? "" },
      ],
    },
    {
      key: "customer",
      rows: [
        { label: t("discovery.customer.ideal.label"), value: c.ideal ?? "" },
        { label: t("discovery.customer.type.label"), value: c.type ? t(`discovery.options.customerType.${c.type}.label`) : "" },
        { label: t("discovery.customer.problem.label"), value: c.problem ?? "" },
        { label: t("discovery.customer.need.label"), value: c.need ?? "" },
        { label: t("discovery.customer.geography.label"), value: c.geography ?? "" },
      ],
    },
    {
      key: "offer",
      rows: [
        { label: t("discovery.offer.main.label"), value: o.main ?? "" },
        { label: t("discovery.offer.others.label"), value: o.others ?? "" },
        { label: t("discovery.offer.priceRange.label"), value: o.priceUnknown ? t("discovery.review.notDecided") : (o.priceRange ?? "") },
        { label: t("discovery.offer.differentiator.label"), value: o.differentiator ?? "" },
        { label: t("discovery.offer.status.label"), value: o.status ? t(`discovery.options.offerStatus.${o.status}`) : "" },
        ...adaptive,
      ],
    },
    {
      key: "model",
      rows: [
        { label: t("discovery.model.revenue.label"), value: list(m.revenue, (v) => t(`discovery.options.revenue.${v as (typeof REVENUE_MODELS)[number]}`)) },
        { label: t("discovery.model.budget.label"), value: m.budgetUnknown ? t("discovery.review.notDecided") : (m.budget ?? "") },
        { label: t("discovery.model.channels.label"), value: list(m.channels, (v) => t(`discovery.options.channels.${v as (typeof SALES_CHANNELS)[number]}`)) },
        { label: t("discovery.model.currentRevenue.label"), value: m.currentRevenue ?? "" },
        { label: t("discovery.model.currentCustomers.label"), value: m.currentCustomers ?? "" },
      ],
    },
    {
      key: "market",
      rows: (["competitors", "alternatives", "positioning", "difference", "challenges"] as const).map((f) => ({
        label: t(`discovery.market.${f}.label`),
        value: k[f] ?? "",
      })),
    },
    {
      key: "brand",
      rows: [
        { label: t("discovery.brand.style.label"), value: br.style ? t(`styles.${STYLE_KEYS[br.style]}.label`) : "" },
        { label: t("discovery.brand.tone.label"), value: br.tone ? t(`discovery.options.tone.${br.tone}`) : "" },
        { label: t("discovery.brand.colors.label"), value: br.colors ?? "" },
        { label: t("discovery.brand.avoidColors.label"), value: br.avoidColors ?? "" },
        { label: t("discovery.brand.references.label"), value: br.references ?? "" },
        { label: t("discovery.brand.language.label"), value: br.language ? t(`discovery.options.language.${br.language}`) : "" },
        { label: t("discovery.brand.notes.label"), value: br.notes ?? "" },
      ],
    },
    {
      key: "goals",
      rows: [
        { label: t("discovery.goals.priority.label"), value: g.priority ? t(`discovery.options.priority.${g.priority}`) : "" },
        { label: t("discovery.goals.goal.label"), value: g.goal ?? "" },
        { label: t("discovery.goals.outcome.label"), value: g.outcome ?? "" },
        { label: t("discovery.goals.timeframe.label"), value: g.timeframe ? t(`discovery.options.timeframe.${g.timeframe}`) : "" },
      ],
    },
  ];

  const parsed = discoverySchema.safeParse(draft);
  const gaps =
    parsed.success
      ? contextReadiness(buildBusinessProfile(toBusinessInput(parsed.data))).blocking
          .map((key) => CONTEXT_GAP_KEYS[key])
          .filter((key): key is MessageKey => Boolean(key))
      : [];

  return (
    <div className="space-y-4">
      {sections.map((s) => {
        const rows = s.rows.filter((r) => r.value.trim() !== "");
        const title = t(`discovery.steps.${s.key}.title`);
        return (
          <section key={s.key} className="rounded-lg border border-border">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
              <h3 className="text-[13.5px] font-semibold text-ink">{title}</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onEdit(s.key)}
                className="gap-1.5"
                aria-label={t("discovery.review.editAria", { section: title })}
              >
                <Pencil size={12} aria-hidden />
                {t("discovery.review.edit")}
              </Button>
            </div>
            {rows.length > 0 ? (
              <dl className="divide-y divide-border px-4">
                {rows.map((r) => (
                  <div key={r.label} className="grid gap-1 py-2.5 text-[13px] sm:grid-cols-[180px_1fr] sm:gap-4">
                    <dt className="text-ink-subtle">{r.label}</dt>
                    <dd className="min-w-0 whitespace-pre-line break-words text-ink">{r.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="px-4 py-3 text-[13px] text-ink-subtle">{t("discovery.review.empty")}</p>
            )}
          </section>
        );
      })}
      {gaps.length > 0 && (
        <InlineNotice tone="warning" title={t("discovery.review.contextGapsTitle")}>
          <p>{t("discovery.review.contextGapsBody")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {gaps.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </InlineNotice>
      )}
      <InlineNotice
        tone="neutral"
        title={mode === "edit" ? t("discovery.edit.disclaimerTitle") : t("discovery.review.disclaimerTitle")}
      >
        {mode === "edit" ? t("discovery.edit.disclaimer") : t("discovery.review.disclaimer")}
      </InlineNotice>
    </div>
  );
}