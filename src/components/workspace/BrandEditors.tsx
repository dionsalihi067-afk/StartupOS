"use client";

import * as React from "react";
import { Check, Pencil } from "lucide-react";
import type { ColorSwatch } from "@/lib/types";
import type { BrandEdit } from "@/lib/brand-edit";
import { updateBrand } from "@/lib/client/businesses";
import { Badge, Button } from "@/components/ui/primitives";
import { Input, Textarea } from "@/components/ui/form";
import { readableTextColor } from "@/lib/engine/color";
import { copyToClipboard } from "@/lib/client/download";
import { useT } from "@/i18n/client";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Saves one isolated brand edit and exposes the request state for the inline editors. */
function useBrandSave(businessId: string) {
  const [saving, setSaving] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const save = React.useCallback(
    async (edit: BrandEdit) => {
      setSaving(true);
      setFailed(false);
      try {
        await updateBrand(businessId, edit);
        return true;
      } catch {
        setFailed(true);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [businessId],
  );
  return { saving, failed, save, clearError: () => setFailed(false) };
}

type TextField = "name" | "slogan" | "description";

/**
 * A single brand attribute with view and edit modes. Saving changes only this
 * attribute; nothing else in the brand is regenerated or recalculated.
 */
export function EditableText({
  businessId,
  field,
  label,
  hint,
  value,
  max,
  multiline = false,
  display,
}: {
  businessId: string;
  field: TextField;
  label: string;
  hint?: string;
  value: string;
  max: number;
  multiline?: boolean;
  display?: React.ReactNode;
}) {
  const t = useT();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const { saving, failed, save, clearError } = useBrandSave(businessId);
  const inputId = `brand-edit-${field}`;
  const trimmed = draft.trim();

  function start() {
    setDraft(value);
    clearError();
    setEditing(true);
  }

  async function commit() {
    if (!trimmed || trimmed.length > max) return;
    if (trimmed === value) {
      setEditing(false);
      return;
    }
    if (await save({ field, value: trimmed })) setEditing(false);
  }

  return (
    <div className="grid gap-1.5 py-4 first:pt-0 last:pb-0 sm:grid-cols-[160px_1fr] sm:gap-6">
      <div>
        <label htmlFor={editing ? inputId : undefined} className="text-[13px] font-medium text-ink">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-[12px] leading-snug text-ink-subtle">{hint}</p>}
      </div>
      {editing ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
        >
          {multiline ? (
            <Textarea id={inputId} rows={4} value={draft} maxLength={max} onChange={(e) => setDraft(e.target.value)} autoFocus />
          ) : (
            <Input id={inputId} value={draft} maxLength={max} onChange={(e) => setDraft(e.target.value)} autoFocus />
          )}
          <EditorActions saving={saving} disabled={!trimmed} onCancel={() => setEditing(false)} />
          {failed && <SaveError />}
          {!trimmed && <p className="text-[12.5px] text-danger">{t("brand.edit.required")}</p>}
        </form>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-sm leading-relaxed text-ink">{display ?? value}</div>
          <EditButton label={t("brand.edit.editAria", { field: label })} onClick={start} />
        </div>
      )}
    </div>
  );
}

/** Personality traits, edited as a comma-separated list. */
export function EditableTraits({ businessId, label, hint, values }: { businessId: string; label: string; hint?: string; values: string[] }) {
  const t = useT();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(values.join(", "));
  const { saving, failed, save, clearError } = useBrandSave(businessId);
  const inputId = "brand-edit-personality";
  const parsed = draft
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const invalid = parsed.length > 8 || parsed.some((v) => v.length > 40);

  async function commit() {
    if (invalid) return;
    if (await save({ field: "personality", value: parsed })) setEditing(false);
  }

  return (
    <div className="grid gap-1.5 py-4 first:pt-0 last:pb-0 sm:grid-cols-[160px_1fr] sm:gap-6">
      <div>
        <label htmlFor={editing ? inputId : undefined} className="text-[13px] font-medium text-ink">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-[12px] leading-snug text-ink-subtle">{hint}</p>}
      </div>
      {editing ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
        >
          <Input id={inputId} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus invalid={invalid} />
          <p className={invalid ? "text-[12.5px] text-danger" : "text-[12px] text-ink-subtle"}>{t("brand.edit.traitsHint")}</p>
          <EditorActions saving={saving} disabled={invalid} onCancel={() => setEditing(false)} />
          {failed && <SaveError />}
        </form>
      ) : (
        <div className="flex items-start justify-between gap-3">
          {values.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {values.map((p) => (
                <Badge key={p} tone="outline">
                  {p}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-sm text-ink-subtle">{t("brand.edit.none")}</span>
          )}
          <EditButton
            label={t("brand.edit.editAria", { field: label })}
            onClick={() => {
              setDraft(values.join(", "));
              clearError();
              setEditing(true);
            }}
          />
        </div>
      )}
    </div>
  );
}

/** One palette colour: click to copy, or edit its HEX value in place. */
export function EditableSwatch({ businessId, swatch, index }: { businessId: string; swatch: ColorSwatch; index: number }) {
  const t = useT();
  const [copied, setCopied] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(swatch.hex);
  const { saving, failed, save, clearError } = useBrandSave(businessId);
  const normalized = draft.startsWith("#") ? draft : `#${draft}`;
  const valid = HEX.test(normalized);
  const preview = valid ? normalized : swatch.hex;
  const inputId = `brand-color-${index}`;

  async function copy() {
    if (await copyToClipboard(swatch.hex)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  }

  async function commit() {
    if (!valid) return;
    if (normalized.toUpperCase() === swatch.hex.toUpperCase()) {
      setEditing(false);
      return;
    }
    if (await save({ field: "color", index, hex: normalized })) setEditing(false);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {editing ? (
        <div className="flex h-24 items-end p-2.5" style={{ background: preview, color: readableTextColor(preview) }}>
          <span className="font-mono text-[12px] font-medium uppercase">{preview}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={copy}
          aria-label={t("brand.palette.copyAria", { name: swatch.name, hex: swatch.hex })}
          className="flex h-24 w-full items-end p-2.5 text-left transition-opacity hover:opacity-90"
          style={{ background: swatch.hex, color: readableTextColor(swatch.hex) }}
        >
          <span className="inline-flex items-center gap-1 font-mono text-[12px] font-medium uppercase" aria-live="polite">
            {copied ? (
              <>
                <Check size={12} aria-hidden /> {t("common.copied")}
              </>
            ) : (
              swatch.hex
            )}
          </span>
        </button>
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-ink">{swatch.name}</div>
            {!editing && <div className="mt-0.5 text-[12px] leading-snug text-ink-subtle">{swatch.usage}</div>}
          </div>
          {!editing && (
            <EditButton
              label={t("brand.edit.editColorAria", { name: swatch.name })}
              onClick={() => {
                setDraft(swatch.hex);
                clearError();
                setEditing(true);
              }}
            />
          )}
        </div>
        {editing && (
          <form
            className="mt-2 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void commit();
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
          >
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={t("brand.edit.colorPicker", { name: swatch.name })}
                value={preview.toLowerCase()}
                onChange={(e) => setDraft(e.target.value.toUpperCase())}
                className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-border-strong bg-surface p-1"
              />
              <label htmlFor={inputId} className="sr-only">
                {t("brand.edit.hexLabel", { name: swatch.name })}
              </label>
              <Input
                id={inputId}
                value={draft}
                maxLength={7}
                onChange={(e) => setDraft(e.target.value.trim())}
                invalid={!valid}
                className="font-mono uppercase"
                autoFocus
              />
            </div>
            {!valid && <p className="text-[12px] text-danger">{t("brand.edit.invalidHex")}</p>}
            <EditorActions saving={saving} disabled={!valid} onCancel={() => setEditing(false)} compact />
            {failed && <SaveError />}
          </form>
        )}
      </div>
    </div>
  );
}

function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={onClick} className="h-7 w-7 shrink-0 text-ink-subtle hover:text-ink">
      <Pencil size={13} aria-hidden />
    </Button>
  );
}

function EditorActions({
  saving,
  disabled,
  onCancel,
  compact = false,
}: {
  saving: boolean;
  disabled: boolean;
  onCancel: () => void;
  compact?: boolean;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-2">
      <Button type="submit" size="sm" disabled={saving || disabled} className={compact ? "flex-1" : undefined}>
        {saving ? t("brand.edit.saving") : t("brand.edit.save")}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
        {t("common.cancel")}
      </Button>
    </div>
  );
}

function SaveError() {
  const t = useT();
  return (
    <p role="alert" className="text-[12.5px] text-danger">
      {t("brand.edit.saveFailed")}
    </p>
  );
}
