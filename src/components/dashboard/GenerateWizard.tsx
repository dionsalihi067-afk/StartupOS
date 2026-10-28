"use client";

import * as React from "react";
import { AlertCircle, Check, ChevronDown, Loader2 } from "lucide-react";
import type { BusinessInput } from "@/lib/types";
import { retryAfterMinutes, useGeneration, type AgentState } from "@/lib/client/useGeneration";
import { Button, Card, CardBody, CardHeader, ProgressBar } from "@/components/ui/primitives";
import { Provenance } from "@/components/ui/Provenance";
import { InlineNotice } from "@/components/dashboard/EmptyState";
import { DiscoveryWizard, resetDiscoveryDraft } from "@/components/discovery/DiscoveryWizard";
import { useT } from "@/i18n/client";
import type { StepKey } from "@/i18n/labels";
import type { MessageKey } from "@/i18n/messages";
import { useRouter } from "@/i18n/navigation";
import type { Translator } from "@/i18n/translator";
import { isChatCapabilityReady, isImageCapabilityReady, isSearchCapabilityReady, type ProviderStatusPayload } from "@/lib/client/provider-status";
import { cn } from "@/lib/utils";

function stepLabel(agent: AgentState, t: Translator): string {
  return t.optional(`steps.${agent.key as StepKey}`) ?? agent.label;
}

/** Groups real orchestration steps into human-readable phases (keys match backend AgentKey). */
const PHASES: { id: "identity" | "research" | "strategy" | "presence" | "launch"; keys: string[] }[] = [
  { id: "identity", keys: ["brand", "design", "logo", "persona"] },
  { id: "research", keys: ["competitor", "market"] },
  { id: "strategy", keys: ["pricing", "strategy"] },
  { id: "presence", keys: ["website", "seo", "marketing", "email", "whatsapp"] },
  { id: "launch", keys: ["growth", "launch", "publisher"] },
];

type PhaseStatus = "pending" | "running" | "done" | "partial";

function phaseStatus(agents: AgentState[], keys: string[]): PhaseStatus {
  const subset = agents.filter((a) => keys.includes(a.key));
  if (subset.length === 0) return "pending";
  if (subset.some((a) => a.status === "running")) return "running";
  const finished = subset.every((a) => a.status === "done" || a.status === "error");
  if (!finished) return "pending";
  if (subset.some((a) => a.status === "error")) return "partial";
  return "done";
}

/** Last submitted answers, so "Try again" after a failure re-sends exactly the same input. */
let lastInput: BusinessInput | null = null;

