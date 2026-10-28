"use client";

import { Briefcase, Menu, Sparkles, X, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ButtonLink } from "@/components/ui/primitives";
import { ProductWordmark } from "@/components/ui/ProductMark";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { useLocale, useT } from "@/i18n/client";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type NavItem =
  | { kind: "route"; href: "/dashboard/projects"; key: "landing.nav.ventures"; icon: LucideIcon }
  | { kind: "hash"; href: "#how"; key: "landing.nav.how"; icon: LucideIcon };

const NAV: NavItem[] = [
  { kind: "route", href: "/dashboard/projects", key: "landing.nav.ventures", icon: Briefcase },
  { kind: "hash", href: "#how", key: "landing.nav.how", icon: Sparkles },
];

/**
 * Floating Command Center navbar for the marketing landing page.
 * Explore / Resources omitted — no matching routes exist in the app.
 */
export function LandingHeader() {
  const t = useT();
  const locale = useLocale();
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const howHref = pathname === "/" ? "#how" : `/${locale}#how`;
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const panelId = useId();
  const lastY = useRef(0);
  const raf = useRef(0);
  const menuOpen = useRef(false);
  menuOpen.current = open;

  const onScroll = useCallback(() => {
    if (raf.current) return;
    raf.current = window.requestAnimationFrame(() => {
      raf.current = 0;
      if (menuOpen.current) {
        setCompact(false);
        return;
      }
      const y = window.scrollY;
      const nearTop = y < 24;
      const delta = y - lastY.current;
      lastY.current = y;
      if (nearTop) {
        setCompact(false);
        return;
      }
      if (delta > 8) setCompact(true);
      else if (delta < -8) setCompact(false);
    });
  }, []);

  useEffect(() => {
    lastY.current = window.scrollY;
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [onScroll]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  function scrollToHow(e: React.MouseEvent<HTMLAnchorElement>) {
    if (pathname !== "/") return;
    const el = document.getElementById("how");
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    setOpen(false);
  }

  const bar = (
    <nav
      aria-label={t("landing.nav.main")}
      className={cn(
        "command-nav pointer-events-auto flex w-full max-w-5xl items-center gap-2 rounded-2xl border px-2.5 py-2 shadow-[var(--shadow-command)] backdrop-blur-xl transition-[padding,transform,box-shadow,background-color,border-color] duration-[var(--duration-base)] ease-[var(--ease-out-soft)] sm:gap-3 sm:px-3",
        compact ? "border-white/10 bg-[color-mix(in_srgb,var(--color-surface)_78%,transparent)] py-1.5 sm:py-1.5" : "border-white/12 bg-[color-mix(in_srgb,var(--color-surface)_62%,transparent)]",
      )}
    >
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Link href="/" aria-label={t("common.productHome")} className="shrink-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]" onClick={() => setOpen(false)}>
          <ProductWordmark className="[&_span]:text-[14px] sm:[&_span]:text-[15px]" />
        </Link>
        <span
          className="hidden items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[10.5px] font-medium tracking-wide text-emerald-300/95 sm:inline-flex"
          title={t("landing.nav.engineHint")}
        >
          <span className="relative flex h-1.5 w-1.5" aria-hidden>
            <span className="command-pulse absolute inset-0 rounded-full bg-emerald-400/70" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          {t("landing.nav.engineActive")}
        </span>
      </div>

      <div className="mx-auto hidden items-center gap-0.5 md:flex">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = item.kind === "route" && (pathname === item.href || pathname.startsWith(`${item.href}/`));
          const className = cn(
            "group relative inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors",
            active ? "bg-white/8 text-ink" : "text-ink-muted hover:bg-white/5 hover:text-ink",
          );
          if (item.kind === "hash") {
            return (
              <a key={item.href} href={howHref} className={className} onClick={scrollToHow}>
                <Icon size={14} strokeWidth={1.75} className="opacity-80" aria-hidden />
                {t(item.key)}
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-3 -bottom-0.5 h-px origin-left rounded-full bg-[color-mix(in_srgb,var(--color-brand)_80%,white)] transition-transform duration-[var(--duration-base)] ease-[var(--ease-out-soft)]",
                    "scale-x-0 group-hover:scale-x-100 group-focus-visible:scale-x-100",
                  )}
                />
              </a>
            );
          }
          return (
            <Link key={item.href} href={item.href} className={className} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)}>
              <Icon size={14} strokeWidth={1.75} className="opacity-80" aria-hidden />
              {t(item.key)}
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-3 -bottom-0.5 h-px origin-left rounded-full bg-[color-mix(in_srgb,var(--color-brand)_80%,white)] transition-transform duration-[var(--duration-base)] ease-[var(--ease-out-soft)]",
                  active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100 group-focus-visible:scale-x-100",
                )}
              />
            </Link>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <LanguageSwitcher />
        <ButtonLink href="/login" variant="ghost" size="sm" className="hidden text-ink-muted hover:text-ink sm:inline-flex">
          {t("auth.register.signIn")}
        </ButtonLink>
        <ButtonLink href="/dashboard/generate" size="sm" className="command-cta relative overflow-hidden shadow-[var(--shadow-command-cta)]">
          <span className="relative z-[1]">{t("landing.nav.generate")}</span>
          <span aria-hidden className="command-cta-shine pointer-events-none absolute inset-0" />
        </ButtonLink>
        <button
          type="button"
          className="btn-base inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-control)] text-ink-muted hover:bg-white/8 hover:text-ink md:hidden"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? t("landing.nav.closeMenu") : t("landing.nav.openMenu")}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={18} strokeWidth={1.75} aria-hidden /> : <Menu size={18} strokeWidth={1.75} aria-hidden />}
        </button>
      </div>
    </nav>
  );

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-3 pt-3 sm:px-5 sm:pt-4">
      {reduce ? (
        bar
      ) : (
        <motion.div
          className="pointer-events-none flex w-full justify-center"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          {bar}
        </motion.div>
      )}

      <div
        id={panelId}
        hidden={!open}
        className={cn(
          "pointer-events-auto absolute inset-x-3 top-[calc(100%+0.5rem)] overflow-hidden rounded-2xl border border-white/12 bg-[color-mix(in_srgb,var(--color-surface)_92%,transparent)] shadow-[var(--shadow-command)] backdrop-blur-xl md:hidden",
          open && "motion-enter",
        )}
      >
        <div className="flex flex-col gap-1 px-3 py-3">
          <div className="mb-1 flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-emerald-300/90 sm:hidden">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
            {t("landing.nav.engineActive")}
          </div>
          {NAV.map((item) => {
            const Icon = item.icon;
            if (item.kind === "hash") {
              return (
                <a
                  key={item.href}
                  href={howHref}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-3 text-[15px] font-medium text-ink hover:bg-white/6"
                  onClick={scrollToHow}
                >
                  <Icon size={16} strokeWidth={1.75} aria-hidden />
                  {t(item.key)}
                </a>
              );
            }
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex items-center gap-2.5 rounded-xl px-3 py-3 text-[15px] font-medium hover:bg-white/6", active ? "bg-white/8 text-ink" : "text-ink")}
                onClick={() => setOpen(false)}
              >
                <Icon size={16} strokeWidth={1.75} aria-hidden />
                {t(item.key)}
              </Link>
            );
          })}
          <div className="mt-1 flex flex-col gap-2 border-t border-white/10 pt-3">
            <ButtonLink href="/login" variant="secondary" size="md" className="w-full" onClick={() => setOpen(false)}>
              {t("auth.register.signIn")}
            </ButtonLink>
            <ButtonLink href="/dashboard/generate" size="md" className="command-cta w-full" onClick={() => setOpen(false)}>
              {t("landing.nav.generate")}
            </ButtonLink>
          </div>
        </div>
      </div>
    </header>
  );
}
