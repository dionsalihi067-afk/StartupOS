"use client";

import * as React from "react";
import type { BusinessDetail, BusinessSummary } from "@/lib/businesses/types";
import { applyBrandEdit, type BrandEdit } from "@/lib/brand-edit";
import type { GeneratedSectionId } from "@/lib/dependencies";
import type { SectionOutcome } from "@/lib/regenerate-core";
import type { BusinessInput } from "@/lib/types";
import type { WebsiteBrief } from "@/lib/website/brief";

/**
 * Client access to the signed-in user's businesses. The server is the source
 * of truth; this module only caches responses for the current page session.
 */

/** Remembers which business the user last opened. Only a pointer: the server decides what can be loaded. */
const ACTIVE_KEY = "startupos.activeProject.v1";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: Record<string, unknown> | null,
  ) {
    super(code);
  }
}

export function redirectToLogin() {
  const [, locale, ...rest] = window.location.pathname.split("/");
  const next = `/${rest.join("/")}${window.location.search}`;
  window.location.assign(`/${locale || "sq"}/login?next=${encodeURIComponent(next)}&expired=1`);
}

export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new ApiError(0, "network", null);
  }
  if (res.status === 401) {
    redirectToLogin();
    throw new ApiError(401, "unauthorized", null);
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) throw new ApiError(res.status, typeof body?.error === "string" ? body.error : "unavailable", body);
  return body as T;
}

/* ------------------------------- List ---------------------------------- */

interface ListSnapshot {
  status: "idle" | "loading" | "ready" | "error";
  businesses: BusinessSummary[];
  activeId: string | null;
  /** Cursor for older businesses beyond the first page; null when everything is loaded. */
  nextCursor: string | null;
  /** True once older pages were appended; a refresh then only replaces the first page. */
  extended: boolean;
}

