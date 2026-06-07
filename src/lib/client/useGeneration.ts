"use client";

import * as React from "react";
import type { BusinessInput, BusinessPackage, OrchestrationEvent } from "@/lib/types";

export type GenStatus = "idle" | "running" | "complete" | "error";

export interface AgentState {
  key: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  source?: "llm" | "deterministic";
}

export interface GenerationState {
  status: GenStatus;
  progress: number;
  agents: AgentState[];
  currentLabel: string | null;
  result: BusinessPackage | null;
  error: string | null;
}

const INITIAL_AGENTS: AgentState[] = [
  { key: "brand", label: "Brand Agent", status: "pending" },
  { key: "design", label: "Design Agent", status: "pending" },
  { key: "logo", label: "Logo Agent", status: "pending" },
  { key: "persona", label: "Persona Agent", status: "pending" },
  { key: "competitor", label: "Competitor Agent", status: "pending" },
  { key: "market", label: "Market Research Agent", status: "pending" },
  { key: "pricing", label: "Pricing Agent", status: "pending" },
  { key: "website", label: "Website Agent", status: "pending" },
  { key: "seo", label: "SEO Agent", status: "pending" },
  { key: "marketing", label: "Marketing Agent", status: "pending" },
  { key: "email", label: "Email Agent", status: "pending" },
  { key: "whatsapp", label: "WhatsApp Agent", status: "pending" },
  { key: "growth", label: "Growth Agent", status: "pending" },
  { key: "launch", label: "Launch Agent", status: "pending" },
  { key: "publisher", label: "Publisher Agent", status: "pending" },
];

export function useGeneration() {
  const [state, setState] = React.useState<GenerationState>({
    status: "idle",
    progress: 0,
    agents: INITIAL_AGENTS,
    currentLabel: null,
    result: null,
    error: null,
  });

  const apply = React.useCallback((event: OrchestrationEvent) => {
    setState((prev) => {
      const agents = prev.agents.map((a) => ({ ...a }));
      const find = (key?: string) => agents.find((a) => a.key === key);

      switch (event.type) {
        case "agent-start": {
          const a = find(event.agent);
          if (a) a.status = "running";
          return { ...prev, agents, currentLabel: event.label ?? prev.currentLabel, progress: event.progress ?? prev.progress };
        }
        case "agent-complete": {
          const a = find(event.agent);
          if (a) {
            a.status = "done";
            a.source = event.source;
          }
          return { ...prev, agents, progress: event.progress ?? prev.progress };
        }
        case "agent-error": {
          const a = find(event.agent);
          if (a) a.status = "error";
          return { ...prev, agents, progress: event.progress ?? prev.progress };
        }
        case "complete":
          return {
            ...prev,
            agents: agents.map((a) => (a.status === "pending" || a.status === "running" ? { ...a, status: "done" } : a)),
            status: "complete",
            progress: 100,
            result: event.result ?? null,
          };
        case "error":
          return { ...prev, status: "error", error: event.message ?? "Generation failed." };
        default:
          return prev;
      }
    });
  }, []);

  const run = React.useCallback(
    async (input: BusinessInput) => {
      setState({ status: "running", progress: 0, agents: INITIAL_AGENTS.map((a) => ({ ...a })), currentLabel: null, result: null, error: null });

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });

        if (!res.ok || !res.body) {
          const msg = await res.json().catch(() => null);
          throw new Error(msg?.error ?? `Request failed (${res.status}).`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const line = chunk.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            try {
              apply(JSON.parse(line.slice(6)) as OrchestrationEvent);
            } catch {
              /* ignore malformed frame */
            }
          }
        }
      } catch (err) {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: err instanceof Error ? err.message : "Generation failed unexpectedly.",
        }));
      }
    },
    [apply],
  );

  const reset = React.useCallback(() => {
    setState({ status: "idle", progress: 0, agents: INITIAL_AGENTS.map((a) => ({ ...a })), currentLabel: null, result: null, error: null });
  }, []);

  return { state, run, reset };
}
