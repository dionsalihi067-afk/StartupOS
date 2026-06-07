"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Check, Loader2, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { BUSINESS_STYLES, businessInputSchema } from "@/lib/schemas";
import type { BusinessInput, BusinessStyle } from "@/lib/types";
import { useGeneration } from "@/lib/client/useGeneration";
import { saveProject } from "@/lib/client/store";
import { Button, Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "An organic coffee roastery and café for remote workers",
  "A boutique pilates studio for busy professionals",
  "An AI scheduling app for independent barbershops",
  "A premium skincare brand for sensitive skin",
];

const STYLE_HINTS: Record<BusinessStyle, string> = {
  "Premium / Luxury": "Elegant, exclusive, refined",
  "Modern / Minimal": "Clean, calm, considered",
  "Bold / Energetic": "Punchy, vibrant, high-impact",
  "Friendly / Approachable": "Warm, human, welcoming",
  "Corporate / Professional": "Trustworthy, precise, established",
  "Playful / Creative": "Fun, imaginative, original",
  "Tech / Futuristic": "Sharp, innovative, forward",
  "Organic / Natural": "Earthy, honest, grounded",
};

type FormState = {
  idea: string;
  audience: string;
  location: string;
  budget: string;
  style: BusinessStyle;
};

export function GenerateWizard() {
  const router = useRouter();
  const { state, run } = useGeneration();
  const [form, setForm] = React.useState<FormState>({
    idea: "",
    audience: "",
    location: "",
    budget: "",
    style: "Modern / Minimal",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const savedRef = React.useRef(false);

  // Persist + redirect on completion.
  React.useEffect(() => {
    if (state.status === "complete" && state.result && !savedRef.current) {
      savedRef.current = true;
      saveProject(state.result);
      const id = state.result.id;
      const t = setTimeout(() => router.push(`/dashboard/projects/${id}`), 900);
      return () => clearTimeout(t);
    }
  }, [state.status, state.result, router]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = businessInputSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(fieldErrors)) if (v?.[0]) next[k] = v[0];
      setErrors(next);
      return;
    }
    setErrors({});
    savedRef.current = false;
    void run(parsed.data as BusinessInput);
  }

  if (state.status === "running" || state.status === "complete") {
    return <GenerationProgress state={state} />;
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
      <div className="space-y-6">
        <Field label="Business idea" error={errors.idea} hint="Describe what you want to build in a sentence or two.">
          <textarea
            value={form.idea}
            onChange={(e) => update("idea", e.target.value)}
            rows={3}
            placeholder="e.g. An organic coffee roastery and café for remote workers"
            className="w-full resize-none rounded-xl border border-border bg-surface px-4 py-3 text-[15px] text-ink outline-none transition placeholder:text-ink-subtle focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
          <div className="mt-2.5 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => update("idea", ex)}
                className="rounded-full border border-border bg-surface px-3 py-1 text-[12px] text-ink-muted transition hover:border-brand/40 hover:text-ink"
              >
                {ex}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Target audience" error={errors.audience}>
            <Input value={form.audience} onChange={(v) => update("audience", v)} placeholder="e.g. Remote workers, 25–40" />
          </Field>
          <Field label="Location" error={errors.location}>
            <Input value={form.location} onChange={(v) => update("location", v)} placeholder="e.g. Austin, Texas" />
          </Field>
        </div>

        <Field label="Budget" error={errors.budget} hint="Used to calibrate pricing and channel mix.">
          <Input value={form.budget} onChange={(v) => update("budget", v)} placeholder="e.g. $10,000" />
        </Field>

        <Field label="Brand style" error={errors.style}>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2">
            {BUSINESS_STYLES.map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => update("style", style)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-all",
                  form.style === style
                    ? "border-brand bg-brand-soft shadow-[inset_0_0_0_1px_rgba(109,94,252,0.4)]"
                    : "border-border bg-surface hover:border-border-strong",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold">{style}</span>
                  {form.style === style && <Check size={14} className="text-brand-2" />}
                </div>
                <span className="mt-0.5 block text-[11px] text-ink-subtle">{STYLE_HINTS[style]}</span>
              </button>
            ))}
          </div>
        </Field>
      </div>

      {/* Summary / action panel */}
      <div className="lg:sticky lg:top-8 lg:self-start">
        <div className="card overflow-hidden">
          <div className="border-b border-border bg-bg-elevated p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles size={16} className="text-brand-2" /> Generation summary
            </div>
          </div>
          <div className="space-y-3 p-5 text-sm">
            <SummaryRow label="Idea" value={form.idea || "—"} />
            <SummaryRow label="Audience" value={form.audience || "—"} />
            <SummaryRow label="Location" value={form.location || "—"} />
            <SummaryRow label="Budget" value={form.budget || "—"} />
            <SummaryRow label="Style" value={form.style} />
          </div>
          <div className="border-t border-border p-5">
            <Button type="submit" size="lg" className="w-full">
              <Wand2 size={17} /> Generate business
            </Button>
            <p className="mt-3 text-center text-[12px] text-ink-subtle">
              Multi-agent · 30 deliverables · live web research
            </p>
          </div>
        </div>
      </div>
    </form>
  );
}

