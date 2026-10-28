"use client";

import * as React from "react";
import { AlertCircle, Check, Copy, Download } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/primitives";
import { copyToClipboard } from "@/lib/client/download";
import { useT } from "@/i18n/client";

type Outcome = "idle" | "success" | "failed";

/** Shows a success/failure state briefly, then returns to idle. */
function useOutcome(): [Outcome, (next: Exclude<Outcome, "idle">) => void] {
  const [outcome, setOutcome] = React.useState<Outcome>("idle");
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const show = React.useCallback((next: Exclude<Outcome, "idle">) => {
    clearTimeout(timer.current);
    setOutcome(next);
    timer.current = setTimeout(() => setOutcome("idle"), next === "failed" ? 2400 : 1600);
  }, []);
  return [outcome, show];
}

export function CopyButton({
  text,
  label: labelProp,
  size = "sm",
  variant = "secondary",
  className,
  ariaLabel,
}: {
  text: string;
  label?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
  ariaLabel?: string;
}) {
  const t = useT();
  const label = labelProp ?? t("common.copy");
  const [outcome, show] = useOutcome();

  async function handle() {
    show((await copyToClipboard(text)) ? "success" : "failed");
  }

  const status = outcome === "success" ? t("common.copied") : outcome === "failed" ? t("common.copyFailed") : null;

  return (
    <Button size={size} variant={variant} onClick={handle} className={className} aria-label={ariaLabel ?? label}>
      {outcome === "success" ? (
        <Check size={14} className="text-success" aria-hidden />
      ) : outcome === "failed" ? (
        <AlertCircle size={14} className="text-danger" aria-hidden />
      ) : (
        <Copy size={14} aria-hidden />
      )}
      {size !== "icon" && <span>{status ?? label}</span>}
      <span role="status" className="sr-only">
        {status}
      </span>
    </Button>
  );
}

export function DownloadButton({
  onDownload,
  label: labelProp,
  size = "sm",
  variant = "secondary",
  className,
  ariaLabel,
}: {
  onDownload: () => void | Promise<void>;
  label?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
  ariaLabel?: string;
}) {
  const t = useT();
  const label = labelProp ?? t("common.download");
  const [busy, setBusy] = React.useState(false);
  const [outcome, show] = useOutcome();

  async function handle() {
    setBusy(true);
    try {
      await onDownload();
    } catch (err) {
      console.error(err);
      show("failed");
    } finally {
      setBusy(false);
    }
  }

  const failed = outcome === "failed";
  return (
    <Button size={size} variant={variant} onClick={handle} disabled={busy} className={className} aria-label={ariaLabel ?? label}>
      {failed ? <AlertCircle size={14} className="text-danger" aria-hidden /> : <Download size={14} aria-hidden />}
      {size !== "icon" && <span>{failed ? t("common.downloadFailed") : label}</span>}
      <span role="status" className="sr-only">
        {failed ? t("common.downloadFailed") : null}
      </span>
    </Button>
  );
}
