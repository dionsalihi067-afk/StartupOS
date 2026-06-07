"use client";

import * as React from "react";
import { Check, Copy, Download } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/primitives";
import { copyToClipboard } from "@/lib/client/download";
import { cn } from "@/lib/utils";

export function CopyButton({
  text,
  label = "Copy",
  size = "sm",
  variant = "secondary",
  className,
}: {
  text: string;
  label?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  async function handle() {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  }

  return (
    <Button type="button" size={size} variant={variant} onClick={handle} className={className}>
      {copied ? <Check size={15} className="text-success" /> : <Copy size={15} />}
      {copied ? "Copied" : label}
    </Button>
  );
}

export function DownloadButton({
  onDownload,
  label = "Download",
  size = "sm",
  variant = "secondary",
  className,
}: {
  onDownload: () => void | Promise<void>;
  label?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
}) {
  const [busy, setBusy] = React.useState(false);
  async function handle() {
    setBusy(true);
    try {
      await onDownload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button type="button" size={size} variant={variant} onClick={handle} disabled={busy} className={cn(className)}>
      <Download size={15} />
      {label}
    </Button>
  );
}
