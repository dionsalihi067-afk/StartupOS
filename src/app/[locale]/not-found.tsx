"use client";

import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui/primitives";
import { useT } from "@/i18n/client";

export default function NotFound() {
  const t = useT();
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 text-ink-muted">
          <Compass size={20} aria-hidden />
        </div>
        <h1 className="text-lg font-semibold text-ink">{t("errors.notFound.title")}</h1>
        <p className="mt-1.5 text-sm text-ink-muted">{t("errors.notFound.description")}</p>
        <div className="mt-6 flex flex-col justify-center gap-2 min-[400px]:flex-row">
          <ButtonLink href="/dashboard">{t("errors.notFound.goToDashboard")}</ButtonLink>
          <ButtonLink href="/" variant="secondary">
            {t("errors.notFound.home")}
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
