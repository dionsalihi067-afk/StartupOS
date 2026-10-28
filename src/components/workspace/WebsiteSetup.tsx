"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Plus, X } from "lucide-react";
import type { BusinessPackage } from "@/lib/types";
import { Badge, Button, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { InlineNotice } from "@/components/dashboard/EmptyState";
import { ApiError, updateWebsiteBrief, uploadWebsitePhoto } from "@/lib/client/businesses";
import {
  ARCHETYPE_FIELDS,
  ARCHETYPE_GOALS,
  SITE_ARCHETYPES,
  SITE_LAYOUT_CHOICES,
  websiteBriefOf,
  websiteBriefSchema,
  type SiteArchetype,
  type SiteGoal,
  type WebsiteBrief,
} from "@/lib/website/brief";
import type { WebsiteCheck } from "@/lib/website/quality";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";

type Draft = Omit<WebsiteBrief, "social"> & { social: string };
type FieldError = "email" | "phone" | "whatsapp" | "actionUrl" | "social" | "items" | "hours" | "heroImage";

/** Matches the server limit; checked first so a large file never starts uploading. */
const MAX_PHOTO_BYTES = 4_000_000;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

const ERROR_KEYS: Record<string, MessageKey> = {
  invalidEmail: "website.setup.errors.invalidEmail",
  invalidPhone: "website.setup.errors.invalidPhone",
  invalidUrl: "website.setup.errors.invalidUrl",
};

function toDraft(brief: WebsiteBrief): Draft {
  return { ...brief, social: brief.social.join("\n") };
}

/** Validates the form; returns the brief or a message key per invalid field. */
export function parseDraft(draft: Draft): { ok: true; brief: WebsiteBrief } | { ok: false; errors: Partial<Record<FieldError, MessageKey>> } {
  const social = draft.social
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const hours = draft.hours.filter((h) => h.days.trim() || h.time.trim());
  const items = draft.items.filter((i) => i.name.trim() || i.description.trim() || i.price.trim());
  const errors: Partial<Record<FieldError, MessageKey>> = {};
  if (social.length > 3) errors.social = "website.setup.errors.tooManySocial";
  if (hours.some((h) => !h.days.trim() || !h.time.trim())) errors.hours = "website.setup.errors.hoursIncomplete";
  if (items.some((i) => !i.name.trim())) errors.items = "website.setup.errors.itemName";

  const parsed = websiteBriefSchema.safeParse({ ...draft, social: social.slice(0, 3), hours, items });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === "email" || field === "phone" || field === "whatsapp" || field === "actionUrl" || field === "social") {
        errors[field] ??= ERROR_KEYS[issue.message] ?? "website.setup.errors.invalidUrl";
      } else if (field === "items") errors.items ??= "website.setup.errors.itemName";
      else if (field === "hours") errors.hours ??= "website.setup.errors.hoursIncomplete";
      else if (field === "heroImageAlt" || field === "heroImage") errors.heroImage ??= "website.setup.errors.photoAlt";
    }
  }
  if (!parsed.success || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, brief: parsed.data };
}

