import {
  ArrowRight,
  Download,
  Globe,
  Megaphone,
  Palette,
  Rocket,
  Tag,
  Telescope,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { ProductPreview } from "@/components/landing/ProductPreview";
import { Reveal, Stagger, StaggerItem } from "@/components/landing/Reveal";
import { ButtonLink } from "@/components/ui/primitives";
import { ProductWordmark } from "@/components/ui/ProductMark";
import { Link } from "@/i18n/navigation";
import { getTranslator, resolveLocale } from "@/i18n/server";
import type { MessageKey } from "@/i18n/messages";

const FEATURED: { id: "brand" | "website" | "marketing"; icon: LucideIcon }[] = [
  { id: "brand", icon: Palette },
  { id: "website", icon: Globe },
  { id: "marketing", icon: Megaphone },
];

const SUPPORTING: { id: string; icon: LucideIcon }[] = [
  { id: "competitors", icon: Telescope },
  { id: "pricing", icon: Tag },
  { id: "growth", icon: TrendingUp },
  { id: "launch", icon: Rocket },
  { id: "export", icon: Download },
];

const STEPS = ["describe", "review", "work"] as const;
const PILLARS = ["onePlace", "sources", "yours"] as const;

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const t = getTranslator(locale);

  return (
    <div className="landing-premium min-h-screen">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 text-sm font-medium text-ink shadow-[var(--shadow-pop)] focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        {t("common.skipToContent")}
      </a>

      <LandingHeader />

      <main id="main" className="pt-[4.75rem] sm:pt-[5.25rem]">
        <section className="landing-atmosphere relative border-b border-border">
          <div aria-hidden className="landing-grid pointer-events-none absolute inset-0 overflow-hidden opacity-50" />
          <div className="relative mx-auto grid max-w-6xl items-start gap-10 overflow-x-clip px-5 pb-16 pt-8 sm:px-8 sm:pb-20 sm:pt-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-8 lg:overflow-visible lg:pb-24 lg:pt-14">
            <Reveal priority className="max-w-xl lg:pt-4">
              <p className="mb-4 font-display text-2xl font-semibold tracking-tight text-brand sm:text-3xl">StartupOS</p>
              <h1 className="text-balance font-display text-[1.95rem] font-semibold leading-[1.08] tracking-tight text-ink sm:text-4xl lg:text-[2.85rem]">
                {t("landing.hero.title")}
              </h1>
              <p className="mt-5 max-w-xl text-pretty text-[15px] leading-relaxed text-ink-muted sm:text-base">
                {t("landing.hero.body")}
              </p>
              <div className="mt-7 flex flex-col gap-2.5 min-[480px]:flex-row">
                <ButtonLink href="/dashboard/generate" size="lg" className="command-cta group relative overflow-hidden shadow-[var(--shadow-command-cta)]">
                  <span className="relative z-[1] inline-flex items-center gap-2">
                    {t("landing.hero.primary")}{" "}
                    <ArrowRight size={16} aria-hidden className="transition-transform duration-150 group-hover:translate-x-0.5" />
                  </span>
                  <span aria-hidden className="command-cta-shine pointer-events-none absolute inset-0" />
                </ButtonLink>
                <ButtonLink href="/dashboard" size="lg" variant="secondary">
                  {t("landing.hero.secondary")}
                </ButtonLink>
              </div>
              <p className="mt-4 text-[13px] text-ink-subtle">{t("landing.hero.note")}</p>
            </Reveal>

            <Reveal priority delay={0.1} className="min-w-0">
              <ProductPreview />
            </Reveal>
          </div>
        </section>

        <section id="what" className="scroll-mt-28">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <Reveal className="max-w-2xl">
              <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-brand">{t("landing.nav.what")}</p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                {t("landing.what.title")}
              </h2>
              <p className="mt-4 text-[15.5px] leading-relaxed text-ink-muted">{t("landing.what.body")}</p>
            </Reveal>

            <Stagger className="mt-12 grid gap-4 md:grid-cols-3">
              {PILLARS.map((p, i) => (
                <StaggerItem key={p}>
                  <article className="surface-interactive h-full rounded-[var(--radius-card)] border border-border bg-surface/80 p-6 shadow-[var(--shadow-card)] backdrop-blur-sm">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-[13px] font-semibold tabular-nums text-brand">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-ink">
                      {t(`landing.what.pillars.${p}.title`)}
                    </h3>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
                      {t(`landing.what.pillars.${p}.body`)}
                    </p>
                  </article>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        <section id="capabilities" className="scroll-mt-28 border-t border-border bg-bg-elevated/80">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <Reveal className="max-w-2xl">
              <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-brand">
                {t("landing.nav.capabilities")}
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                {t("landing.capabilities.title")}
              </h2>
              <p className="mt-4 text-[15.5px] leading-relaxed text-ink-muted">{t("landing.capabilities.body")}</p>
            </Reveal>

            <Stagger className="mt-12 grid gap-4 lg:grid-cols-3">
              {FEATURED.map((c) => (
                <StaggerItem key={c.id}>
                  <article className="surface-interactive flex h-full flex-col rounded-[var(--radius-card)] border border-border bg-surface/85 p-6 shadow-[var(--shadow-card)] sm:p-7">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                      <c.icon size={18} strokeWidth={1.75} aria-hidden />
                    </div>
                    <h3 className="mt-5 text-base font-semibold tracking-tight text-ink">
                      {t(`landing.capabilities.items.${c.id}.title` as MessageKey)}
                    </h3>
                    <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-ink-muted">
                      {t(`landing.capabilities.items.${c.id}.body` as MessageKey)}
                    </p>
                  </article>
                </StaggerItem>
              ))}
            </Stagger>

            <Stagger className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {SUPPORTING.map((c) => (
                <StaggerItem key={c.id}>
                  <article className="surface-interactive h-full rounded-[var(--radius-card)] border border-border bg-surface/70 px-4 py-5 shadow-[var(--shadow-card)]">
                    <c.icon size={16} strokeWidth={1.75} className="text-ink-muted" aria-hidden />
                    <h3 className="mt-3 text-[13.5px] font-semibold text-ink">
                      {t(`landing.capabilities.items.${c.id}.title` as MessageKey)}
                    </h3>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
                      {t(`landing.capabilities.items.${c.id}.body` as MessageKey)}
                    </p>
                  </article>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        <section id="how" className="scroll-mt-28 border-t border-border">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <Reveal className="max-w-2xl">
              <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-brand">{t("landing.nav.how")}</p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                {t("landing.how.title")}
              </h2>
            </Reveal>

            <ol className="relative mt-14 grid gap-8 md:grid-cols-3 md:gap-6">
              <div
                aria-hidden
                className="pointer-events-none absolute left-0 right-0 top-[22px] hidden h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent md:block"
              />
              {STEPS.map((s, i) => (
                <Reveal key={s} delay={i * 0.06} as="li" className="relative">
                  <div className="relative z-[1] flex h-11 w-11 items-center justify-center rounded-full border border-brand/30 bg-surface text-sm font-semibold tabular-nums text-brand shadow-[var(--shadow-card)]">
                    {i + 1}
                  </div>
                  <h3 className="mt-5 text-[15px] font-semibold tracking-tight text-ink">
                    {t(`landing.how.steps.${s}.title`)}
                  </h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
                    {t(`landing.how.steps.${s}.body`)}
                  </p>
                  <p className="mt-3 text-[12px] font-medium text-ink-subtle">
                    {t("landing.how.step", { number: i + 1 })}
                  </p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <Reveal>
              <div className="relative overflow-hidden rounded-[18px] border border-border bg-surface/90 px-6 py-10 shadow-[var(--shadow-elevated)] sm:px-10 sm:py-12">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_100%_0%,color-mix(in_srgb,var(--color-brand)_18%,transparent),transparent_55%)]"
                />
                <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                  <div className="max-w-xl">
                    <h2 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                      {t("landing.cta.title")}
                    </h2>
                    <p className="mt-2 text-[15px] text-ink-muted">{t("landing.cta.body")}</p>
                  </div>
                  <ButtonLink href="/dashboard/generate" size="lg" className="command-cta relative shrink-0 overflow-hidden shadow-[var(--shadow-command-cta)]">
                    <span className="relative z-[1] inline-flex items-center gap-2">
                      {t("landing.hero.primary")} <ArrowRight size={16} aria-hidden />
                    </span>
                    <span aria-hidden className="command-cta-shine pointer-events-none absolute inset-0" />
                  </ButtonLink>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-bg-elevated/90">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:px-8 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <ProductWordmark />
            <p className="max-w-sm text-[13px] leading-relaxed text-ink-subtle">{t("landing.footer")}</p>
          </div>
          <nav aria-label={t("landing.nav.main")} className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-muted">
            <a href="#what" className="landing-nav-link">
              {t("landing.nav.what")}
            </a>
            <a href="#capabilities" className="landing-nav-link">
              {t("landing.nav.capabilities")}
            </a>
            <a href="#how" className="landing-nav-link">
              {t("landing.nav.how")}
            </a>
            <Link href="/login" className="landing-nav-link">
              {t("auth.register.signIn")}
            </Link>
            <Link href="/dashboard" className="landing-nav-link">
              {t("landing.nav.openApp")}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
