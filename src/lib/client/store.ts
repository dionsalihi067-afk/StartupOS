"use client";

import * as React from "react";
import type { BusinessPackage } from "@/lib/types";

/**
 * Local-first project persistence. Projects are stored in localStorage so the
 * platform works fully without a backend database. A storage-event subscription
 * keeps multiple tabs in sync.
 */

const KEY = "startupos.projects.v1";
const ACTIVE_KEY = "startupos.activeProject.v1";

function read(): BusinessPackage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BusinessPackage[]) : [];
  } catch {
    return [];
  }
}

function write(projects: BusinessPackage[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(projects));
    window.dispatchEvent(new Event("startupos:projects"));
  } catch {
    /* quota or serialization error — non-fatal */
  }
}

export function listProjects(): BusinessPackage[] {
  return read().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getProject(id: string): BusinessPackage | undefined {
  return read().find((p) => p.id === id);
}

export function saveProject(pkg: BusinessPackage): void {
  const all = read().filter((p) => p.id !== pkg.id);
  all.push(pkg);
  write(all);
  setActiveProjectId(pkg.id);
}

export function deleteProject(id: string): void {
  write(read().filter((p) => p.id !== id));
}

export function setActiveProjectId(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_KEY, id);
  window.dispatchEvent(new Event("startupos:projects"));
}

export function getActiveProjectId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_KEY);
}

export function useProjects(): {
  projects: BusinessPackage[];
  active: BusinessPackage | null;
  activeId: string | null;
  refresh: () => void;
} {
  const [projects, setProjects] = React.useState<BusinessPackage[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    setProjects(listProjects());
    setActiveId(getActiveProjectId());
  }, []);

  React.useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("startupos:projects", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("startupos:projects", handler);
      window.removeEventListener("storage", handler);
    };
  }, [refresh]);

  const active = React.useMemo(
    () => projects.find((p) => p.id === activeId) ?? projects[0] ?? null,
    [projects, activeId],
  );

  return { projects, active, activeId, refresh };
}
