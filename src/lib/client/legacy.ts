"use client";

import { ApiError, apiFetch } from "@/lib/client/businesses";
import type { ImportResult } from "@/lib/businesses/types";

/**
 * Projects created before accounts existed live in this browser's
 * localStorage. They are never deleted or modified here: importing copies a
 * project into the account, and only a confirmed import is recorded in a
 * separate per-account map.
 */

const PROJECTS_KEY = "startupos.projects.v1";
const MIGRATION_KEY = "startupos.migration.v1";
const SKIP_KEY = "startupos.migrationSkipped.v1";

export interface LegacyProject {
  id: string;
  name: string;
  raw: unknown;
}

/** Reads local projects without validating their content; the server validates on import. */
export function readLegacyProjects(): LegacyProject[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(PROJECTS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((raw: unknown) => {
      if (!raw || typeof raw !== "object") return [];
      const id = (raw as { id?: unknown }).id;
      if (typeof id !== "string" || !id) return [];
      const name = (raw as { brand?: { name?: unknown } }).brand?.name;
      return [{ id, name: typeof name === "string" && name ? name : id, raw }];
    });
  } catch {
    return [];
  }
}

type MigrationMap = Record<string, Record<string, string>>;

function readMap(): MigrationMap {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(MIGRATION_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as MigrationMap) : {};
  } catch {
    return {};
  }
}

function recordImported(userId: string, legacyId: string, businessId: string) {
  const map = readMap();
  map[userId] = { ...map[userId], [legacyId]: businessId };
  window.localStorage.setItem(MIGRATION_KEY, JSON.stringify(map));
}

/** Local projects this account has not yet imported. */
export function pendingLegacyProjects(userId: string): LegacyProject[] {
  const done = readMap()[userId] ?? {};
  return readLegacyProjects().filter((p) => !done[p.id]);
}

export function isMigrationSkipped(userId: string): boolean {
  try {
    return window.sessionStorage.getItem(SKIP_KEY) === userId;
  } catch {
    return false;
  }
}

export function skipMigration(userId: string) {
  try {
    window.sessionStorage.setItem(SKIP_KEY, userId);
  } catch {
    /* ignore */
  }
}

export type ImportOutcome = { project: LegacyProject; status: ImportResult["status"] | "network" };

/**
 * Imports projects one at a time. Each success is recorded immediately, so an
 * interruption (refresh, network loss, sign-out) leaves completed imports
 * recorded and the rest still pending. The server deduplicates, so retrying
 * never creates copies.
 */
export async function importLegacyProjects(
  userId: string,
  projects: LegacyProject[],
  onProgress?: (done: number) => void,
): Promise<ImportOutcome[]> {
  const outcomes: ImportOutcome[] = [];
  for (const project of projects) {
    try {
      const { result } = await apiFetch<{ result: ImportResult }>("/api/businesses/import", {
        method: "POST",
        body: JSON.stringify({ project: project.raw }),
      });
      if ((result.status === "imported" || result.status === "duplicate") && result.businessId) {
        recordImported(userId, project.id, result.businessId);
      }
      outcomes.push({ project, status: result.status });
    } catch (err) {
      const rejected = err instanceof ApiError && (err.status === 400 || err.status === 413);
      outcomes.push({ project, status: rejected ? "invalid" : "network" });
    }
    onProgress?.(outcomes.length);
  }
  return outcomes;
}
