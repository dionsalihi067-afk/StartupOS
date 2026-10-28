"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";
import type { BusinessPackage, CustomerPersona, WhatsAppNode } from "@/lib/types";
import { SvgRender } from "@/components/ui/Svg";
import { Badge, Button, Card, CardBody, CardHeader, DataList } from "@/components/ui/primitives";
import { CopyButton, DownloadButton } from "@/components/ui/actions";
import { Tabs, TabPanel } from "@/components/ui/Tabs";
import { Provenance } from "@/components/ui/Provenance";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { downloadSvg, downloadSvgAsPng, downloadText } from "@/lib/client/download";
import { replyToWhatsAppText } from "@/lib/agents/whatsapp-chat";
import { getSwatch, readableTextColor } from "@/lib/engine/color";
import { agentProvenance } from "@/lib/client/insights";
import { useFormat, useT } from "@/i18n/client";
import { cn, slugify } from "@/lib/utils";

type Tab = "strategy" | "content" | "social" | "ads" | "email" | "whatsapp";

export function MarketingSection({ pkg }: { pkg: BusinessPackage }) {
  const t = useT();
  const [tab, setTab] = React.useState<Tab>("strategy");
  const m = pkg.marketing;

  const items: { id: Tab; label: string; count?: number }[] = [
    { id: "strategy", label: t("marketing.tabs.strategy") },
    { id: "content", label: t("marketing.tabs.content") },
    { id: "social", label: t("marketing.tabs.social"), count: m.instagram.length },
    { id: "ads", label: t("marketing.tabs.ads"), count: m.facebookAds.length },
    { id: "email", label: t("marketing.tabs.email"), count: m.email.sequence.length },
    { id: "whatsapp", label: t("marketing.tabs.whatsapp") },
  ];

  return (
    <div className="space-y-5">
      <Tabs variant="segmented" items={items} value={tab} onChange={setTab} label={t("marketing.areasLabel")} idPrefix="marketing" />
      <TabPanel idPrefix="marketing" activeId={tab}>
        {tab === "strategy" && <StrategyView pkg={pkg} />}
        {tab === "content" && <ContentView pkg={pkg} />}
        {tab === "social" && <SocialView pkg={pkg} />}
        {tab === "ads" && <AdsView pkg={pkg} />}
        {tab === "email" && <EmailView pkg={pkg} />}
        {tab === "whatsapp" && <WhatsAppView pkg={pkg} />}
      </TabPanel>
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[12.5px] font-medium text-ink-subtle">{children}</h3>;
}

/* ------------------------------ Strategy ------------------------------- */

function StrategyView({ pkg }: { pkg: BusinessPackage }) {
  const t = useT();
  const format = useFormat();
  const s = pkg.marketing.strategy;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t("marketing.positioning")} />
        <CardBody>
          <p className="max-w-3xl text-[15px] leading-relaxed text-ink">{s.positioning}</p>
          {s.messaging.length > 0 && (
            <div className="mt-5">
              <SubHeading>{t("marketing.keyMessages")}</SubHeading>
              <ul className="mt-2 space-y-1.5">
                {s.messaging.map((msg, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-ink-muted">
                    <span aria-hidden className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-ink-subtle" />
                    {msg}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title={t("marketing.channelMix.title")} description={t("marketing.channelMix.description")} />
          <ul className="divide-y divide-border">
            {s.channels.map((c) => (
              <li key={c.channel} className="px-5 py-3.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-ink">{c.channel}</span>
                  <span className="tabular-nums text-ink-muted">{format.percent(c.budgetPercent)}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(c.budgetPercent, 100)}%` }} />
                </div>
                <p className="mt-1.5 text-[12.5px] leading-snug text-ink-subtle">{c.rationale}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title={t("marketing.suggestedTargets")} actions={<Provenance kind="estimate" />} />
          <ul className="divide-y divide-border">
            {s.kpis.map((k) => (
              <li key={k.metric} className="flex items-baseline justify-between gap-4 px-5 py-3 text-sm">
                <span className="text-ink-muted">{k.metric}</span>
                <span className="shrink-0 font-medium tabular-nums text-ink">{k.target}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-5 py-3 text-[12px] text-ink-subtle">{t("marketing.targetsNote")}</p>
        </Card>
      </div>

      <PersonaCard persona={pkg.persona} provenance={agentProvenance(pkg, "Persona Agent")} />
    </div>
  );
}

function PersonaCard({ persona, provenance }: { persona: CustomerPersona; provenance: "ai" | "template" }) {
  const t = useT();
  return (
    <Card>
      <CardHeader
        title={t("marketing.persona.title")}
        description={t("marketing.persona.description")}
        actions={<Provenance kind={provenance} />}
      />
      <CardBody>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div>
            <div className="text-[15px] font-semibold text-ink">{persona.archetype}</div>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{persona.bio}</p>
            <DataList
              className="mt-4"
              items={[
                { label: t("marketing.persona.exampleName"), value: persona.name },
                { label: t("marketing.persona.age"), value: persona.age },
                { label: t("marketing.persona.occupation"), value: persona.occupation },
                { label: t("marketing.persona.channels"), value: persona.channels.join(", ") },
              ]}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {(
              [
                ["goals", t("marketing.persona.goals"), persona.goals],
                ["painPoints", t("marketing.persona.painPoints"), persona.painPoints],
                ["objections", t("marketing.persona.objections"), persona.objections],
              ] as const
            ).map(([id, label, list]) => (
              <div key={id}>
                <SubHeading>{label}</SubHeading>
                <ul className="mt-2 space-y-1.5">
                  {list.map((g, i) => (
                    <li key={i} className="text-[13px] leading-snug text-ink-muted">
                      {g}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/* ---------------------------- Content plan ----------------------------- */

function ContentView({ pkg }: { pkg: BusinessPackage }) {
  const t = useT();
  const s = pkg.marketing.strategy;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t("marketing.contentPillars.title")} description={t("marketing.contentPillars.description")} />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-2">
            {s.contentPillars.map((p) => (
              <div key={p.pillar} className="rounded-lg border border-border p-4">
                <div className="text-sm font-medium text-ink">{p.pillar}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{p.description}</p>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {p.sampleTopics.map((topic, i) => (
                    <li key={i} className="max-w-full">
                      <Badge wrap>{topic}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("marketing.calendar")} />
        <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          {s.calendar.map((w) => (
            <div key={w.week} className="p-5">
              <div className="text-[12px] font-medium text-ink-subtle">{t("marketing.week", { week: w.week })}</div>
              <div className="mt-1 text-sm font-medium text-ink">{w.theme}</div>
              <ul className="mt-3 space-y-1.5">
                {w.deliverables.map((d, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-snug text-ink-muted">
                    <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-subtle" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------- Social posts ----------------------------- */

function SocialView({ pkg }: { pkg: BusinessPackage }) {
  const t = useT();
  const slug = slugify(pkg.brand.name);
  const posts = pkg.marketing.instagram;
  if (!posts.length) {
    return <EmptyState compact title={t("marketing.social.emptyTitle")} description={t("marketing.social.emptyDescription")} action={null} />;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {posts.map((post, i) => (
        <Card key={post.id} className="flex flex-col overflow-hidden">
          <div className="aspect-square w-full border-b border-border bg-surface-2">
            <SvgRender markup={post.creativeSvg} className="h-full w-full" label={post.headline} />
          </div>
          <CardBody className="flex flex-1 flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <Badge tone="outline">{t("marketing.social.format", { format: post.format })}</Badge>
              <div className="flex gap-1">
                <DownloadButton
                  label="PNG"
                  variant="ghost"
                  ariaLabel={t("marketing.social.downloadPngAria", { number: i + 1 })}
                  onDownload={() => downloadSvgAsPng(`${slug}-ig-${i + 1}.png`, post.creativeSvg)}
                />
                <DownloadButton
                  label="SVG"
                  variant="ghost"
                  ariaLabel={t("marketing.social.downloadSvgAria", { number: i + 1 })}
                  onDownload={() => downloadSvg(`${slug}-ig-${i + 1}.svg`, post.creativeSvg)}
                />
              </div>
            </div>
            <p className="flex-1 text-[13px] leading-relaxed text-ink-muted">{post.caption}</p>
            <p className="text-[12.5px] text-ink-subtle">{post.hashtags.join(" ")}</p>
            <CopyButton text={`${post.caption}\n\n${post.hashtags.join(" ")}`} label={t("marketing.social.copyCaption")} className="self-start" />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

/* --------------------------------- Ads --------------------------------- */

function AdsView({ pkg }: { pkg: BusinessPackage }) {
  const t = useT();
  const slug = slugify(pkg.brand.name);
  const ads = pkg.marketing.facebookAds;
  if (!ads.length) {
    return <EmptyState compact title={t("marketing.ads.emptyTitle")} description={t("marketing.ads.emptyDescription")} action={null} />;
  }
  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-ink-muted">{t("marketing.ads.draftNotice")}</p>
      {ads.map((ad, i) => (
        <Card key={ad.id} className="overflow-hidden">
          <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="border-b border-border bg-surface-2 p-4 lg:border-b-0 lg:border-r">
              <div className="aspect-[1200/628] w-full overflow-hidden rounded-md">
                <SvgRender markup={ad.creativeSvg} className="h-full w-full" label={ad.headline} />
              </div>
            </div>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="outline">{t("marketing.ads.objective", { objective: ad.objective })}</Badge>
                {ad.estimatedCpc && <Provenance kind="estimate" label={t("marketing.ads.cpc", { cpc: ad.estimatedCpc })} />}
              </div>
              <div>
                <SubHeading>{t("marketing.ads.headline")}</SubHeading>
                <p className="mt-1 text-sm font-medium text-ink">{ad.headline}</p>
              </div>
              <div>
                <SubHeading>{t("marketing.ads.primaryText")}</SubHeading>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{ad.primaryText}</p>
              </div>
              <div>
                <SubHeading>{t("marketing.ads.audience")}</SubHeading>
                <p className="mt-1 text-[13px] text-ink-muted">{ad.audience}</p>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <CopyButton text={`${ad.primaryText}\n\n${ad.headline}\n${ad.description}\n[${ad.cta}]`} label={t("marketing.ads.copyText")} />
                <DownloadButton
                  label={t("marketing.ads.downloadPng")}
                  ariaLabel={t("marketing.ads.downloadPngAria", { number: i + 1 })}
                  onDownload={() => downloadSvgAsPng(`${slug}-fb-${i + 1}.png`, ad.creativeSvg)}
                />
              </div>
            </CardBody>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* -------------------------------- Email -------------------------------- */

function EmailView({ pkg }: { pkg: BusinessPackage }) {
  const t = useT();
  const { email } = pkg.marketing;
  const [idx, setIdx] = React.useState(0);
  const msg = email.sequence[idx] ?? email.sequence[0];
  const slug = slugify(pkg.brand.name);

  if (!msg) {
    return <EmptyState compact title={t("marketing.email.emptyTitle")} description={t("marketing.email.emptyDescription")} action={null} />;
  }

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-ink-muted">{t("marketing.email.draftNotice")}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{email.name}</h3>
          <p className="mt-0.5 text-[13px] text-ink-muted">{email.goal}</p>
        </div>
        <Provenance kind={agentProvenance(pkg, "Email Agent")} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="h-fit overflow-hidden">
          <ol aria-label={t("marketing.email.listLabel")} className="divide-y divide-border">
            {email.sequence.map((m, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setIdx(i)}
                  aria-current={i === idx ? "true" : undefined}
                  className={cn(
                    "w-full px-4 py-3 text-left transition-colors",
                    i === idx ? "bg-surface-2" : "hover:bg-surface-2",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 text-[12px] text-ink-subtle">
                    <span className="shrink-0 font-medium">{t("marketing.email.day", { day: m.day })}</span>
                    <span className="truncate">{m.goal}</span>
                  </div>
                  <div className={cn("mt-1 truncate text-[13px]", i === idx ? "font-medium text-ink" : "text-ink-muted")}>
                    {m.subject}
                  </div>
                </button>
              </li>
            ))}
          </ol>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-ink">{msg.subject}</div>
              <div className="truncate text-[12.5px] text-ink-subtle">{msg.preview}</div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <CopyButton text={msg.bodyText} label={t("marketing.email.copyText")} />
              <DownloadButton
                label="HTML"
                ariaLabel={t("marketing.email.downloadHtmlAria")}
                onDownload={() => downloadText(`${slug}-email-day${msg.day}.html`, msg.bodyHtml, "text/html")}
              />
            </div>
          </div>
          <iframe title={t("marketing.email.previewTitle", { subject: msg.subject })} srcDoc={msg.bodyHtml} className="h-[560px] w-full bg-white" sandbox="" />
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------ WhatsApp ------------------------------- */

function WhatsAppView({ pkg }: { pkg: BusinessPackage }) {
  const t = useT();
  const { brand } = pkg;
  const flow = pkg.marketing.whatsapp;
  const nodeMap = React.useMemo(() => new Map(flow.nodes.map((n) => [n.id, n])), [flow.nodes]);
  const [history, setHistory] = React.useState<WhatsAppNode[]>(() => (flow.nodes[0] ? [flow.nodes[0]] : []));
  const [draft, setDraft] = React.useState("");
  const primary = getSwatch(brand.palette, "primary");
  const onPrimary = readableTextColor(primary);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history.length]);

  function advance(nextId: string, choice?: string) {
    const node = nodeMap.get(nextId);
    if (!node) return;
    setHistory((h) => [
      ...h,
      ...(choice ? [{ id: `choice-${h.length}`, speaker: "user" as const, message: choice }] : []),
      node,
    ]);
    // Auto-advance through linear (non-branching) bot/user nodes.
    if (node.next && !node.options) {
      const follow = nodeMap.get(node.next);
      if (follow) setTimeout(() => setHistory((h) => [...h, follow]), 400);
    }
  }

  function sendFreeText(event?: React.FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const lastNode = history[history.length - 1];
    const reply = replyToWhatsAppText({ text, flow, brand, current: lastNode, pkg });
    setDraft("");
    setHistory((h) => [
      ...h,
      { id: `user-${h.length}`, speaker: "user" as const, message: text },
      { id: `bot-${h.length}`, speaker: "bot" as const, message: reply.message },
    ]);
    if (reply.nextNodeId) {
      const node = nodeMap.get(reply.nextNodeId);
      if (node && node.message !== reply.message) {
        setTimeout(() => setHistory((h) => [...h, node]), 350);
      }
    }
  }

  function restart() {
    setHistory(flow.nodes[0] ? [flow.nodes[0]] : []);
    setDraft("");
  }

  const last = history[history.length - 1];
  const options = last?.options;
  const linearNext = last && !last.options && last.next ? last.next : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{flow.name}</h3>
          <p className="mt-0.5 text-[13px] text-ink-muted">{flow.goal}</p>
        </div>
        <Provenance kind={agentProvenance(pkg, "WhatsApp Agent")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[360px]">
          <div className="overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-[var(--shadow-pop)]">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold"
                style={{ background: primary, color: onPrimary }}
                aria-hidden
              >
                {brand.name.charAt(0)}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">{brand.name}</div>
                <div className="text-[11.5px] text-ink-subtle">{t("marketing.whatsapp.conversationPreview")}</div>
              </div>
            </div>
            <div ref={scrollRef} className="flex h-[420px] flex-col gap-2 overflow-y-auto bg-surface-2 p-4" aria-live="polite">
              {history.map((node, i) => (
                <div key={`${node.id}-${i}`} className={cn("flex", node.speaker === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-xl px-3 py-2 text-[13px] leading-relaxed",
                      node.speaker === "user" ? "bg-brand-soft text-ink" : "bg-surface text-ink shadow-[var(--shadow-card)]",
                    )}
                  >
                    <span className="sr-only">{node.speaker === "user" ? `${t("marketing.whatsapp.customer")}: ` : `${brand.name}: `}</span>
                    {node.message}
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-1.5 border-t border-border p-3">
              {options?.map((o) => (
                <button
                  key={o.next + o.label}
                  type="button"
                  onClick={() => advance(o.next, o.label)}
                  className="w-full rounded-md border border-border-strong px-3 py-2 text-left text-[13px] text-ink transition-colors hover:bg-surface-2"
                >
                  {o.label}
                </button>
              ))}
              {linearNext && (
                <Button className="w-full" onClick={() => advance(linearNext)}>
                  {t("common.continue")}
                </Button>
              )}
              <form className="flex gap-2 pt-1" onSubmit={sendFreeText}>
                <label className="sr-only" htmlFor="wa-composer">
                  {t("marketing.whatsapp.composerLabel")}
                </label>
                <input
                  id="wa-composer"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t("marketing.whatsapp.composerPlaceholder")}
                  className="h-9 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 text-[13px] text-ink outline-none focus-visible:border-brand"
                  autoComplete="off"
                />
                <Button type="submit" size="sm" disabled={!draft.trim()}>
                  {t("marketing.whatsapp.send")}
                </Button>
              </form>
              <Button variant="secondary" className="w-full" onClick={restart}>
                <RotateCcw size={14} aria-hidden /> {t("marketing.whatsapp.restart")}
              </Button>
            </div>
          </div>
          <p className="mt-3 text-center text-[12px] text-ink-subtle">{t("marketing.whatsapp.simulatedNote")}</p>
        </div>

        <Card>
          <CardHeader
            title={t("marketing.whatsapp.flowTitle")}
            description={t("marketing.whatsapp.messageCount", { count: flow.nodes.length })}
            actions={<CopyButton text={JSON.stringify(flow, null, 2)} label={t("marketing.whatsapp.copyJson")} />}
          />
          <ol className="divide-y divide-border">
            {flow.nodes.map((n) => (
              <li key={n.id} className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <Badge tone={n.speaker === "bot" ? "accent" : "neutral"}>{n.speaker === "bot" ? t("marketing.whatsapp.business") : t("marketing.whatsapp.customer")}</Badge>
                  <code className="font-mono text-[11.5px] text-ink-subtle">{n.id}</code>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{n.message}</p>
                {n.options && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {n.options.map((o) => (
                      <li key={o.next + o.label}>
                        <Badge tone="outline">
                          {o.label} → {o.next}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
