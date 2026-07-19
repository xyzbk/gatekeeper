import {
  memorySearchResponseSchema,
  recentCommitEvidenceResponseSchema,
  repositoryRecordSchema,
  type RecentCommitEvidence,
  type MemorySearchResult,
} from '@gatekeeper/contracts';

import { createBootstrapLoader, type BootstrapLoader } from './status-client.js';

export interface MemoryClient {
  recentCommits: (signal?: AbortSignal) => Promise<RecentCommitEvidence[]>;
  search: (query: string, signal?: AbortSignal) => Promise<MemorySearchResult[]>;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error('Project Memory returned invalid JSON.');
  }
}

export function createMemoryClient(
  fetcher: typeof fetch = globalThis.fetch,
  loadBootstrap: BootstrapLoader = createBootstrapLoader(fetcher),
): MemoryClient {
  return {
    recentCommits: async (signal) => {
      const bootstrap = await loadBootstrap(signal);
      const response = await fetcher(`${bootstrap.apiBaseUrl}/memory/commits`, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Authorization: `Bearer ${bootstrap.bearerToken}` },
        method: 'GET',
        ...(signal === undefined ? {} : { signal }),
      });
      if (!response.ok) {
        throw new Error('Project Memory is unavailable.');
      }
      const parsed = recentCommitEvidenceResponseSchema.safeParse(await readJson(response));
      if (!parsed.success) {
        throw new Error('Project Memory returned an invalid recent commit response.');
      }
      return parsed.data.commits;
    },
    search: async (query, signal) => {
      const bootstrap = await loadBootstrap(signal);
      const headers = {
        Authorization: `Bearer ${bootstrap.bearerToken}`,
        'Content-Type': 'application/json',
      };
      const repositoryResponse = await fetcher(`${bootstrap.apiBaseUrl}/repositories`, {
        body: '{}',
        cache: 'no-store',
        credentials: 'same-origin',
        headers,
        method: 'POST',
        ...(signal === undefined ? {} : { signal }),
      });
      if (!repositoryResponse.ok) {
        throw new Error('Project Memory is unavailable.');
      }
      const repository = repositoryRecordSchema.safeParse(await readJson(repositoryResponse));
      if (!repository.success) {
        throw new Error('Project Memory returned an invalid repository.');
      }

      const searchResponse = await fetcher(`${bootstrap.apiBaseUrl}/memory/search`, {
        body: JSON.stringify({
          schemaVersion: 1,
          repositoryId: repository.data.repositoryId,
          query,
          limit: 20,
        }),
        cache: 'no-store',
        credentials: 'same-origin',
        headers,
        method: 'POST',
        ...(signal === undefined ? {} : { signal }),
      });
      if (!searchResponse.ok) {
        throw new Error('Project Memory is unavailable.');
      }
      const search = memorySearchResponseSchema.safeParse(await readJson(searchResponse));
      if (!search.success) {
        throw new Error('Project Memory returned an invalid search response.');
      }
      return search.data.results;
    },
  };
}
