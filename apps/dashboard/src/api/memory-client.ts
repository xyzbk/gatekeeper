import {
  commitExplorerResponseSchema,
  githubSyncResultSchema,
  indexResultSchema,
  memorySearchResponseSchema,
  pullRequestExplorerResponseSchema,
  recentCommitEvidenceResponseSchema,
  repositoryRecordSchema,
  repositoryStatusSchema,
  type CommitExplorerInput,
  type CommitExplorerResponse,
  type DashboardBootstrap,
  type GitHubSyncResult,
  type IndexResult,
  type RecentCommitEvidence,
  type MemorySearchResult,
  type PullRequestExplorerInput,
  type PullRequestExplorerResponse,
  type RepositoryStatus,
} from '@gatekeeper/contracts';

import { createBootstrapLoader, type BootstrapLoader } from './status-client.js';

type SafeParseResult<T> = { success: true; data: T } | { success: false };

interface SafeSchema<T> {
  safeParse: (value: unknown) => SafeParseResult<T>;
}

export interface MemoryClient {
  exploreCommits: (
    input: CommitExplorerInput,
    signal?: AbortSignal,
  ) => Promise<CommitExplorerResponse>;
  recentCommits: (signal?: AbortSignal) => Promise<RecentCommitEvidence[]>;
  search: (query: string, signal?: AbortSignal) => Promise<MemorySearchResult[]>;
  getMemoryStatus: (signal?: AbortSignal) => Promise<RepositoryStatus>;
  indexLocalMemory: (signal?: AbortSignal) => Promise<IndexResult>;
  syncGitHubHistory: (signal?: AbortSignal) => Promise<GitHubSyncResult>;
  explorePullRequests: (
    input: Omit<PullRequestExplorerInput, 'repositoryId'>,
    signal?: AbortSignal,
  ) => Promise<PullRequestExplorerResponse>;
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

export type MemoryControlClientErrorCode =
  | 'GITHUB_UNAVAILABLE'
  | 'REPOSITORY_UNAVAILABLE'
  | 'UNAVAILABLE';

export class MemoryControlClientError extends Error {
  public constructor(
    public readonly code: MemoryControlClientErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MemoryControlClientError';
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error('Project Memory returned invalid JSON.');
  }
}

function requestOptions(
  bootstrap: DashboardBootstrap,
  method: 'GET' | 'POST',
  signal?: AbortSignal,
): RequestInit {
  return {
    ...(method === 'POST' ? { body: '{}' } : {}),
    cache: 'no-store',
    credentials: 'same-origin',
    headers:
      method === 'POST'
        ? {
            Authorization: `Bearer ${bootstrap.bearerToken}`,
            'Content-Type': 'application/json',
          }
        : { Authorization: `Bearer ${bootstrap.bearerToken}` },
    method,
    ...(signal === undefined ? {} : { signal }),
  };
}

async function parseControlResponse<T>(
  response: Response,
  schema: SafeSchema<T>,
  unavailableCode: MemoryControlClientErrorCode,
  unavailableMessage: string,
  invalidMessage: string,
): Promise<T> {
  if (!response.ok) {
    throw new MemoryControlClientError(
      response.status === 404 ? 'REPOSITORY_UNAVAILABLE' : unavailableCode,
      response.status === 404 ? 'The local repository is unavailable.' : unavailableMessage,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MemoryControlClientError('UNAVAILABLE', invalidMessage);
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new MemoryControlClientError('UNAVAILABLE', invalidMessage);
  }
  return parsed.data;
}

export function createMemoryClient(
  fetcher: typeof fetch = globalThis.fetch,
  loadBootstrap: BootstrapLoader = createBootstrapLoader(fetcher),
): MemoryClient {
  async function selectedRepository(
    bootstrap: DashboardBootstrap,
    signal?: AbortSignal,
  ) {
    return parseControlResponse(
      await fetcher(`${bootstrap.apiBaseUrl}/repositories`, requestOptions(bootstrap, 'POST', signal)),
      repositoryRecordSchema,
      'REPOSITORY_UNAVAILABLE',
      'The local repository is unavailable.',
      'Project Memory returned an invalid repository.',
    );
  }

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
    getMemoryStatus: async (signal) => {
      const bootstrap = await loadBootstrap(signal);
      const repository = await selectedRepository(bootstrap, signal);
      return parseControlResponse(
        await fetcher(
          `${bootstrap.apiBaseUrl}/repositories/${encodeURIComponent(repository.repositoryId)}/memory/status`,
          requestOptions(bootstrap, 'GET', signal),
        ),
        repositoryStatusSchema,
        'UNAVAILABLE',
        'Project Memory is unavailable.',
        'Project Memory returned an invalid status response.',
      );
    },
    indexLocalMemory: async (signal) => {
      const bootstrap = await loadBootstrap(signal);
      const repository = await selectedRepository(bootstrap, signal);
      return parseControlResponse(
        await fetcher(
          `${bootstrap.apiBaseUrl}/repositories/${encodeURIComponent(repository.repositoryId)}/index`,
          requestOptions(bootstrap, 'POST', signal),
        ),
        indexResultSchema,
        'UNAVAILABLE',
        'Project Memory is unavailable.',
        'Project Memory returned an invalid index response.',
      );
    },
    syncGitHubHistory: async (signal) => {
      const bootstrap = await loadBootstrap(signal);
      const repository = await selectedRepository(bootstrap, signal);
      return parseControlResponse(
        await fetcher(
          `${bootstrap.apiBaseUrl}/repositories/${encodeURIComponent(repository.repositoryId)}/sync/github`,
          requestOptions(bootstrap, 'POST', signal),
        ),
        githubSyncResultSchema,
        'GITHUB_UNAVAILABLE',
        'GitHub history is unavailable from this local service.',
        'Project Memory returned an invalid GitHub sync response.',
      );
    },
    explorePullRequests: async (input, signal) => {
      const bootstrap = await loadBootstrap(signal);
      const repository = await selectedRepository(bootstrap, signal);
      const response = await fetcher(`${bootstrap.apiBaseUrl}/pull-requests/explore`, {
        ...requestOptions(bootstrap, 'POST', signal),
        body: JSON.stringify({ ...input, repositoryId: repository.repositoryId }),
      });
      return parseControlResponse(
        response,
        pullRequestExplorerResponseSchema,
        'UNAVAILABLE',
        'Project Memory is unavailable.',
        'Project Memory returned an invalid pull request response.',
      );
    },
  };
}
