"use client";

import * as React from "react";
import { Loader2, LogOut, Settings } from "lucide-react";
import { useSession } from "@/components/auth/SessionProvider";
import { initials, signOut } from "@/lib/client/account";
import { useLocale, useT } from "@/i18n/client";
import { Link } from "@/i18n/navigation";

export function AccountMenu() {
  const t = useT();
  const locale = useLocale();
  const { user } = useSession();
  const [open, setOpen] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const menuId = React.useId();

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

  const itemClass =
    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-60";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t("account.menuLabel", { name: user.name || user.email })}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border-strong bg-surface-3 text-[12px] font-semibold text-ink transition-colors hover:bg-surface-2"
      >
        {initials(user.name, user.email)}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-64 overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-pop)]"
        >
          <div className="border-b border-border px-3 py-2.5">
            <div className="truncate text-[13px] font-semibold text-ink">{user.name}</div>
            <div className="truncate text-[12px] text-ink-subtle">{user.email}</div>
          </div>
          <div className="p-1.5">
            <Link href="/dashboard/settings" role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
              <Settings size={15} aria-hidden /> {t("navigation.settings")}
            </Link>
            <button
              type="button"
              role="menuitem"
              disabled={leaving}
              onClick={() => {
                setLeaving(true);
                void signOut(locale);
              }}
              className={itemClass}
            >
              {leaving ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <LogOut size={15} aria-hidden />}
              {t("account.signOut")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
