"use client";

import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/primitives";
import { useT } from "@/i18n/client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();

  React.useEffect(() => {
    console.error(error);
    // Non-sensitive diagnostic for support / automated verification (message + digest only).
    try {
      (window as unknown as { __startuposLastError?: { name: string; message: string; digest?: string } }).__startuposLastError = {
        name: error.name,
        message: error.message.slice(0, 500),
        ...(error.digest ? { digest: error.digest } : {}),
      };
    } catch {
      /* ignore */
    }
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="card w-full max-w-md p-8 text-center" data-error-digest={error.digest ?? undefined}>
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-danger/10 text-danger">
          <AlertTriangle size={20} aria-hidden />
        </div>
        <h1 className="text-lg font-semibold text-ink">{t("errors.page.title")}</h1>
        <p className="mt-1.5 text-sm text-ink-muted">{t("errors.page.description")}</p>
        <div className="mt-6 flex flex-col justify-center gap-2 min-[400px]:flex-row">
          <Button onClick={reset}>
            <RotateCcw size={15} aria-hidden /> {t("common.tryAgain")}
          </Button>
          <ButtonLink href="/dashboard" variant="secondary">
            {t("errors.page.goToDashboard")}
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
