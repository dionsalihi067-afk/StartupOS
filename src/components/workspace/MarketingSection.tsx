"use client";

import * as React from "react";
import { Mail, MessageCircle, Megaphone, Instagram, Facebook, Linkedin } from "lucide-react";
import type { Brand, Marketing, WhatsAppFlow, WhatsAppNode } from "@/lib/types";
import { SvgRender } from "@/components/ui/Svg";
import { Card, CardBody, SectionTitle, Badge } from "@/components/ui/primitives";
import { CopyButton, DownloadButton } from "@/components/ui/actions";
import { downloadSvg, downloadSvgAsPng, downloadText } from "@/lib/client/download";
import { getSwatch } from "@/lib/engine/color";
import { cn, slugify } from "@/lib/utils";

type Tab = "strategy" | "instagram" | "facebook" | "linkedin" | "email" | "whatsapp";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "strategy", label: "Strategy", icon: <Megaphone size={15} /> },
  { id: "instagram", label: "Instagram", icon: <Instagram size={15} /> },
  { id: "facebook", label: "Facebook Ads", icon: <Facebook size={15} /> },
  { id: "linkedin", label: "LinkedIn", icon: <Linkedin size={15} /> },
  { id: "email", label: "Email", icon: <Mail size={15} /> },
  { id: "whatsapp", label: "WhatsApp", icon: <MessageCircle size={15} /> },
];

export function MarketingSection({ marketing, brand }: { marketing: Marketing; brand: Brand }) {
  const [tab, setTab] = React.useState<Tab>("strategy");

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition",
              tab === t.id ? "border-brand bg-brand-soft text-white" : "border-border bg-surface text-ink-muted hover:text-ink",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "strategy" && <StrategyView marketing={marketing} />}
      {tab === "instagram" && <InstagramView marketing={marketing} brand={brand} />}
      {tab === "facebook" && <FacebookView marketing={marketing} brand={brand} />}
      {tab === "linkedin" && <LinkedInView marketing={marketing} />}
      {tab === "email" && <EmailView marketing={marketing} brand={brand} />}
      {tab === "whatsapp" && <WhatsAppView marketing={marketing} brand={brand} />}
    </div>
  );
}

