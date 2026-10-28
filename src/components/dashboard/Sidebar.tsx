"use client";

import * as React from "react";
import { Plus, X, type LucideIcon } from "lucide-react";
import { ProductWordmark } from "@/components/ui/ProductMark";
import { BusinessSwitcher } from "@/components/dashboard/BusinessSwitcher";
import { BUSINESS_NAV, BUSINESSES_NAV, HOME_NAV, SETTINGS_NAV, type NavItem } from "@/components/dashboard/navigation";
import { useBusinesses } from "@/lib/client/businesses";
import { sectionHref } from "@/lib/client/insights";
import { useT } from "@/i18n/client";
import { Link, usePathname } from "@/i18n/navigation";
import type { Translator } from "@/i18n/translator";
import { cn } from "@/lib/utils";

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition-colors duration-150",
        active
          ? "bg-brand-soft font-medium text-brand-2"
          : "text-ink-muted hover:bg-surface-3 hover:text-ink",
      )}
    >
      <Icon size={16} strokeWidth={1.75} className={cn("shrink-0", active ? "text-brand" : "text-ink-subtle")} aria-hidden />
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}

function linkProps(item: NavItem, t: Translator) {
  return { href: item.href, label: t(item.labelKey), icon: item.icon };
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">
      {children}
    </div>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { active } = useBusinesses();
  const t = useT();

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-[rgba(18,32,28,0.42)] backdrop-blur-[2px] transition-opacity duration-150 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        id="app-sidebar"
        aria-label={t("navigation.mainNavigation")}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[252px] flex-col border-r border-border bg-surface duration-200 lg:visible lg:translate-x-0",
          open ? "visible translate-x-0 transition-transform" : "invisible -translate-x-full transition-[transform,visibility]",
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-4">
          <Link href="/dashboard" onClick={onClose} aria-label={t("common.productHome")} className="min-w-0">
            <ProductWordmark />
          </Link>
          <button
            type="button"
            onClick={onClose}
            data-sidebar-close
            className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-3 hover:text-ink lg:hidden"
            aria-label={t("navigation.closeNavigation")}
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="px-3 pb-1">
          <BusinessSwitcher onNavigate={onClose} />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-1" aria-label={t("navigation.sections")}>
          <NavLink {...linkProps(HOME_NAV, t)} active={pathname === HOME_NAV.href} onNavigate={onClose} />

          {active && (
            <>
              <GroupLabel>{t("navigation.groupBusiness")}</GroupLabel>
              <div className="space-y-0.5">
                {BUSINESS_NAV.map((item) => {
                  const href = sectionHref(item.key, active.id);
                  const isActive =
                    item.key === "overview" ? pathname.startsWith("/dashboard/projects/") : pathname === href;
                  return (
                    <NavLink
                      key={item.key}
                      href={href}
                      label={t(item.labelKey)}
                      icon={item.icon}
                      active={isActive}
                      onNavigate={onClose}
                    />
                  );
                })}
              </div>
            </>
          )}

          <GroupLabel>{t("navigation.groupWorkspace")}</GroupLabel>
          <div className="space-y-0.5">
            <NavLink {...linkProps(BUSINESSES_NAV, t)} active={pathname === BUSINESSES_NAV.href} onNavigate={onClose} />
            <NavLink
              href="/dashboard/generate"
              label={t("navigation.newBusiness")}
              icon={Plus}
              active={pathname === "/dashboard/generate"}
              onNavigate={onClose}
            />
          </div>
        </nav>

        <div className="border-t border-border px-3 py-3">
          <NavLink {...linkProps(SETTINGS_NAV, t)} active={pathname.startsWith(SETTINGS_NAV.href)} onNavigate={onClose} />
        </div>
      </aside>
    </>
  );
}
