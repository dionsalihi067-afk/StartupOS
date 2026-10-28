"use client";

import * as React from "react";
import type { BusinessInput, BusinessPackage, OrchestrationEvent } from "@/lib/types";
import { businessCreated, redirectToLogin, refreshBusinesses } from "@/lib/client/businesses";

export type GenStatus = "idle" | "running" | "complete" | "error";

/**
 * Stable codes the UI maps to translated messages (`errors.generation.*`).
 * `detached`: the connection dropped after the business was created; the server keeps generating it.
 */
export type GenerationErrorCode =
  | "invalidInput"
  | "network"
  | "requestFailed"
  | "forbidden"
  | "rateLimited"
  | "connectionClosed"
  | "detached"
  | "server";

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
  error: GenerationErrorCode | null;
  /** Seconds until the rate limit resets, from the server's Retry-After header. */
  retryAfterSeconds: number | null;
  businessId: string | null;
}

const INITIAL_AGENTS: AgentState[] = [
  { key: "brand", label: "Brand Agent", status: "pending" },
  { key: "design", label: "Design Agent", status: "pending" },
  { key: "logo", label: "Logo Agent", status: "pending" },
  { key: "persona", label: "Persona Agent", status: "pending" },
  { key: "competitor", label: "Competitor Agent", status: "pending" },
  { key: "market", label: "Market Research Agent", status: "pending" },
  { key: "pricing", label: "Pricing Agent", status: "pending" },
  { key: "strategy", label: "Strategy Agent", status: "pending" },
  { key: "website", label: "Website Agent", status: "pending" },
  { key: "seo", label: "SEO Agent", status: "pending" },
  { key: "marketing", label: "Marketing Agent", status: "pending" },
  { key: "email", label: "Email Agent", status: "pending" },
  { key: "whatsapp", label: "WhatsApp Agent", status: "pending" },
  { key: "growth", label: "Growth Agent", status: "pending" },
  { key: "launch", label: "Launch Agent", status: "pending" },
  { key: "publisher", label: "Publisher Agent", status: "pending" },
];

const IDLE: GenerationState = {
  status: "idle",
  progress: 0,
  agents: INITIAL_AGENTS,
  currentLabel: null,
  result: null,
  error: null,
  retryAfterSeconds: null,
  businessId: null,
};

class GenerationError extends Error {
  constructor(
    readonly code: GenerationErrorCode,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(code);
  }
}

const MAX_RETRY_AFTER_SECONDS = 24 * 60 * 60;

/** Whole seconds from a Retry-After header; anything else (missing, dates, junk) is ignored. */
export function parseRetryAfter(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null;
  const seconds = Number(value.trim());
  return seconds >= 1 && seconds <= MAX_RETRY_AFTER_SECONDS ? seconds : null;
}

/** Minutes to show the user, rounded up so "try again in N min" is never too early. */
export function retryAfterMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}

/*
 * Generation state lives at module level rather than in component state so a
 * run survives the wizard remounting (e.g. when the interface language changes
 * mid-generation). The server saves the business, whether or not anything is mounted.
 */
let current: GenerationState = IDLE;
const listeners = new Set<() => void>();

function setState(next: GenerationState | ((prev: GenerationState) => GenerationState)) {
  current = typeof next === "function" ? next(current) : next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function apply(event: OrchestrationEvent) {
  setState((prev) => {
    const agents = prev.agents.map((a) => ({ ...a }));
    const find = (key?: string) => agents.find((a) => a.key === key);

    switch (event.type) {
      case "created":
        return { ...prev, businessId: event.businessId ?? null };
      case "agent-start": {
        const a = find(event.agent);
        if (a) a.status = "running";
        return { ...prev, agents, currentLabel: event.label ?? prev.currentLabel, progress: event.progress ?? prev.progress };
      }
      case "agent-complete": {
        const a = find(event.agent);
        if (a) {
          // Fallback/recovery must not look like a clean AI success in the progress UI.
          a.status = event.fallback ? "error" : "done";
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
          error: null,
        };
      case "error":
        // Persisted success is authoritative; a late stream error must not erase it.
        if (prev.status === "complete" && prev.result) return prev;
        return { ...prev, status: "error", error: "server" };
      default:
        return prev;
    }
  });
  if (event.type === "created" || (event.type === "error" && current.status !== "complete")) void refreshBusinesses();
  if (event.type === "complete" && event.result) businessCreated(event.result.id);
}

async function run(input: BusinessInput) {
  if (current.status === "running") return;
  setState({ ...IDLE, status: "running", agents: INITIAL_AGENTS.map((a) => ({ ...a })) });

  try {
    let res: Response;
    try {
      res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    } catch {
      throw new GenerationError("network");
    }

    if (res.status === 401) {
      redirectToLogin();
      throw new GenerationError("requestFailed");
    }
    if (res.status === 403) throw new GenerationError("forbidden");
    if (res.status === 429) throw new GenerationError("rateLimited", parseRetryAfter(res.headers.get("Retry-After")));
    if (!res.ok || !res.body) {
      throw new GenerationError(res.status === 400 || res.status === 422 ? "invalidInput" : "requestFailed");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finished = false;

    const handleChunk = (chunk: string) => {
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) return;
      try {
        const event = JSON.parse(line.slice(6)) as OrchestrationEvent;
        if (event.type === "complete" || event.type === "error") finished = true;
        apply(event);
      } catch {
        /* ignore malformed frame */
      }
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) handleChunk(chunk);
    }
    if (buffer.trim()) handleChunk(buffer);

    if (!finished) throw new GenerationError("connectionClosed");
  } catch (err) {
    setState((prev) => {
      // Stream already delivered a terminal complete — do not downgrade to error/detached.
      if (prev.status === "complete" && prev.result) return prev;
      const code = err instanceof GenerationError ? err.code : "connectionClosed";
      const retryAfterSeconds = err instanceof GenerationError ? err.retryAfterSeconds : null;
      return { ...prev, status: "error", error: code === "connectionClosed" && prev.businessId ? "detached" : code, retryAfterSeconds };
    });
    if (current.status !== "complete") void refreshBusinesses();
  }
}

function reset() {
  setState({ ...IDLE, agents: INITIAL_AGENTS.map((a) => ({ ...a })) });
}

const getSnapshot = () => current;
const getServerSnapshot = () => IDLE;

export { run as startGeneration, getSnapshot as getGenerationState };

export function useGeneration() {
  const state = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { state, run, reset };
}