const SERVER_SNAPSHOT: ListSnapshot = { status: "idle", businesses: [], activeId: null, nextCursor: null, extended: false };
let snapshot: ListSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function setSnapshot(next: Partial<ListSnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readActiveId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveBusinessId(id: string | null) {
  try {
    if (id) window.localStorage.setItem(ACTIVE_KEY, id);
    else window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* storage unavailable: the pointer just isn't remembered */
  }
  setSnapshot({ activeId: id });
}

export function refreshBusinesses(): Promise<void> {
  if (inflight) return inflight;
  if (snapshot.status !== "ready") setSnapshot({ status: "loading", activeId: snapshot.activeId ?? readActiveId() });
  inflight = apiFetch<BusinessPageResponse>("/api/businesses")
    .then(({ businesses, nextCursor }) => setSnapshot({ status: "ready", ...mergeFirstPage(snapshot, businesses, nextCursor) }))
    .catch(() => {
      if (snapshot.status !== "ready") setSnapshot({ status: "error" });
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

interface BusinessPageResponse {
  businesses: BusinessSummary[];
  nextCursor: string | null;
}

/**
 * Applies a refreshed first page without dropping older pages the user already loaded.
 * A loaded business missing from the new first page is kept only if it sorts after
 * that page; otherwise it would have been included, so it was deleted elsewhere.
 */
export function mergeFirstPage(
  current: Pick<ListSnapshot, "businesses" | "nextCursor" | "extended">,
  page: BusinessSummary[],
  nextCursor: string | null,
): Pick<ListSnapshot, "businesses" | "nextCursor" | "extended"> {
  const last = page[page.length - 1];
  if (!current.extended || nextCursor === null || !last) return { businesses: page, nextCursor, extended: false };
  const fresh = new Set(page.map((b) => b.id));
  const older = current.businesses.filter(
    (b) => !fresh.has(b.id) && (b.updatedAt < last.updatedAt || (b.updatedAt === last.updatedAt && b.id < last.id)),
  );
  return { businesses: [...page, ...older], nextCursor: current.nextCursor, extended: true };
}

let moreInflight: Promise<void> | null = null;

/** Appends the next page of older businesses. Rejects on failure so the caller can show it. */
export function loadMoreBusinesses(): Promise<void> {
  if (moreInflight) return moreInflight;
  const cursor = snapshot.nextCursor;
  if (!cursor) return Promise.resolve();
  moreInflight = apiFetch<BusinessPageResponse>(`/api/businesses?cursor=${encodeURIComponent(cursor)}`)
    .then(({ businesses, nextCursor }) => {
      const known = new Set(snapshot.businesses.map((b) => b.id));
      setSnapshot({
        businesses: [...snapshot.businesses, ...businesses.filter((b) => !known.has(b.id))],
        nextCursor,
        extended: true,
      });
    })
    .finally(() => {
      moreInflight = null;
    });
  return moreInflight;
}

/**
 * The business the dashboard sections work on. A remembered business outside the
 * loaded pages is resolved from its own detail request rather than replaced by
 * another one; `undefined` means that lookup is still pending.
 */
export function pickActive(
  businesses: BusinessSummary[],
  activeId: string | null,
  activeDetail: DetailState | undefined,
): BusinessSummary | null | undefined {
  const ready = businesses.filter((b) => b.status === "ready");
  const fallback = ready[0] ?? null;
  if (!activeId) return fallback;
  if (businesses.some((b) => b.id === activeId)) return ready.find((b) => b.id === activeId) ?? fallback;
  if (!activeDetail || activeDetail.status === "loading") return undefined;
  const business = activeDetail.business;
  return activeDetail.status === "ready" && business?.status === "ready" ? business : fallback;
}

const POLL_WHILE_GENERATING_MS = 5000;

export function useBusinesses() {
  const state = React.useSyncExternalStore(subscribe, () => snapshot, () => SERVER_SNAPSHOT);

  React.useEffect(() => {
    if (snapshot.status === "idle") void refreshBusinesses();
  }, []);

  const generating = state.businesses.some((b) => b.status === "generating");
  React.useEffect(() => {
    if (!generating) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshBusinesses();
    }, POLL_WHILE_GENERATING_MS);
    return () => window.clearInterval(timer);
  }, [generating]);

  const listed = state.status === "ready" && state.activeId !== null && state.businesses.some((b) => b.id === state.activeId);
  const unlistedId = state.status === "ready" && state.activeId !== null && !listed ? state.activeId : null;
  const activeDetail = React.useSyncExternalStore(
    subscribe,
    () => (unlistedId ? details.get(unlistedId) : undefined),
    () => undefined,
  );
  React.useEffect(() => {
    if (unlistedId && !details.has(unlistedId)) void loadBusiness(unlistedId);
  }, [unlistedId]);

  const picked = React.useMemo(
    () => pickActive(state.businesses, state.activeId, activeDetail),
    [state.businesses, state.activeId, activeDetail],
  );

  return {
    businesses: state.businesses,
    active: picked ?? null,
    ready: state.status === "ready" && picked !== undefined,
    error: state.status === "error",
    hasMore: state.nextCursor !== null,
    refresh: refreshBusinesses,
  };
}

/* ------------------------------ Details -------------------------------- */

export interface DetailState {
  status: "loading" | "ready" | "notFound" | "error";
  business: BusinessDetail | null;
  /** New id when an old browser-local id was requested for an imported business. */
  movedTo: string | null;
}

const LOADING: DetailState = { status: "loading", business: null, movedTo: null };
const details = new Map<string, DetailState>();
const detailInflight = new Map<string, Promise<void>>();

function setDetail(id: string, state: DetailState) {
  details.set(id, state);
  for (const listener of listeners) listener();
}

/**
 * Stores a business returned by the server unless the cache already holds a newer copy.
 * Responses to overlapping requests can arrive out of order; an older one must not
 * replace the result of a later edit. Ordering uses the server revision, not
 * timestamps, which can repeat or come from differently-set server clocks.
 */
function acceptDetail(id: string, business: BusinessDetail): boolean {
  const cached = details.get(id)?.business;
  if (cached && cached.id === business.id && cached.version > business.version) return false;
  setDetail(id, { status: "ready", business, movedTo: null });
  return true;
}

/** Applies a server mutation result to the detail cache and the list. */
function acceptMutation(id: string, business: BusinessDetail) {
  if (acceptDetail(id, business)) replaceSummary(business);
}

/**
 * Undoes an optimistic update after a failed request. If another edit has changed the
 * cache since, rolling back would discard it, so the server copy is reloaded instead.
 */
function rollback(id: string, optimistic: DetailState | undefined, previous: DetailState | undefined) {
  if (!previous) return;
  if (details.get(id) === optimistic) setDetail(id, previous);
  else void loadBusiness(id);
}

export function loadBusiness(id: string): Promise<void> {
  const pending = detailInflight.get(id);
  if (pending) return pending;
  if (!details.has(id) || details.get(id)?.status === "error") setDetail(id, LOADING);
  const request = apiFetch<{ business: BusinessDetail }>(`/api/businesses/${encodeURIComponent(id)}`)
    .then(({ business }) => void acceptDetail(id, business))
    .catch((err: unknown) => {
      if (err instanceof ApiError && err.status === 404) {
        const movedTo = typeof err.body?.movedTo === "string" ? err.body.movedTo : null;
        setDetail(id, { status: "notFound", business: null, movedTo });
      } else if (!(err instanceof ApiError && err.status === 401)) {
        setDetail(id, { status: "error", business: null, movedTo: null });
      }
    })
    .finally(() => detailInflight.delete(id));
  detailInflight.set(id, request);
  return request;
}

/** The cached detail for a business, outside React. */
export function getCachedBusiness(id: string): DetailState | undefined {
  return details.get(id);
}

export function useBusiness(id: string | null): DetailState {
  const state = React.useSyncExternalStore(
    subscribe,
    () => (id ? (details.get(id) ?? LOADING) : LOADING),
    () => LOADING,
  );

  React.useEffect(() => {
    if (!id) return;
    const current = details.get(id);
    if (!current || current.status === "error") void loadBusiness(id);
  }, [id]);

  const generating = state.business?.status === "generating";
  React.useEffect(() => {
    if (!id || !generating) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadBusiness(id);
    }, POLL_WHILE_GENERATING_MS);
    return () => window.clearInterval(timer);
  }, [id, generating]);

  return state;
}

