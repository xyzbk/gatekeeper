import {
  commitExplorerResponseSchema,
  memorySearchResponseSchema,
  recentCommitEvidenceResponseSchema,
  repositoryRecordSchema,
  type CommitExplorerInput,
  type CommitExplorerResponse,
  type RecentCommitEvidence,
  type MemorySearchResult,
} from '@gatekeeper/contracts';

import { createBootstrapLoader, type BootstrapLoader } from './status-client.js';

export interface MemoryClient {
  exploreCommits: (
    input: CommitExplorerInput,
    signal?: AbortSignal,
  ) => Promise<CommitExplorerResponse>;
  recentCommits: (signal?: AbortSignal) => Promise<RecentCommitEvidence[]>;
  search: (query: string, signal?: AbortSignal) => Promise<MemorySearchResult[]>;
}

export type CommitExplorerClientErrorCode = 'BRANCH_UNAVAILABLE' | 'UNAVAILABLE';

export class CommitExplorerClientError extends Error {
  public constructor(
    public readonly code: CommitExplorerClientErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CommitExplorerClientError';
  }
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
    exploreCommits: async (input, signal) => {
      const bootstrap = await loadBootstrap(signal);
      const response = await fetcher(`${bootstrap.apiBaseUrl}/commits/explore`, {
        body: JSON.stringify(input),
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          Authorization: `Bearer ${bootstrap.bearerToken}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
        ...(signal === undefined ? {} : { signal }),
      });
      if (response.status === 404) {
        throw new CommitExplorerClientError(
          'BRANCH_UNAVAILABLE',
          'The selected local branch is unavailable.',
        );
      }
      if (!response.ok) {
        throw new CommitExplorerClientError('UNAVAILABLE', 'Local commits are unavailable.');
      }
      const parsed = commitExplorerResponseSchema.safeParse(await readJson(response));
      if (!parsed.success) {
        throw new Error('Local commits returned an invalid response.');
      }
      return parsed.data;
    },
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
