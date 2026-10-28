import type { QueryErrorCode } from "@/lib/research/model";

/**
 * Contract between the research engine and any external search backend.
 * Adapters translate provider-specific responses into `RawSearchHit`s; nothing
 * provider-specific crosses this boundary.
 */

/** One search result as returned by a provider. Fields are set only when the provider supplied them. */
export interface RawSearchHit {
  title?: string;
  url?: string;
  snippet?: string;
  publishedAt?: string;
  publisher?: string;
}

export interface ResearchSearchOptions {
  maxResults: number;
  timeoutMs: number;
}

export interface ResearchSearchProvider {
  /** Stable provider name recorded on snapshots (e.g. "tavily"). */
  readonly name: string;
  /** Runs one query. Rejects with {@link ResearchProviderError} on failure. */
  search(query: string, options: ResearchSearchOptions): Promise<RawSearchHit[]>;
}

export class ResearchProviderError extends Error {
  constructor(readonly code: QueryErrorCode, message: string = code) {
    super(message);
    this.name = "ResearchProviderError";
  }
}