export function GenerateWizard() {
  const router = useRouter();
  const t = useT();
  const { state, run, reset } = useGeneration();
  const [status, setStatus] = React.useState<ProviderStatusPayload | null>(null);
  const errorRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    fetch("/api/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: ProviderStatusPayload | null) => s && setStatus(s))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    if (state.status === "complete" && state.result) {
      const id = state.result.id;
      const timer = setTimeout(() => {
        resetDiscoveryDraft();
        lastInput = null;
        reset();
        router.push(`/dashboard/projects/${id}`);
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [state.status, state.result, router, reset]);

  React.useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state.status]);

  function generate(input: BusinessInput) {
    lastInput = input;
    void run(input);
  }

  if (state.status === "running" || state.status === "complete") {
    const title = lastInput?.discovery?.business.name || lastInput?.idea || "";
    return <GenerationProgress state={state} businessIdea={title} />;
  }

  // Retrying immediately after a rate limit is always rejected, so only offer "Try again" for other failures.
  const rateLimited = state.error === "rateLimited";
  const errorMessage =
    rateLimited && state.retryAfterSeconds
      ? t("errors.generation.rateLimitedRetry", { minutes: retryAfterMinutes(state.retryAfterSeconds) })
      : t(`errors.generation.${state.error ?? "server"}`);

  // Until /api/status loads, do not claim logo/research are available (chat ≠ image).
  const chatReady = status ? isChatCapabilityReady(status) : false;
  const imageReady = status ? isImageCapabilityReady(status) : false;
  const searchReady = status ? isSearchCapabilityReady(status) : false;
  const outputs: { key: MessageKey; available: boolean }[] = [
    { key: "generate.outputs.brand", available: true },
    { key: "generate.outputs.logo", available: imageReady },
    { key: "generate.outputs.website", available: true },
    { key: "generate.outputs.marketing", available: true },
    { key: "generate.outputs.research", available: searchReady },
    { key: "generate.outputs.plan", available: true },
  ];

  return (
    <div className="space-y-4">
      {state.status === "error" && (
        <div ref={errorRef} tabIndex={-1} className="mx-auto max-w-3xl outline-none">
          <InlineNotice
            tone="danger"
            title={t("generate.errorTitle")}
            action={
              lastInput && !rateLimited ? (
                <Button size="sm" variant="secondary" onClick={() => lastInput && generate(lastInput)}>
                  {t("common.tryAgain")}
                </Button>
              ) : undefined
            }
          >
            {errorMessage}
          </InlineNotice>
        </div>
      )}
      <DiscoveryWizard
        onSubmit={generate}
        aside={
          <Card>
            <CardHeader title={t("generate.whatWillBeCreated")} />
            <CardBody className="space-y-4">
              <ul className="grid gap-2 text-[13px] text-ink-muted sm:grid-cols-2">
                {outputs.map((x) => (
                  <li key={x.key} className={cn("flex gap-2.5", !x.available && "text-ink-subtle")}>
                    <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-subtle" />
                    <span>
                      {t(x.key)}
                      {!x.available && <span className="ml-1.5 text-[12px]">{t("common.notAvailable")}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              {status && (
                <div className="space-y-1.5 rounded-lg bg-surface-2 p-3 text-[12.5px] text-ink-muted">
                  <p>{chatReady ? t("generate.aiOn") : t("generate.aiOff")}</p>
                  {status.llmConfigReason === "localhost-in-production" && (
                    <p>{t("generate.aiLocalhostBlocked")}</p>
                  )}
                  {status.engine === "deterministic" && !chatReady && (
                    <p>{t("generate.aiDeterministicNote")}</p>
                  )}
                  {chatReady && !imageReady && <p>{t("generate.imageOff")}</p>}
                  {!searchReady && <p>{t("generate.searchOff")}</p>}
                </div>
              )}
            </CardBody>
          </Card>
        }
      />
    </div>
  );
}

function GenerationProgress({
  state,
  businessIdea,
}: {
  state: ReturnType<typeof useGeneration>["state"];
  businessIdea: string;
}) {
  const t = useT();
  const complete = state.status === "complete";
  const outcome = state.result?.meta.quality?.outcome;
  const degraded = complete && outcome === "degraded";
  const provisional = complete && outcome === "provisional";
  const limited = degraded || provisional;
  // Avoid Array.prototype.findLast — not available in every embedded browser runtime.
  const current = [...state.agents].reverse().find((a) => a.status === "running");
  const doneCount = state.agents.filter((a) => a.status === "done" || a.status === "error").length;
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  const phases = PHASES.map((p) => ({
    ...p,
    status: complete ? (phaseStatus(state.agents, p.keys) === "partial" ? "partial" : "done") : phaseStatus(state.agents, p.keys),
  }));

  return (
    <div className="mx-auto max-w-3xl motion-enter">
      <Card className="overflow-hidden border-border/80 shadow-[var(--shadow-elevated)]">
        <div className="relative overflow-hidden border-b border-border">
          <div aria-hidden className="gen-blueprint absolute inset-0 opacity-40" />
          {!complete && <div aria-hidden className="gen-sweep absolute inset-y-0 left-0 w-1/3 opacity-60" />}
          <CardBody className="relative p-6 sm:p-7">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border",
                  complete && !limited
                    ? "bg-success/10 text-success"
                    : limited
                      ? "bg-warning/10 text-warning"
                      : "bg-brand-soft text-brand shadow-[0_0_24px_-8px_color-mix(in_srgb,var(--color-brand)_55%,transparent)]",
                )}
              >
                {complete && !limited ? (
                  <Check size={18} aria-hidden />
                ) : limited ? (
                  <AlertCircle size={18} aria-hidden />
                ) : (
                  <Loader2 size={18} className="animate-spin" aria-hidden />
                )}
              </span>
              <div className="min-w-0">
                <h2 className="text-[16px] font-semibold tracking-tight text-ink">
                  {complete
                    ? provisional
                      ? t("generate.progress.readyProvisional")
                      : degraded
                        ? t("generate.progress.readyLimited")
                        : t("generate.progress.ready")
                    : t("generate.progress.creating")}
                </h2>
                <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-muted">{businessIdea}</p>
                {degraded && (
                  <p className="mt-1.5 text-[12.5px] text-ink-muted">{t("generate.progress.readyLimitedBody")}</p>
                )}
                {provisional && (
                  <p className="mt-1.5 text-[12.5px] text-ink-muted">{t("generate.progress.readyProvisionalBody")}</p>
                )}
              </div>
            </div>

            <div
              className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5"
              aria-hidden={complete}
            >
              {phases.map((phase) => (
                <div
                  key={phase.id}
                  className={cn(
                    "rounded-lg border px-2.5 py-2.5 transition-[border-color,background-color,box-shadow] duration-[var(--duration-base)]",
                    phase.status === "done" || phase.status === "partial"
                      ? "border-brand/35 bg-brand-soft/80 shadow-[0_0_20px_-12px_color-mix(in_srgb,var(--color-brand)_50%,transparent)]"
                      : phase.status === "running"
                        ? "border-brand/50 bg-surface-2 ring-1 ring-brand/25"
                        : "border-border/80 bg-surface/60",
                  )}
                >
                  <span
                    className={cn(
                      "mb-1.5 block h-1 w-8 rounded-full",
                      phase.status === "done"
                        ? "bg-success"
                        : phase.status === "running"
                          ? "bg-brand"
                          : phase.status === "partial"
                            ? "bg-warning"
                            : "bg-border-strong",
                    )}
                  />
                  <span
                    className={cn(
                      "block truncate text-[11px] font-medium",
                      phase.status === "pending" ? "text-ink-subtle" : "text-ink",
                    )}
                  >
                    {t(`generate.progress.phases.${phase.id}.title`)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 text-[12.5px]">
                <span className="text-ink-muted" aria-live="polite">
                  {complete
                    ? limited
                      ? t("generate.progress.openingLimited")
                      : t("generate.progress.opening")
                    : current
                      ? t("generate.progress.current", { step: stepLabel(current, t) })
                      : t("generate.progress.starting")}
                </span>
                <span className="tabular-nums text-ink-subtle">
                  {t("generate.progress.stepCount", { done: doneCount, total: state.agents.length })}
                </span>
              </div>
              <ProgressBar value={state.progress} label={t("generate.progress.progressAria")} />
            </div>
          </CardBody>
        </div>

        <ol className="space-y-0" aria-label={t("generate.progress.phasesLabel")}>
          {phases.map((phase) => (
            <PhaseRow key={phase.id} id={phase.id} status={phase.status} />
          ))}
        </ol>

        <div className="border-t border-border">
          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            aria-expanded={detailsOpen}
            className="flex w-full items-center justify-between gap-2 px-5 py-3 text-left text-[13px] font-medium text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            {t("generate.progress.showSteps")}
            <ChevronDown size={15} className={cn("shrink-0 transition-transform", detailsOpen && "rotate-180")} aria-hidden />
          </button>
          {detailsOpen && (
            <ol className="grid border-t border-border sm:grid-cols-2">
              {state.agents.map((a) => (
                <StepRow key={a.key} agent={a} />
              ))}
            </ol>
          )}
        </div>
      </Card>
      <p className="mt-3 text-center text-[12.5px] text-ink-subtle">{t("generate.progress.keepOpen")}</p>
    </div>
  );
}

function PhaseRow({ id, status }: { id: (typeof PHASES)[number]["id"]; status: PhaseStatus }) {
  const t = useT();
  const statusText =
    status === "done"
      ? t("generate.progress.done")
      : status === "running"
        ? t("generate.progress.inProgress")
        : status === "partial"
          ? t("generate.progress.fallback")
          : t("generate.progress.waiting");

  return (
    <li className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5 last:border-b-0">
      <span className="flex min-w-0 items-center gap-3">
        {status === "done" ? (
          <Check size={15} className="shrink-0 text-success" aria-hidden />
        ) : status === "running" ? (
          <Loader2 size={15} className="shrink-0 animate-spin text-brand" aria-hidden />
        ) : status === "partial" ? (
          <AlertCircle size={15} className="shrink-0 text-warning" aria-hidden />
        ) : (
          <span aria-hidden className="mx-[3.5px] h-2 w-2 shrink-0 rounded-full border border-border-strong" />
        )}
        <span>
          <span className={cn("block text-[13.5px] font-medium", status === "pending" ? "text-ink-subtle" : "text-ink")}>
            {t(`generate.progress.phases.${id}.title`)}
          </span>
          <span className="block text-[12px] text-ink-subtle">{t(`generate.progress.phases.${id}.body`)}</span>
        </span>
        <span className="sr-only">{statusText}</span>
      </span>
      {status === "partial" && (
        <span className="shrink-0 text-[12px] text-ink-subtle">{t("generate.progress.fallbackUsed")}</span>
      )}
    </li>
  );
}

function StepRow({ agent }: { agent: AgentState }) {
  const t = useT();
  const statusText =
    agent.status === "done"
      ? t("generate.progress.done")
      : agent.status === "running"
        ? t("generate.progress.inProgress")
        : agent.status === "error"
          ? t("generate.progress.fallback")
          : t("generate.progress.waiting");
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5 text-[13px] sm:odd:border-r">
      <span className="flex min-w-0 items-center gap-2.5">
        {agent.status === "done" ? (
          <Check size={14} className="shrink-0 text-success" aria-hidden />
        ) : agent.status === "running" ? (
          <Loader2 size={14} className="shrink-0 animate-spin text-ink" aria-hidden />
        ) : agent.status === "error" ? (
          <AlertCircle size={14} className="shrink-0 text-warning" aria-hidden />
        ) : (
          <span aria-hidden className="mx-[3px] h-2 w-2 shrink-0 rounded-full border border-border-strong" />
        )}
        <span className={cn("truncate", agent.status === "pending" ? "text-ink-subtle" : "text-ink")}>{stepLabel(agent, t)}</span>
        <span className="sr-only">{statusText}</span>
      </span>
      {agent.status === "done" && agent.source && <Provenance kind={agent.source === "llm" ? "ai" : "template"} />}
      {agent.status === "error" && <span className="shrink-0 text-[12px] text-ink-subtle">{t("generate.progress.fallbackUsed")}</span>}
    </li>
  );
}
