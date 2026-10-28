"use client";

import {
  Globe,
  LayoutGrid,
  Megaphone,
  Palette,
  Rocket,
  Tag,
  Telescope,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { INTL_LOCALE } from "@/i18n/config";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";
import { cn } from "@/lib/utils";

const PREVIEW_NAV: { icon: LucideIcon; labelKey: MessageKey }[] = [
  { icon: LayoutGrid, labelKey: "navigation.overview" },
  { icon: Palette, labelKey: "navigation.brand" },
  { icon: Globe, labelKey: "navigation.website" },
  { icon: Megaphone, labelKey: "navigation.marketing" },
  { icon: Telescope, labelKey: "navigation.competitors" },
  { icon: Tag, labelKey: "navigation.pricing" },
  { icon: TrendingUp, labelKey: "navigation.growth" },
  { icon: Rocket, labelKey: "navigation.launch" },
];

export function ProductPreview({ className }: { className?: string }) {
  const t = useT();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const reduce = useReducedMotion();
  const interactive = ready && !reduce;
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const springX = useSpring(mx, { stiffness: 120, damping: 18, mass: 0.4 });
  const springY = useSpring(my, { stiffness: 120, damping: 18, mass: 0.4 });
  const rotateX = useTransform(springY, [-0.5, 0.5], [10, 2]);
  const rotateY = useTransform(springX, [-0.5, 0.5], [-10, 2]);

  const rows: [MessageKey, string, "success" | "neutral" | "accent"][] = [
    ["workspaceStatus.brand.label", t("status.ready"), "success"],
    ["workspaceStatus.website.label", t("status.ready"), "success"],
    ["workspaceStatus.competitors.label", t("status.notConfigured"), "neutral"],
    ["workspaceStatus.launch.label", "3/10", "accent"],
  ];
  const tone = {
    success: "bg-success/10 text-success",
    neutral: "bg-surface-2 text-ink-muted",
    accent: "bg-brand-soft text-brand",
  };
  const name = t("landing.preview.businessName");

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!interactive || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    mx.set((e.clientX - rect.left) / rect.width - 0.5);
    my.set((e.clientY - rect.top) / rect.height - 0.5);
  }

  function onPointerLeave() {
    mx.set(0);
    my.set(0);
  }

  const frame = (
    <div
      aria-hidden
      className="overflow-hidden rounded-[14px] border border-white/10 bg-surface shadow-[var(--shadow-pop)] ring-1 ring-brand/15"
    >
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-bg-elevated/90 px-3.5 py-2.5">
        <span className="h-2 w-2 rounded-full bg-[#f87171]/70" />
        <span className="h-2 w-2 rounded-full bg-[#fbbf24]/70" />
        <span className="h-2 w-2 rounded-full bg-[#34d399]/70" />
        <span className="ml-2 truncate text-[11px] text-ink-subtle">{name} · StartupOS</span>
      </div>
      <div className="grid min-w-0 xl:grid-cols-[168px_minmax(0,1fr)]">
        <div className="hidden border-r border-border bg-bg-elevated p-2.5 xl:block">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1.5 shadow-[var(--shadow-card)]">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-soft text-[11px] font-semibold text-brand">
              {name.charAt(0)}
            </span>
            <span className="truncate text-[12px] font-medium text-ink">{name}</span>
          </div>
          <div className="mt-2.5 space-y-0.5 text-[12px]">
            {PREVIEW_NAV.map(({ icon: Icon, labelKey }, i) => (
              <div
                key={labelKey}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
                  i === 0 ? "bg-surface-3 text-ink" : "text-ink-muted",
                )}
              >
                <Icon size={13} strokeWidth={1.75} className="shrink-0" />
                <span className="truncate">{t(labelKey)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0 p-4 sm:p-5">
          <div className="flex items-center gap-2 xl:block">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-soft text-[11px] font-semibold text-brand xl:hidden">
              {name.charAt(0)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-base font-semibold tracking-tight text-ink sm:text-lg">{name}</div>
              <div className="truncate text-[13px] text-ink-muted">{t("landing.preview.slogan")}</div>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 overflow-hidden rounded-[10px] border border-border">
              <div className="border-b border-border bg-surface-2/60 px-3.5 py-2 text-[12px] font-semibold text-ink">
                {t("landing.preview.statusTitle")}
              </div>
              {rows.map(([labelKey, status, kind]) => (
                <div
                  key={labelKey}
                  className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-2.5 last:border-0"
                >
                  <span className="min-w-0 truncate text-[12.5px] text-ink">{t(labelKey)}</span>
                  <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium", tone[kind])}>
                    {status}
                  </span>
                </div>
              ))}
            </div>
            <div className="rounded-[10px] border border-border p-3.5">
              <div className="text-[12px] font-semibold text-ink">{t("landing.preview.readiness")}</div>
              <div className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-ink">
                {new Intl.NumberFormat(INTL_LOCALE[t.locale], { style: "percent" }).format(0.3)}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full w-[30%] rounded-full bg-brand" />
              </div>
              <div className="mt-4 flex h-6 overflow-hidden rounded-md border border-border">
                {["#0b1220", "#164e63", "#22d3ee", "#38bdf8", "#e0f2fe"].map((c) => (
                  <span key={c} className="flex-1" style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <figure className={cn("preview-stage", className)}>
      <div
        ref={ref}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        className="relative"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-8 -z-10 rounded-[28px] bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--color-brand)_18%,transparent),transparent_68%)]"
        />
        {interactive ? (
          <motion.div
            className="relative will-change-transform"
            style={{
              rotateX,
              rotateY,
              transformPerspective: 1400,
              transformStyle: "preserve-3d",
            }}
          >
            {frame}
          </motion.div>
        ) : (
          <div className="preview-frame-static relative">{frame}</div>
        )}
      </div>
      <figcaption className="mt-4 text-center text-[12.5px] text-ink-subtle">
        {t("landing.preview.caption")}
      </figcaption>
    </figure>
  );
}
