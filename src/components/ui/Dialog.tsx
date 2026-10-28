"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { useT } from "@/i18n/client";

/**
 * Confirmation dialog built on the native <dialog> element, which provides
 * focus containment, Escape-to-close and an inert background.
 *
 * If `onConfirm` returns a promise the dialog stays open and busy until it
 * settles, closing only on success so the caller can show an error.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  confirmDisabled = false,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void | Promise<unknown>;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const t = useT();
  const ref = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  const descId = React.useId();
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  async function confirm() {
    const result = onConfirm();
    if (!(result instanceof Promise)) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await result;
      onClose();
    } catch {
      /* the caller reports the failure; keep the dialog open */
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClose={onClose}
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-[420px] rounded-[var(--radius-card)] border border-border bg-surface p-0 text-ink shadow-[var(--shadow-pop)]"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && !confirmDisabled) void confirm();
        }}
      >
        <div className="p-5">
          <h2 id={titleId} className="text-[15px] font-semibold">
            {title}
          </h2>
          <div id={descId} className="mt-1.5 text-sm leading-relaxed text-ink-muted">
            {description}
          </div>
          {children && <div className="mt-4">{children}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border bg-bg px-5 py-3">
          <Button variant="secondary" onClick={onClose} disabled={busy} autoFocus={!children}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant={destructive ? "danger" : "primary"} disabled={busy || confirmDisabled}>
            {busy && <Loader2 size={15} className="animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
