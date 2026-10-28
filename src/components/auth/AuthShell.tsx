"use client";

import { Check } from "lucide-react";
import { ProductWordmark } from "@/components/ui/ProductMark";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { useT } from "@/i18n/client";
import { Link } from "@/i18n/navigation";

const PANEL_POINTS = ["workspace", "continuity", "honest"] as const;

export function AuthShell({ children }: { children: React.ReactNode }) {
  const t = useT();

  return (
    <main className="flex min-h-screen flex-col bg-bg lg:flex-row">
      <aside className="auth-atmosphere relative hidden w-[44%] shrink-0 flex-col justify-between border-r border-border p-10 lg:flex xl:w-[46%] xl:p-12">
        <Link href="/" aria-label={t("common.productHome")}>
          <ProductWordmark />
        </Link>
        <div className="max-w-md motion-enter">
          <p className="font-display text-[2rem] font-semibold leading-tight tracking-tight text-ink xl:text-[2.25rem]">
            {t("auth.panel.title")}
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">{t("auth.panel.body")}</p>
          <ul className="mt-8 space-y-3">
            {PANEL_POINTS.map((p) => (
              <li key={p} className="flex gap-3 text-[13.5px] leading-snug text-ink-muted">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
                  <Check size={12} strokeWidth={2.5} aria-hidden />
                </span>
                {t(`auth.panel.points.${p}`)}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[12.5px] text-ink-subtle">{t("auth.panel.footer")}</p>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-14 items-center justify-between px-4 sm:px-6 lg:justify-end">
          <Link href="/" aria-label={t("common.productHome")} className="lg:hidden">
            <ProductWordmark />
          </Link>
          <LanguageSwitcher />
        </header>

        <div className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
          <div className="w-full max-w-[400px] motion-enter">{children}</div>
        </div>
      </div>
    </main>
  );
}