function replaceSummary(summary: BusinessSummary) {
  setSnapshot({ businesses: snapshot.businesses.map((b) => (b.id === summary.id ? { ...b, ...summary } : b)) });
}

/**
 * Sets one launch checklist item. The change shows immediately and is rolled
 * back if the server rejects it; the server's response then replaces the cache.
 */
export async function updateChecklistItem(id: string, index: number, done: boolean): Promise<void> {
  const previous = details.get(id);
  const pkg = previous?.business?.package;
  let optimistic: DetailState | undefined;
  if (previous?.business && pkg) {
    const checklist = pkg.launch.checklist.map((c, i) => (i === index ? { ...c, done } : c));
    optimistic = { ...previous, business: { ...previous.business, package: { ...pkg, launch: { ...pkg.launch, checklist } } } };
    setDetail(id, optimistic);
  }
  try {
    const { business } = await apiFetch<{ business: BusinessDetail }>(`/api/businesses/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ op: "setChecklistItem", index, done }),
    });
    acceptMutation(id, business);
  } catch (err) {
    rollback(id, optimistic, previous);
    throw err;
  }
}

/**
 * Persists updated Business Discovery answers. Generated package sections are
 * left alone on the server; the cache is replaced from the authoritative response.
 */
export async function updateBusinessContext(id: string, input: BusinessInput): Promise<void> {
  const { business } = await apiFetch<{ business: BusinessDetail }>(`/api/businesses/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ op: "updateBusinessContext", input }),
  });
  acceptMutation(id, business);
}

