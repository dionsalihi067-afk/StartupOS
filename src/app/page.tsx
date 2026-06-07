"use client";

import Link from "next/link";
import { ArrowRight, Check, Github, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { AGENTS, OUTPUTS } from "@/lib/content";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/primitives";
import { FadeIn, Stagger, StaggerItem } from "@/components/ui/motion";

const FLOW = [
  "Your Idea",
  "Brand",
  "Design",
  "Website",
  "Marketing",
  "Pricing",
  "Competitors",
  "Growth",
  "Launch",
];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 bg-grid" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] bg-radial-brand" />

      {/* Nav */}
      <header className="sticky top-0 z-40">
        <div className="glass border-b border-border">
          <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
            <Link href="/" className="flex items-center gap-2.5">
              <LogoMark />
              <span className="text-[17px] font-bold tracking-tight">StartupOS</span>
            </Link>
            <div className="hidden items-center gap-8 text-sm text-ink-muted md:flex">
              <a href="#agents" className="transition hover:text-ink">Agents</a>
              <a href="#outputs" className="transition hover:text-ink">Outputs</a>
              <a href="#how" className="transition hover:text-ink">How it works</a>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/dashboard">
                <Button variant="ghost" size="sm">Dashboard</Button>
              </Link>
              <Link href="/dashboard/generate">
                <Button size="sm">
                  Launch app <ArrowRight size={15} />
                </Button>
              </Link>
            </div>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-7xl px-5 pb-20 pt-20 text-center sm:px-8 sm:pt-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3.5 py-1.5 text-[13px] text-ink-muted">
            <span className="flex h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_2px_rgba(41,217,194,0.6)]" />
            Multi-agent AI business engine
          </div>
          <h1 className="mx-auto max-w-4xl text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
            One idea in.
            <br />
            <span className="text-gradient">An entire business out.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-ink-muted sm:text-lg">
            StartupOS orchestrates a network of specialized AI agents to generate a complete
            business ecosystem — brand, logo, website, marketing creatives, pricing, and a 90-day
            launch plan — backed by real competitor and market research from live web search.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/dashboard/generate">
              <Button size="lg" className="w-full sm:w-auto">
                <Zap size={17} /> Generate my business
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Explore the dashboard
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-[13px] text-ink-subtle">
            Works instantly — no API key required. Add one to upgrade to live LLM generation.
          </p>
        </motion.div>

        {/* Flow ribbon */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="mx-auto mt-16 max-w-5xl"
        >
          <div className="card overflow-hidden p-1.5">
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-bg-elevated p-4 sm:gap-3">
              {FLOW.map((step, i) => (
                <div key={step} className="flex items-center gap-2 sm:gap-3">
                  <span
                    className={`rounded-lg px-2.5 py-1.5 text-[12px] font-semibold sm:text-sm ${
                      i === 0
                        ? "bg-brand text-white"
                        : "border border-border bg-surface text-ink-muted"
                    }`}
                  >
                    {step}
                  </span>
                  {i < FLOW.length - 1 && <ArrowRight size={14} className="text-ink-subtle" />}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* Agents */}
      <section id="agents" className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <FadeIn className="mx-auto max-w-2xl text-center">
          <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-brand-2">
            The agent network
          </div>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            {AGENTS.length} specialists. One orchestrated system.
          </h2>
          <p className="mt-4 text-ink-muted">
            Each agent owns a domain and communicates through structured JSON. The Competitor and
            Market Research agents pull real data from live web search — no fabricated stats. The
            Publisher Agent assembles everything into a single, polished package.
          </p>
        </FadeIn>

        <Stagger className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((agent) => (
            <StaggerItem key={agent.key}>
              <div className="card group h-full p-5 transition-all duration-300 hover:border-brand/40 hover:shadow-glow">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand-2 transition group-hover:scale-110">
                  <Icon name={agent.icon} size={20} />
                </div>
                <h3 className="mt-4 text-[15px] font-semibold">{agent.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{agent.role}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Outputs */}
      <section id="outputs" className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className="card overflow-hidden">
          <div className="grid gap-10 p-8 sm:p-12 lg:grid-cols-2">
            <FadeIn>
              <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-accent">
                30 real deliverables
              </div>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Everything a launch needs — generated.
              </h2>
              <p className="mt-4 text-ink-muted">
                Not a wall of text. Every output becomes a usable asset: downloadable SVG logos,
                rendered social creatives, ready-to-send HTML emails, interactive chatbot flows, and
                structured strategy you can act on today.
              </p>
              <Link href="/dashboard/generate" className="mt-6 inline-block">
                <Button size="lg">
                  Start generating <ArrowRight size={16} />
                </Button>
              </Link>
            </FadeIn>
            <Stagger className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2" stagger={0.02}>
              {OUTPUTS.map((o) => (
                <StaggerItem key={o} className="flex items-center gap-2.5 text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                    <Check size={12} />
                  </span>
                  <span className="text-ink-muted">{o}</span>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <FadeIn className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">How it works</h2>
        </FadeIn>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {[
            { n: "01", t: "Describe your idea", d: "Enter your idea, audience, location, budget and brand style. That's the only input required." },
            { n: "02", t: "Agents orchestrate", d: "The engine runs all 12 agents in dependency order, streaming live progress as each completes." },
            { n: "03", t: "Get your package", d: "Explore a polished workspace of brand, website, marketing, pricing, growth and launch assets — ready to download." },
          ].map((s, i) => (
            <FadeIn key={s.n} delay={i * 0.1}>
              <div className="card h-full p-7">
                <div className="text-5xl font-bold text-brand/30">{s.n}</div>
                <h3 className="mt-4 text-lg font-semibold">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{s.d}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className="card relative overflow-hidden bg-radial-brand p-10 text-center sm:p-16">
          <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">
            Your business, fully built, in minutes.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-ink-muted">
            Turn a single sentence into a complete, launch-ready business ecosystem.
          </p>
          <Link href="/dashboard/generate" className="mt-8 inline-block">
            <Button size="lg">
              <Zap size={17} /> Generate my business
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row sm:px-8">
          <div className="flex items-center gap-2.5">
            <LogoMark />
            <span className="text-sm font-semibold">StartupOS</span>
          </div>
          <p className="text-[13px] text-ink-subtle">
            Built as a production-grade AI business creation operating system.
          </p>
          <a
            href="https://github.com"
            className="flex items-center gap-2 text-[13px] text-ink-subtle transition hover:text-ink"
          >
            <Github size={15} /> Source
          </a>
        </div>
      </footer>
    </div>
  );
}

function LogoMark() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-accent text-white shadow-[0_4px_12px_-2px_rgba(109,94,252,0.6)]">
      <Zap size={17} strokeWidth={2.5} />
    </span>
  );
}
