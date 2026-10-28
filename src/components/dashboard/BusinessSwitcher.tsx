"use client";

import * as React from "react";
import { Check, ChevronsUpDown, List, Plus } from "lucide-react";
import { BusinessAvatar } from "@/components/ui/Logo";
import { setActiveBusinessId, useBusinesses } from "@/lib/client/businesses";
import { businessCategory, businessName } from "@/lib/client/insights";
import { useT } from "@/i18n/client";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function BusinessSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT();
  const { businesses, active, ready, error } = useBusinesses();
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const listId = React.useId();
  const readyBusinesses = businesses.filter((b) => b.status === "ready");

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function select(id: string) {
    setActiveBusinessId(id);
    setOpen(false);
    if (pathname.startsWith("/dashboard/projects/")) router.push(`/dashboard/projects/${id}`);
    onNavigate?.();
  }

  if (!ready && !error) {
    return <div aria-hidden className="skeleton h-[52px] rounded-lg" />;
  }

  if (!active) {
    return (
      <Link
        href={businesses.length ? "/dashboard/projects" : "/dashboard/generate"}
        onClick={onNavigate}
        className="flex items-center gap-2.5 rounded-lg border border-dashed border-border-strong px-3 py-2.5 text-sm text-ink-muted transition-colors hover:border-ink-subtle hover:text-ink"
      >
        {businesses.length ? <List size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
        {businesses.length ? t("navigation.allBusinesses") : t("switcher.createFirst")}
      </Link>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-left transition-colors duration-150 hover:border-border-strong hover:bg-surface-3"
      >
        <BusinessAvatar name={businessName(active, t)} iconUrl={active.iconUrl} className="h-8 w-8 rounded-md text-xs" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-ink">{businessName(active, t)}</span>
          <span className="block truncate text-[11.5px] text-ink-subtle">{businessCategory(active.idea, t)}</span>
        </span>
        <ChevronsUpDown size={15} className="shrink-0 text-ink-subtle" aria-hidden />
        <span className="sr-only">{t("switcher.switchBusiness")}</span>
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-pop)]">
          <div className="px-3 pb-1 pt-2.5 text-[11.5px] font-medium text-ink-subtle">{t("switcher.businesses")}</div>
          <ul id={listId} role="listbox" aria-label={t("switcher.businesses")} className="max-h-64 overflow-y-auto px-1.5 pb-1.5">
            {readyBusinesses.map((b) => {
              const selected = b.id === active.id;
              return (
                <li key={b.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => select(b.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2",
                      selected ? "text-ink" : "text-ink-muted",
                    )}
                  >
                    <BusinessAvatar name={businessName(b, t)} iconUrl={b.iconUrl} className="h-6 w-6 rounded text-[10px]" />
                    <span className="min-w-0 flex-1 truncate">{businessName(b, t)}</span>
                    {selected && <Check size={14} className="text-brand" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-border p-1.5">
            <Link
              href="/dashboard/projects"
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-ink-muted hover:bg-surface-2 hover:text-ink"
            >
              <List size={15} aria-hidden /> {t("navigation.allBusinesses")}
            </Link>
            <Link
              href="/dashboard/generate"
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-ink-muted hover:bg-surface-2 hover:text-ink"
            >
              <Plus size={15} aria-hidden /> {t("navigation.newBusiness")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