function GenerationProgress({ state }: { state: ReturnType<typeof useGeneration>["state"] }) {
  const isError = state.status === "error";
  return (
    <div className="mx-auto max-w-2xl">
      <div className="card overflow-hidden">
        <div className="bg-radial-brand p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white shadow-glow">
            {state.status === "complete" ? <Check size={26} /> : <Loader2 size={26} className="animate-spin" />}
          </div>
          <h2 className="text-xl font-bold">
            {state.status === "complete" ? "Your business is ready!" : "Building your business…"}
          </h2>
          <p className="mt-1.5 text-sm text-ink-muted">
            {state.status === "complete"
              ? "Opening your workspace…"
              : state.currentLabel
                ? `Running ${state.currentLabel}`
                : "Orchestrating agents…"}
          </p>

          <div className="mx-auto mt-6 h-2 w-full max-w-sm overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-brand to-accent"
              animate={{ width: `${state.progress}%` }}
              transition={{ ease: "easeOut", duration: 0.4 }}
            />
          </div>
          <div className="mt-2 text-[12px] font-medium text-ink-subtle">{state.progress}%</div>
        </div>

        <div className="grid grid-cols-1 gap-1.5 p-5 sm:grid-cols-2">
          {state.agents.map((a) => (
            <div
              key={a.key}
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition",
                a.status === "running"
                  ? "border-brand/40 bg-brand-soft/40"
                  : a.status === "done"
                    ? "border-border bg-surface"
                    : a.status === "error"
                      ? "border-warning/30 bg-warning/5"
                      : "border-border/60 bg-transparent opacity-60",
              )}
            >
              <span className="flex items-center gap-2.5">
                <StatusDot status={a.status} />
                <span className={cn(a.status === "pending" && "text-ink-muted")}>{a.label}</span>
              </span>
              {a.status === "done" && a.source && (
                <Badge tone={a.source === "llm" ? "brand" : "neutral"} className="!text-[9px]">
                  {a.source === "llm" ? "AI" : "Engine"}
                </Badge>
              )}
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {isError && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm"
          >
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-danger" />
            <div>
              <div className="font-semibold text-danger">Generation failed</div>
              <p className="mt-0.5 text-ink-muted">{state.error}</p>
              <Button size="sm" variant="secondary" className="mt-3" onClick={() => window.location.reload()}>
                <RotateCcw size={14} /> Try again
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusDot({ status }: { status: AgentStatusType }) {
  if (status === "done") return <Check size={15} className="text-success" />;
  if (status === "running") return <Loader2 size={15} className="animate-spin text-brand-2" />;
  if (status === "error") return <AlertCircle size={15} className="text-warning" />;
  return <span className="h-2.5 w-2.5 rounded-full border border-border-strong" />;
}

type AgentStatusType = "pending" | "running" | "done" | "error";

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label className="text-sm font-semibold">{label}</label>
        {hint && !error && <span className="text-[12px] text-ink-subtle">{hint}</span>}
        {error && <span className="text-[12px] font-medium text-danger">{error}</span>}
      </div>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-11 w-full rounded-xl border border-border bg-surface px-4 text-[15px] text-ink outline-none transition placeholder:text-ink-subtle focus:border-brand focus:ring-2 focus:ring-brand/30"
    />
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-ink-subtle">{label}</span>
      <span className="line-clamp-2 text-right font-medium">{value}</span>
    </div>
  );
}