function StrategyView({ marketing }: { marketing: Marketing }) {
  const s = marketing.strategy;
  return (
    <div className="space-y-7">
      <Card>
        <CardBody>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-brand-2">Positioning</div>
          <p className="mt-2 text-lg leading-relaxed">{s.positioning}</p>
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardBody>
            <SectionTitle title="Channel mix" />
            <div className="mt-4 space-y-3">
              {s.channels.map((c) => (
                <div key={c.channel}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{c.channel}</span>
                    <span className="text-ink-subtle">{c.budgetPercent}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand to-accent" style={{ width: `${Math.min(c.budgetPercent, 100)}%` }} />
                  </div>
                  <p className="mt-1 text-[12px] text-ink-subtle">{c.rationale}</p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <SectionTitle title="KPIs & targets" />
            <div className="mt-4 space-y-2.5">
              {s.kpis.map((k) => (
                <div key={k.metric} className="flex items-center justify-between rounded-lg border border-border bg-bg-elevated px-3.5 py-2.5 text-sm">
                  <span className="text-ink-muted">{k.metric}</span>
                  <span className="font-semibold text-accent">{k.target}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <SectionTitle title="Content pillars" description="Content Strategy Agent" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {s.contentPillars.map((p) => (
              <div key={p.pillar} className="rounded-xl border border-border bg-bg-elevated p-4">
                <div className="font-semibold">{p.pillar}</div>
                <p className="mt-1 text-[13px] text-ink-muted">{p.description}</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {p.sampleTopics.map((t, i) => (
                    <span key={i} className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-ink-muted">{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <SectionTitle title="4-week content calendar" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {s.calendar.map((w) => (
              <div key={w.week} className="rounded-xl border border-border bg-bg-elevated p-4">
                <Badge tone="brand">Week {w.week}</Badge>
                <div className="mt-2 font-semibold">{w.theme}</div>
                <ul className="mt-2 space-y-1 text-[12px] text-ink-muted">
                  {w.deliverables.map((d, i) => (
                    <li key={i}>• {d}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {marketing.contentIdeas.length > 0 && (
        <Card>
          <CardBody>
            <SectionTitle title="Content ideas" description={`${marketing.contentIdeas.length} ready-to-shoot ideas across formats.`} />
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {marketing.contentIdeas.map((idea, i) => (
                <div key={i} className="flex items-start gap-2.5 rounded-lg border border-border bg-bg-elevated px-3.5 py-2.5 text-[13px]">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-white">{i + 1}</span>
                  <span className="text-ink-muted">{idea}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function LinkedInView({ marketing }: { marketing: Marketing }) {
  return (
    <div>
      <SectionTitle eyebrow="Marketing Agent" title="LinkedIn posts" description="Professional, on-brand posts ready to publish." />
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {marketing.linkedin.map((post) => (
          <Card key={post.id}>
            <CardBody className="space-y-3">
              <p className="text-[15px] font-semibold leading-snug">{post.hook}</p>
              <p className="text-[13px] leading-relaxed text-ink-muted">{post.body}</p>
              <div className="flex flex-wrap gap-1.5">
                {post.hashtags.map((h) => (
                  <span key={h} className="text-[12px] font-medium text-brand-2">{h}</span>
                ))}
              </div>
              <div className="flex items-center justify-between pt-1">
                <Badge tone="accent">{post.cta}</Badge>
                <CopyButton text={`${post.hook}\n\n${post.body}\n\n${post.hashtags.join(" ")}`} label="Copy post" />
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

function InstagramView({ marketing, brand }: { marketing: Marketing; brand: Brand }) {
  const slug = slugify(brand.name);
  return (
    <div>
      <SectionTitle eyebrow="Marketing Agent" title="Instagram posts" description="Real, downloadable post creatives with captions and hashtags." />
      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {marketing.instagram.map((post, i) => (
          <Card key={post.id} className="overflow-hidden">
            <div className="aspect-square w-full bg-bg">
              <SvgRender markup={post.creativeSvg} className="h-full w-full" label={post.headline} />
            </div>
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between">
                <Badge tone="accent">{post.format}</Badge>
                <div className="flex gap-1.5">
                  <DownloadButton label="" variant="ghost" onDownload={() => downloadSvgAsPng(`${slug}-ig-${i + 1}.png`, post.creativeSvg)} />
                  <DownloadButton label="SVG" variant="ghost" onDownload={() => downloadSvg(`${slug}-ig-${i + 1}.svg`, post.creativeSvg)} />
                </div>
              </div>
              <p className="text-[13px] leading-relaxed text-ink-muted">{post.caption}</p>
              <div className="flex flex-wrap gap-1.5">
                {post.hashtags.map((h) => (
                  <span key={h} className="text-[12px] font-medium text-brand-2">{h}</span>
                ))}
              </div>
              <CopyButton text={`${post.caption}\n\n${post.hashtags.join(" ")}`} label="Copy caption" />
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

function FacebookView({ marketing, brand }: { marketing: Marketing; brand: Brand }) {
  const slug = slugify(brand.name);
  return (
    <div>
      <SectionTitle eyebrow="Marketing Agent" title="Facebook ads" description="Complete ad creatives with copy, targeting and CPC estimates." />
      <div className="mt-5 space-y-5">
        {marketing.facebookAds.map((ad, i) => (
          <Card key={ad.id} className="overflow-hidden">
            <div className="grid lg:grid-cols-[1.1fr_1fr]">
              <div className="bg-bg p-4">
                <div className="aspect-[1200/628] w-full overflow-hidden rounded-lg">
                  <SvgRender markup={ad.creativeSvg} className="h-full w-full" label={ad.headline} />
                </div>
              </div>
              <CardBody className="space-y-3">
                <div className="flex items-center justify-between">
                  <Badge tone="brand">{ad.objective}</Badge>
                  <span className="text-[12px] text-ink-subtle">Est. CPC {ad.estimatedCpc}</span>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Primary text</div>
                  <p className="mt-1 text-sm leading-relaxed">{ad.primaryText}</p>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Headline</div>
                  <p className="mt-1 text-sm font-semibold">{ad.headline}</p>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Audience</div>
                  <p className="mt-1 text-[13px] text-ink-muted">{ad.audience}</p>
                </div>
                <div className="flex gap-2 pt-1">
                  <CopyButton text={`${ad.primaryText}\n\n${ad.headline}\n${ad.description}\n[${ad.cta}]`} label="Copy ad" />
                  <DownloadButton label="PNG" onDownload={() => downloadSvgAsPng(`${slug}-fb-${i + 1}.png`, ad.creativeSvg)} />
                </div>
              </CardBody>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function EmailView({ marketing, brand }: { marketing: Marketing; brand: Brand }) {
  const { email } = marketing;
  const [idx, setIdx] = React.useState(0);
  const msg = email.sequence[idx] ?? email.sequence[0];
  const slug = slugify(brand.name);

  if (!msg) return <p className="text-ink-muted">No email sequence generated.</p>;

  return (
    <div>
      <SectionTitle eyebrow="Email Agent" title={email.name} description={email.goal} />
      <div className="mt-5 grid gap-5 lg:grid-cols-[300px_1fr]">
        <div className="space-y-2">
          {email.sequence.map((m, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={cn(
                "w-full rounded-xl border p-3.5 text-left transition",
                i === idx ? "border-brand bg-brand-soft" : "border-border bg-surface hover:border-border-strong",
              )}
            >
              <div className="flex items-center justify-between">
                <Badge tone={i === idx ? "brand" : "neutral"}>Day {m.day}</Badge>
                <span className="text-[11px] text-ink-subtle">{m.goal}</span>
              </div>
              <div className="mt-2 truncate text-sm font-semibold">{m.subject}</div>
              <div className="truncate text-[12px] text-ink-subtle">{m.preview}</div>
            </button>
          ))}
        </div>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-bg-elevated px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{msg.subject}</div>
              <div className="truncate text-[12px] text-ink-subtle">{msg.preview}</div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <CopyButton text={msg.bodyText} label="Text" />
              <DownloadButton label="HTML" onDownload={() => downloadText(`${slug}-email-day${msg.day}.html`, msg.bodyHtml, "text/html")} />
            </div>
          </div>
          <iframe title={`Email preview: ${msg.subject}`} srcDoc={msg.bodyHtml} className="h-[560px] w-full bg-white" sandbox="" />
        </Card>
      </div>
    </div>
  );
}

function WhatsAppView({ marketing, brand }: { marketing: Marketing; brand: Brand }) {
  const flows = marketing.whatsapp.flows;
  const [active, setActive] = React.useState(0);
  const flow = flows[active];

  if (!flow) return <p className="text-ink-muted">No chatbot flows generated.</p>;

  return (
    <div>
      <SectionTitle eyebrow="WhatsApp Agent" title="Chatbot flows" description={`${flows.length} distinct, structured flows — tap a flow, then walk it interactively.`} />
      <div className="mt-5 flex flex-wrap gap-2">
        {flows.map((f, i) => (
          <button
            key={f.key}
            onClick={() => setActive(i)}
            className={cn(
              "rounded-lg border px-3.5 py-2 text-sm font-medium transition",
              i === active ? "border-brand bg-brand-soft text-white" : "border-border bg-surface text-ink-muted hover:text-ink",
            )}
          >
            {f.name}
          </button>
        ))}
      </div>
      <WhatsAppFlowView key={flow.key} flow={flow} brand={brand} />
    </div>
  );
}

function WhatsAppFlowView({ flow, brand }: { flow: WhatsAppFlow; brand: Brand }) {
  const nodeMap = React.useMemo(() => new Map(flow.nodes.map((n) => [n.id, n])), [flow.nodes]);
  const [history, setHistory] = React.useState<WhatsAppNode[]>(() => (flow.nodes[0] ? [flow.nodes[0]] : []));
  const primary = getSwatch(brand.palette, "primary");

  function advance(nextId: string) {
    const node = nodeMap.get(nextId);
    if (!node) return;
    setHistory((h) => [...h, node]);
    // Auto-advance through linear (non-branching) bot/user nodes.
    if (node.next && !node.options) {
      const follow = nodeMap.get(node.next);
      if (follow) setTimeout(() => setHistory((h) => [...h, follow]), 400);
    }
  }

  function restart() {
    setHistory(flow.nodes[0] ? [flow.nodes[0]] : []);
  }

  const last = history[history.length - 1];
  const options = last?.options;
  const linearNext = last && !last.options && last.next ? last.next : null;

  return (
    <div>
      <SectionTitle eyebrow="WhatsApp Agent" title={flow.name} description={flow.goal} />
      <div className="mt-5 grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Phone */}
        <div className="mx-auto w-full max-w-[380px]">
          <div className="overflow-hidden rounded-[28px] border-4 border-[#1a1a22] bg-[#0b141a] shadow-2xl">
            <div className="flex items-center gap-3 px-4 py-3" style={{ background: "#1f2c34" }}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ background: primary }}>
                {brand.name.charAt(0)}
              </span>
              <div>
                <div className="text-sm font-semibold text-white">{brand.name}</div>
                <div className="text-[11px] text-[#8696a0]">online</div>
              </div>
            </div>
            <div className="flex h-[460px] flex-col gap-2 overflow-y-auto p-4" style={{ background: "#0b141a" }}>
              {history.map((node, i) => (
                <div key={`${node.id}-${i}`} className={cn("flex", node.speaker === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className="max-w-[78%] rounded-xl px-3 py-2 text-[13px] leading-relaxed"
                    style={node.speaker === "user" ? { background: "#005c4b", color: "#e9edef" } : { background: "#202c33", color: "#e9edef" }}
                  >
                    {node.message}
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-1.5 border-t border-[#1f2c34] p-3" style={{ background: "#111b21" }}>
              {options?.map((o) => (
                <button
                  key={o.next + o.label}
                  onClick={() => advance(o.next)}
                  className="w-full rounded-lg border border-[#2a3942] px-3 py-2 text-left text-[13px] text-[#e9edef] transition hover:bg-[#202c33]"
                >
                  {o.label}
                </button>
              ))}
              {linearNext && (
                <button onClick={() => advance(linearNext)} className="w-full rounded-lg px-3 py-2 text-center text-[13px] font-semibold text-white" style={{ background: primary }}>
                  Continue
                </button>
              )}
              {!options && !linearNext && (
                <button onClick={restart} className="w-full rounded-lg border border-[#2a3942] px-3 py-2 text-center text-[13px] text-[#8696a0] hover:bg-[#202c33]">
                  ↺ Restart conversation
                </button>
              )}
            </div>
          </div>
          <p className="mt-3 text-center text-[12px] text-ink-subtle">Interactive preview — tap the replies to walk the flow.</p>
        </div>

        {/* Flow map */}
        <Card>
          <CardBody>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold">Conversation flow ({flow.nodes.length} nodes)</div>
              <CopyButton text={JSON.stringify(flow, null, 2)} label="Export flow" />
            </div>
            <div className="space-y-2.5">
              {flow.nodes.map((n) => (
                <div key={n.id} className="rounded-lg border border-border bg-bg-elevated p-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={n.speaker === "bot" ? "brand" : "accent"}>{n.speaker}</Badge>
                    <code className="text-[11px] text-ink-subtle">{n.id}</code>
                  </div>
                  <p className="mt-1.5 text-[13px] text-ink-muted">{n.message}</p>
                  {n.options && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {n.options.map((o) => (
                        <span key={o.next + o.label} className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-ink-muted">
                          {o.label} → {o.next}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
