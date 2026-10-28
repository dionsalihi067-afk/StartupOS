"use client";

import * as React from "react";
import { ChevronRight, Menu, Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/primitives";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { routeInfo } from "@/components/dashboard/navigation";
import { AccountMenu } from "@/components/dashboard/AccountMenu";
import { useBusinesses } from "@/lib/client/businesses";
import { businessName } from "@/lib/client/insights";
import { useT } from "@/i18n/client";
import { Link, usePathname } from "@/i18n/navigation";

export function TopBar({ onMenu, menuOpen }: { onMenu: () => void; menuOpen: boolean }) {
  const pathname = usePathname();
  const { active } = useBusinesses();
  const t = useT();
  const { titleKey, businessScoped } = routeInfo(pathname);
  const pageTitle = titleKey ? t(titleKey) : null;

  React.useEffect(() => {
    if (pageTitle) document.title = t("meta.titleTemplate").replace("%s", pageTitle);
  }, [pageTitle, t]);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur-md sm:px-6 lg:px-9">
      <button
        type="button"
        onClick={onMenu}
        aria-label={t("navigation.openNavigation")}
        aria-controls="app-sidebar"
        aria-expanded={menuOpen}
        className="-ml-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-3 hover:text-ink lg:hidden"
      >
        <Menu size={18} aria-hidden />
      </button>

      <nav aria-label={t("navigation.breadcrumb")} className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          {pathname !== "/dashboard" && (
            <>
              <li className="hidden min-w-0 sm:block">
                <Link href="/dashboard" className="text-ink-muted transition-colors hover:text-ink">
                  {t("navigation.home")}
                </Link>
              </li>
              <li aria-hidden className="hidden text-ink-subtle sm:block">
                <ChevronRight size={14} />
              </li>
            </>
          )}
          {businessScoped && active && (
            <>
              <li className="hidden min-w-0 md:block">
                <Link
                  href={`/dashboard/projects/${active.id}`}
                  className="block max-w-[10rem] truncate text-ink-muted transition-colors hover:text-ink lg:max-w-[14rem]"
                >
                  {businessName(active, t)}
                </Link>
              </li>
              <li aria-hidden className="hidden text-ink-subtle md:block">
                <ChevronRight size={14} />
              </li>
            </>
          )}
          <li className="truncate font-semibold tracking-tight text-ink" aria-current="page">
            {pageTitle ?? "StartupOS"}
          </li>
        </ol>
      </nav>

      <LanguageSwitcher />

      {pathname !== "/dashboard/generate" && (
        <ButtonLink href="/dashboard/generate" variant="secondary" size="sm" aria-label={t("navigation.newBusiness")}>
          <Plus size={15} aria-hidden />
          <span className="hidden sm:inline">{t("navigation.newBusiness")}</span>
        </ButtonLink>
      )}

      <AccountMenu />
    </header>
  );
}