export function WebsiteSetup({ pkg, onRewrite }: { pkg: BusinessPackage; onRewrite?: () => void }) {
  const t = useT();
  const saved = pkg.input.website !== undefined;
  const [open, setOpen] = React.useState(!saved);
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(websiteBriefOf(pkg.input)));
  const [errors, setErrors] = React.useState<Partial<Record<FieldError, MessageKey>>>({});
  const [state, setState] = React.useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [uploading, setUploading] = React.useState(false);

  const fields = ARCHETYPE_FIELDS[draft.archetype];
  const goals = ARCHETYPE_GOALS[draft.archetype];
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (state !== "saving") setState("idle");
  };

  const setArchetype = (archetype: SiteArchetype) => {
    setDraft((d) => ({ ...d, archetype, goal: ARCHETYPE_GOALS[archetype].includes(d.goal) ? d.goal : ARCHETYPE_GOALS[archetype][0]! }));
    setState("idle");
  };

  async function choosePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) return setErrors((e) => ({ ...e, heroImage: "website.setup.errors.photoType" }));
    if (file.size > MAX_PHOTO_BYTES) return setErrors((e) => ({ ...e, heroImage: "website.setup.errors.photoSize" }));
    setErrors((e) => ({ ...e, heroImage: undefined }));
    setUploading(true);
    try {
      const url = await uploadWebsitePhoto(pkg.id, file);
      // The photo is only used once the setup is saved; until then it stays private and unused.
      set("heroImage", url);
    } catch (err) {
      const key: MessageKey =
        err instanceof ApiError && err.status === 413
          ? "website.setup.errors.photoSize"
          : err instanceof ApiError && err.status === 415
            ? "website.setup.errors.photoType"
            : err instanceof ApiError && err.status === 429
              ? "website.setup.errors.photoRateLimited"
              : "website.setup.errors.photoFailed";
      setErrors((e) => ({ ...e, heroImage: key }));
    } finally {
      setUploading(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (state === "saving" || uploading) return;
    const result = parseDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setState("saving");
    try {
      await updateWebsiteBrief(pkg.id, result.brief);
      setDraft(toDraft(result.brief));
      setState("saved");
    } catch {
      setState("failed");
    }
  }

  const error = (field: FieldError) => (errors[field] ? t(errors[field]) : undefined);

  return (
    <Card>
      <CardHeader
        title={t("website.setup.title")}
        description={t("website.setup.description")}
        actions={
          <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="website-setup-form">
            {open ? t("website.setup.close") : t("website.setup.open")}
          </Button>
        }
      />
      {!saved && !open && (
        <CardBody className="border-t border-border pt-4">
          <p className="text-[13px] text-ink-muted">{t("website.setup.notSaved")}</p>
        </CardBody>
      )}
      {state === "saved" && !open && (
        <CardBody className="border-t border-border pt-4">
          <InlineNotice tone="neutral" title={t("website.setup.saved")}>
            {onRewrite && (
              <>
                {t("website.setup.rewriteHint")}
                <div className="mt-2">
                  <Button size="sm" variant="secondary" onClick={onRewrite}>
                    {t("website.setup.rewrite")}
                  </Button>
                </div>
              </>
            )}
          </InlineNotice>
        </CardBody>
      )}
      {open && (
        <form id="website-setup-form" onSubmit={save} noValidate className="space-y-6 border-t border-border px-5 py-5">
          {!saved && <InlineNotice title={t("website.setup.notSaved")} />}

          <fieldset className="space-y-4">
            <legend className="mb-3 text-[13.5px] font-semibold text-ink">{t("website.setup.kindTitle")}</legend>
            <div className="grid gap-4 md:grid-cols-3">
              <Field id="ws-archetype" label={t("website.setup.archetype")}>
                <Select id="ws-archetype" value={draft.archetype} onChange={(e) => setArchetype(e.target.value as SiteArchetype)}>
                  {SITE_ARCHETYPES.map((a) => (
                    <option key={a} value={a}>
                      {t(`website.setup.archetypes.${a}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="ws-goal" label={t("website.setup.goal")} hint={t("website.setup.goalHint")}>
                <Select id="ws-goal" value={draft.goal} onChange={(e) => set("goal", e.target.value as SiteGoal)}>
                  {goals.map((g) => (
                    <option key={g} value={g}>
                      {t(`website.setup.goals.${g}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="ws-layout" label={t("website.setup.layout")} hint={t("website.setup.layoutHint")}>
                <Select id="ws-layout" value={draft.layout} onChange={(e) => set("layout", e.target.value as Draft["layout"])}>
                  {SITE_LAYOUT_CHOICES.map((l) => (
                    <option key={l} value={l}>
                      {t(`website.setup.layouts.${l}`)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-[13.5px] font-semibold text-ink">{t("website.setup.photoTitle")}</legend>
            <p className="-mt-1 text-[12.5px] text-ink-subtle">{t("website.setup.photoHint")}</p>
            {draft.heroImage ? (
              <div className="grid gap-3 md:grid-cols-[12rem_1fr] md:items-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draft.heroImage} alt="" className="aspect-[4/3] w-full rounded-lg border border-border object-cover" />
                <div className="space-y-2">
                  <Field id="ws-photo-alt" label={t("website.setup.photoAlt")} hint={t("website.setup.photoAltHint")} error={error("heroImage")}>
                    <Input
                      id="ws-photo-alt"
                      maxLength={160}
                      value={draft.heroImageAlt}
                      invalid={!!errors.heroImage}
                      hasHint
                      onChange={(e) => set("heroImageAlt", e.target.value)}
                    />
                  </Field>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setDraft((d) => ({ ...d, heroImage: "", heroImageAlt: "" }))}>
                    <X size={14} aria-hidden />
                    {t("website.setup.photoRemove")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label
                  htmlFor="ws-photo"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-[13px] font-medium text-ink hover:bg-surface-2 aria-disabled:cursor-wait"
                  aria-disabled={uploading}
                >
                  <Plus size={14} aria-hidden />
                  {uploading ? t("website.setup.photoUploading") : t("website.setup.photoChoose")}
                </label>
                <input id="ws-photo" type="file" accept={PHOTO_TYPES.join(",")} className="sr-only" disabled={uploading} onChange={choosePhoto} />
                {errors.heroImage && (
                  <p role="alert" className="text-[12.5px] text-danger">
                    {t(errors.heroImage)}
                  </p>
                )}
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-[13.5px] font-semibold text-ink">{t("website.setup.contactTitle")}</legend>
            <p className="-mt-2 text-[12.5px] text-ink-subtle">{t("website.setup.contactHint")}</p>
            <div className="grid gap-4 md:grid-cols-2">
              <Field id="ws-email" label={t("website.setup.email")} optional error={error("email")}>
                <Input id="ws-email" type="email" autoComplete="email" value={draft.email} invalid={!!errors.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
              <Field id="ws-phone" label={t("website.setup.phone")} optional hint={t("website.setup.phoneHint")} error={error("phone")}>
                <Input id="ws-phone" type="tel" autoComplete="tel" value={draft.phone} invalid={!!errors.phone} hasHint onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field id="ws-whatsapp" label={t("website.setup.whatsapp")} optional error={error("whatsapp")}>
                <Input id="ws-whatsapp" type="tel" value={draft.whatsapp} invalid={!!errors.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
              </Field>
              <Field id="ws-action" label={t("website.setup.actionUrl")} optional hint={t("website.setup.actionUrlHint")} error={error("actionUrl")}>
                <Input id="ws-action" type="url" inputMode="url" placeholder="https://" value={draft.actionUrl} invalid={!!errors.actionUrl} hasHint onChange={(e) => set("actionUrl", e.target.value)} />
              </Field>
              {fields.address && (
                <Field id="ws-address" label={t("website.setup.address")} optional>
                  <Input id="ws-address" autoComplete="street-address" maxLength={200} value={draft.address} onChange={(e) => set("address", e.target.value)} />
                </Field>
              )}
              {fields.serviceArea && (
                <Field id="ws-area" label={t("website.setup.serviceArea")} optional>
                  <Input id="ws-area" maxLength={200} value={draft.serviceArea} onChange={(e) => set("serviceArea", e.target.value)} />
                </Field>
              )}
              <Field id="ws-social" label={t("website.setup.social")} optional hint={t("website.setup.socialHint")} error={error("social")} className="md:col-span-2">
                <Textarea id="ws-social" rows={2} value={draft.social} invalid={!!errors.social} hasHint onChange={(e) => set("social", e.target.value)} />
              </Field>
            </div>
          </fieldset>

          {fields.hours && (
            <fieldset className="space-y-3">
              <legend className="text-[13.5px] font-semibold text-ink">{t("website.setup.hoursTitle")}</legend>
              {draft.hours.map((h, i) => (
                <div key={i} className="flex items-end gap-2">
                  <Field id={`ws-days-${i}`} label={t("website.setup.hoursDays")} className="flex-1">
                    <Input
                      id={`ws-days-${i}`}
                      maxLength={40}
                      placeholder={t("website.setup.daysPlaceholder")}
                      value={h.days}
                      onChange={(e) => set("hours", draft.hours.map((x, j) => (j === i ? { ...x, days: e.target.value } : x)))}
                    />
                  </Field>
                  <Field id={`ws-time-${i}`} label={t("website.setup.hoursTime")} className="flex-1">
                    <Input
                      id={`ws-time-${i}`}
                      maxLength={60}
                      placeholder={t("website.setup.timePlaceholder")}
                      value={h.time}
                      onChange={(e) => set("hours", draft.hours.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))}
                    />
                  </Field>
                  <Button type="button" variant="ghost" size="icon" aria-label={t("website.setup.remove")} onClick={() => set("hours", draft.hours.filter((_, j) => j !== i))}>
                    <X size={15} aria-hidden />
                  </Button>
                </div>
              ))}
              {errors.hours && (
                <p role="alert" className="text-[12.5px] text-danger">
                  {t(errors.hours)}
                </p>
              )}
              {draft.hours.length < 7 && (
                <Button type="button" size="sm" variant="secondary" onClick={() => set("hours", [...draft.hours, { days: "", time: "" }])}>
                  <Plus size={14} aria-hidden />
                  {t("website.setup.addHours")}
                </Button>
              )}
            </fieldset>
          )}

          <fieldset className="space-y-3">
            <legend className="text-[13.5px] font-semibold text-ink">{t("website.setup.itemsTitle")}</legend>
            <p className="-mt-1 text-[12.5px] text-ink-subtle">{t("website.setup.itemsHint")}</p>
            {draft.items.map((item, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[1fr_2fr_8rem_auto] md:items-end">
                <Field id={`ws-item-${i}`} label={t("website.setup.itemName")}>
                  <Input
                    id={`ws-item-${i}`}
                    maxLength={120}
                    value={item.name}
                    invalid={!!errors.items && !item.name.trim()}
                    onChange={(e) => set("items", draft.items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  />
                </Field>
                <Field id={`ws-item-desc-${i}`} label={t("website.setup.itemDescription")} optional>
                  <Input
                    id={`ws-item-desc-${i}`}
                    maxLength={300}
                    value={item.description}
                    onChange={(e) => set("items", draft.items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                  />
                </Field>
                <Field id={`ws-item-price-${i}`} label={t("website.setup.itemPrice")} optional>
                  <Input
                    id={`ws-item-price-${i}`}
                    maxLength={40}
                    placeholder={t("website.setup.itemPricePlaceholder")}
                    value={item.price}
                    onChange={(e) => set("items", draft.items.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                  />
                </Field>
                <Button type="button" variant="ghost" size="icon" aria-label={t("website.setup.remove")} onClick={() => set("items", draft.items.filter((_, j) => j !== i))}>
                  <X size={15} aria-hidden />
                </Button>
              </div>
            ))}
            {errors.items && (
              <p role="alert" className="text-[12.5px] text-danger">
                {t(errors.items)}
              </p>
            )}
            {draft.items.length < 12 && (
              <Button type="button" size="sm" variant="secondary" onClick={() => set("items", [...draft.items, { name: "", description: "", price: "" }])}>
                <Plus size={14} aria-hidden />
                {t("website.setup.addItem")}
              </Button>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-[13.5px] font-semibold text-ink">{t("website.setup.pagesTitle")}</legend>
            {(["about", "faq"] as const).map((key) => (
              <label key={key} className="flex items-center gap-2 text-[13px] text-ink">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--color-brand)]"
                  checked={draft.pages[key]}
                  onChange={(e) => set("pages", { ...draft.pages, [key]: e.target.checked })}
                />
                {key === "about" ? t("website.setup.pageAbout") : t("website.setup.pageFaq")}
              </label>
            ))}
          </fieldset>

          {state === "failed" && <InlineNotice tone="danger" title={t("website.setup.failed")} />}
          {state === "saved" && (
            <InlineNotice tone="neutral" title={t("website.setup.saved")}>
              {onRewrite ? t("website.setup.rewriteHint") : null}
            </InlineNotice>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={state === "saving" || uploading} aria-busy={state === "saving"}>
              {state === "saving" ? t("website.setup.saving") : t("website.setup.save")}
            </Button>
            {saved && onRewrite && (
              <Button type="button" variant="secondary" onClick={onRewrite} disabled={state === "saving"}>
                {t("website.setup.rewrite")}
              </Button>
            )}
          </div>
        </form>
      )}
    </Card>
  );
}

export function WebsiteChecks({ checks }: { checks: readonly WebsiteCheck[] }) {
  const t = useT();
  const blocking = checks.some((c) => c.severity === "error");
  const unique = checks.filter((c, i) => checks.findIndex((o) => o.id === c.id) === i);
  return (
    <Card>
      <CardHeader title={t("website.checks.title")} description={blocking ? t("website.checks.blocking") : undefined} />
      <CardBody className="border-t border-border pt-4">
        {unique.length === 0 ? (
          <p className="flex items-center gap-2 text-[13px] text-ink-muted">
            <CheckCircle2 size={15} className="text-success" aria-hidden />
            {t("website.checks.allGood")}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {unique.map((c) => (
              <li key={c.id} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink">
                <AlertCircle size={15} className={c.severity === "error" ? "mt-0.5 shrink-0 text-danger" : "mt-0.5 shrink-0 text-warning"} aria-hidden />
                <span className="min-w-0 flex-1">{t(`website.checks.items.${c.id}`)}</span>
                <Badge tone={c.severity === "error" ? "danger" : "neutral"}>
                  {c.severity === "error" ? t("website.checks.required") : t("website.checks.suggested")}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
