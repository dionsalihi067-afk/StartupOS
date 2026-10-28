import "server-only";
import { getSearchProvider, searchRaw, SearchProviderError, type SearchProvider } from "@/lib/services/search";
import { ResearchProviderError, type ResearchSearchProvider } from "@/lib/research/provider";

/** Adapts the configured web search service (Tavily / Serper / Brave) to the research provider contract. */
export function createWebSearchProvider(provider: SearchProvider): ResearchSearchProvider {
  return {
    name: provider,
    async search(query, { maxResults, timeoutMs }) {
      try {
        return await searchRaw(provider, query, maxResults, timeoutMs);
      } catch (err) {
        if (err instanceof SearchProviderError) throw new ResearchProviderError(err.code, err.message);
        throw new ResearchProviderError("unexpected");
      }
    },
  };
}

/** The provider selected by server configuration, or null when no search key is set. */
export function getResearchProvider(): ResearchSearchProvider | null {
  const provider = getSearchProvider();
  return provider ? createWebSearchProvider(provider) : null;
}