/** Saves Website setup answers; the server rebuilds the website from them. */
/** Uploads one website photo for the business; returns its private asset URL. */
export async function uploadWebsitePhoto(id: string, file: Blob): Promise<string> {
  const { url } = await apiFetch<{ url: string }>(`/api/businesses/${encodeURIComponent(id)}/photos`, {
    method: "POST",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });
  return url;
}

export async function updateWebsiteBrief(id: string, brief: WebsiteBrief): Promise<void> {
  const { business } = await apiFetch<{ business: BusinessDetail }>(`/api/businesses/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ op: "updateWebsiteBrief", brief }),
  });
  acceptMutation(id, business);
}

export interface ScopedRegenerationResponse {
  business: BusinessDetail;
  outcomes: SectionOutcome[];
  succeeded: GeneratedSectionId[];
  failed: GeneratedSectionId[];
}

/**
 * Regenerates only the selected generated sections. Unrelated package fields
 * stay as they are on the server.
 */
export async function regenerateBusinessSections(
  id: string,
  sections: readonly GeneratedSectionId[],
): Promise<ScopedRegenerationResponse> {
  const result = await apiFetch<ScopedRegenerationResponse>(`/api/businesses/${encodeURIComponent(id)}/regenerate`, {
    method: "POST",
    body: JSON.stringify({ sections }),
  });
  acceptMutation(id, result.business);
  return result;
}

async function publicationOp(id: string, op: "prepare" | "publish" | "unpublish") {
  const result = await apiFetch<{
    business: BusinessDetail;
    publicUrl?: string;
    publicPath?: string;
    publicSlug?: string;
  }>(`/api/businesses/${encodeURIComponent(id)}/publish`, {
    method: "POST",
    body: JSON.stringify({ op }),
  });
  acceptMutation(id, result.business);
  return result;
}

/** Prepares the current website for publishing (records prepare state only). */
export async function prepareWebsitePublication(id: string): Promise<void> {
  await publicationOp(id, "prepare");
}

/** Publishes the current website to a real public URL on this application. */
export async function publishWebsite(id: string): Promise<{ publicUrl: string; publicPath: string; publicSlug: string }> {
  const result = await publicationOp(id, "publish");
  if (!result.publicSlug || !result.publicPath) throw new Error("publish-missing-url");
  return {
    publicUrl: result.publicUrl ?? result.publicPath,
    publicPath: result.publicPath,
    publicSlug: result.publicSlug,
  };
}

/** Removes public availability; the workspace website is preserved. */
export async function unpublishWebsite(id: string): Promise<void> {
  await publicationOp(id, "unpublish");
}

/** Changes one brand field, with the same optimistic update and rollback as the checklist. */
export async function updateBrand(id: string, edit: BrandEdit): Promise<void> {
  const previous = details.get(id);
  const pkg = previous?.business?.package;
  let optimistic: DetailState | undefined;
  if (previous?.business && pkg) {
    const next = applyBrandEdit(pkg, edit);
    if (typeof next !== "string") {
      optimistic = { ...previous, business: { ...previous.business, package: next } };
      setDetail(id, optimistic);
    }
  }
  try {
    const { business } = await apiFetch<{ business: BusinessDetail }>(`/api/businesses/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ op: "updateBrand", edit }),
    });
    acceptMutation(id, business);
  } catch (err) {
    rollback(id, optimistic, previous);
    throw err;
  }
}

export async function deleteBusiness(id: string): Promise<void> {
  await apiFetch<void>(`/api/businesses/${encodeURIComponent(id)}`, { method: "DELETE" });
  details.delete(id);
  setSnapshot({ businesses: snapshot.businesses.filter((b) => b.id !== id) });
  if (snapshot.activeId === id) setActiveBusinessId(null);
}

/** Called when a generation finished and saved a business. */
export function businessCreated(id: string) {
  details.delete(id);
  setActiveBusinessId(id);
  void refreshBusinesses();
}

/** Clears cached account data (e.g. on sign-out) so nothing leaks into the next session. */
export function clearBusinessCache() {
  details.clear();
  snapshot = SERVER_SNAPSHOT;
  for (const listener of listeners) listener();
}
