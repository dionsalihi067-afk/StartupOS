"use client";

import * as React from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { useT } from "@/i18n/client";
import { usePathname } from "@/i18n/navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const t = useT();

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (open) {
      document.querySelector<HTMLElement>("#app-sidebar [data-sidebar-close]")?.focus();
    } else if (wasOpen.current && window.matchMedia("(max-width: 1023px)").matches) {
      document.querySelector<HTMLElement>('[aria-controls="app-sidebar"]')?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="min-h-screen bg-bg">
      <a
        href="#main"
        className="sr-only z-[60] rounded-lg bg-surface px-3 py-2 text-sm font-medium text-ink shadow-[var(--shadow-pop)] focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        {t("common.skipToContent")}
      </a>
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="lg:pl-[252px]">
        <TopBar onMenu={() => setOpen(true)} menuOpen={open} />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1120px] px-4 py-6 outline-none sm:px-6 lg:px-9 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
