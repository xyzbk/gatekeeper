import type {
  CommitExplorerResponse,
  DashboardBootstrap,
  GitHubSyncResult,
  IndexResult,
  MemorySearchResponse,
  PullRequestExplorerResponse,
  RecentCommitEvidenceResponse,
  RepositoryRecord,
  RepositoryStatus,
} from '@gatekeeper/contracts';
import { describe, expect, it, vi } from 'vitest';

const bearerToken = 'a'.repeat(43);
const bootstrap: DashboardBootstrap = { apiBaseUrl: '/v1', bearerToken };
const repository: RepositoryRecord = {
  schemaVersion: 1,
  repositoryId: 'repository_memory_test',
  root: 'D:/work/gatekeeper',
  remote: 'https://github.com/xyzbk/gatekeeper.git',
  createdAt: '2026-07-18T12:00:00.000Z',
  updatedAt: '2026-07-18T12:00:00.000Z',
};
const response: MemorySearchResponse = {
  schemaVersion: 1,
  results: [
    {
      documentId: 'document_memory_test',
      match: 'fts',
      trust: 'untrusted_repository_content',
      status: 'active',
      occurredAt: null,
      evidence: {
        sourceType: 'adr',
        repositoryId: repository.repositoryId,
        sourceId: 'docs/adr/0003-no-required-redis.md',
        path: 'docs/adr/0003-no-required-redis.md',
        excerpt: 'Redis is not required for the local cache.',
      },
    },
  ],
};

const recentResponse: RecentCommitEvidenceResponse = {
  schemaVersion: 1,
  commits: [
    {
      sha: 'c'.repeat(40),
      authoredAt: '2026-07-19T12:00:00.000Z',
      title: 'Add historical commit review',
    },
  ],
};

const explorerResponse: CommitExplorerResponse = {
  schemaVersion: 1,
  branches: ['master', 'feature/local-history'],
  selection: {
    schemaVersion: 1,
    branch: 'master',
    source: 'all_local',
    reviewState: 'all',
    sort: 'newest',
  },
  commits: [
    {
      sha: 'd'.repeat(40),
      authoredAt: '2026-07-19T13:00:00.000Z',
      title: 'Preserve historical review identity',
      indexed: true,
      reviewed: true,
    },
  ],
  nextCursor: 24,
};

const indexResult: IndexResult = {
  schemaVersion: 1,
  repositoryId: repository.repositoryId,
  head: 'e'.repeat(40),
  indexedAt: '2026-07-20T10:00:00.000Z',
  files: { scanned: 3, written: 2, unchanged: 1, deleted: 0 },
  documents: { scanned: 4, written: 3, unchanged: 1, deleted: 0 },
  commits: { scanned: 5, written: 4, unchanged: 1, deleted: 0 },
};

const memoryStatus: RepositoryStatus = {
  schemaVersion: 1,
  state: 'ready',
  repository,
  indexState: {
    schemaVersion: 1,
    repositoryId: repository.repositoryId,
    head: 'e'.repeat(40),
    indexedAt: '2026-07-20T10:00:00.000Z',
    files: 3,
    documents: 4,
    commits: 5,
  },
};

const githubSyncResult: GitHubSyncResult = {
  schemaVersion: 1,
  repositoryId: repository.repositoryId,
  provider: 'github',
  syncedAt: '2026-07-20T10:00:00.000Z',
  cursor: '2026-07-20T09:00:00.000Z',
  partial: true,
  documents: { received: 6, written: 5, unchanged: 1 },
  links: { received: 4, written: 3, unchanged: 1 },
  failures: [{ source: 'pull_request:8', code: 'unavailable' }],
};

const pullRequestExplorerResponse: PullRequestExplorerResponse = {
  schemaVersion: 1,
  selection: {
    schemaVersion: 1,
    repositoryId: repository.repositoryId,
    query: 'redis',
    state: 'closed',
    updatedAfter: '2026-07-01',
    updatedBefore: '2026-07-20',
    reviewState: 'reviewed',
    sort: 'newest',
  },
  pullRequests: [
    {
      number: 12,
      title: 'Restore Redis cache',
      state: 'closed',
      updatedAt: '2026-07-19T13:00:00.000Z',
      reviewed: true,
      trust: 'untrusted_repository_content',
      evidence: {
        sourceType: 'pull_request',
        repositoryId: repository.repositoryId,
        sourceId: 'pull_request:12',
        title: 'Restore Redis cache',
        remoteUrl: 'https://github.com/xyzbk/gatekeeper/pull/12',
        contentHash: 'a'.repeat(64),
      },
    },
  ],
  nextCursor: null,
};

function jsonResponse(body: unknown, statusCode = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: statusCode,
  });
}

describe('memory client', () => {
  it('explores local commit metadata with the bootstrap token kept in headers', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(explorerResponse));
    const { createMemoryClient } = await import('./memory-client.js');
    const input = {
      schemaVersion: 1 as const,
      source: 'all_local' as const,
      reviewState: 'all' as const,
      sort: 'newest' as const,
    };

    await expect(
      createMemoryClient(fetcher, () => Promise.resolve(bootstrap)).exploreCommits(input),
    ).resolves.toEqual(explorerResponse);

    expect(fetcher).toHaveBeenCalledWith('/v1/commits/explore', {
      body: JSON.stringify(input),
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
    expect(JSON.stringify(fetcher.mock.calls.map(([, options]) => options?.body))).not.toContain(
      bearerToken,
    );
  });

  it('exposes a controlled stale-branch error without reading the response body', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ private: 'detail' }, 404));
    const { CommitExplorerClientError, createMemoryClient } = await import('./memory-client.js');

    await expect(
      createMemoryClient(fetcher, () => Promise.resolve(bootstrap)).exploreCommits({
        schemaVersion: 1,
        branch: 'deleted-branch',
        source: 'all_local',
        reviewState: 'all',
        sort: 'newest',
      }),
    ).rejects.toEqual(
      new CommitExplorerClientError(
        'BRANCH_UNAVAILABLE',
        'The selected local branch is unavailable.',
      ),
    );
  });

  it('reads the bounded recent commit evidence with the local bearer token', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(recentResponse));
    const { createMemoryClient } = await import('./memory-client.js');

    await expect(
      createMemoryClient(fetcher, () => Promise.resolve(bootstrap)).recentCommits(),
    ).resolves.toEqual(recentResponse.commits);

    expect(fetcher).toHaveBeenCalledWith('/v1/memory/commits', {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Authorization: `Bearer ${bearerToken}` },
      method: 'GET',
    });
  });

  it('resolves the fixed repository and searches with the token only in headers', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(repository))
      .mockResolvedValueOnce(jsonResponse(response));
    const { createMemoryClient } = await import('./memory-client.js');

    await expect(
      createMemoryClient(fetcher, () => Promise.resolve(bootstrap)).search('redis cache'),
    ).resolves.toEqual(response.results);

    const authenticatedHeaders = {
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    };
    expect(fetcher).toHaveBeenNthCalledWith(1, '/v1/repositories', {
      body: '{}',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: authenticatedHeaders,
      method: 'POST',
    });
    expect(fetcher).toHaveBeenNthCalledWith(2, '/v1/memory/search', {
      body: JSON.stringify({
        schemaVersion: 1,
        repositoryId: repository.repositoryId,
        query: 'redis cache',
        limit: 20,
      }),
      cache: 'no-store',
      credentials: 'same-origin',
      headers: authenticatedHeaders,
      method: 'POST',
    });
    expect(JSON.stringify(fetcher.mock.calls.map(([, options]) => options?.body))).not.toContain(
      bearerToken,
    );
  });

  it('gets memory status through the server-selected repository identity', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(repository))
      .mockResolvedValueOnce(jsonResponse(memoryStatus));
    const { createMemoryClient } = await import('./memory-client.js');

    await expect(
      createMemoryClient(fetcher, () => Promise.resolve(bootstrap)).getMemoryStatus(),
    ).resolves.toEqual(memoryStatus);

    expect(fetcher).toHaveBeenNthCalledWith(1, '/v1/repositories', {
      body: '{}',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      `/v1/repositories/${repository.repositoryId}/memory/status`,
      {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Authorization: `Bearer ${bearerToken}` },
        method: 'GET',
      },
    );
  });

  it('indexes and syncs only the server-selected repository, retaining bounded result fields', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(repository))
      .mockResolvedValueOnce(jsonResponse(indexResult))
      .mockResolvedValueOnce(jsonResponse(repository))
      .mockResolvedValueOnce(jsonResponse(githubSyncResult));
    const { createMemoryClient } = await import('./memory-client.js');
    const client = createMemoryClient(fetcher, () => Promise.resolve(bootstrap));

    await expect(client.indexLocalMemory()).resolves.toEqual(indexResult);
    await expect(client.syncGitHubHistory()).resolves.toEqual(githubSyncResult);

    const headers = {
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    };
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      `/v1/repositories/${repository.repositoryId}/index`,
      {
        body: '{}',
        cache: 'no-store',
        credentials: 'same-origin',
        headers,
        method: 'POST',
      },
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      4,
      `/v1/repositories/${repository.repositoryId}/sync/github`,
      {
        body: '{}',
        cache: 'no-store',
        credentials: 'same-origin',
        headers,
        method: 'POST',
      },
    );
    expect(JSON.stringify(fetcher.mock.calls.map(([, options]) => options?.body))).not.toContain(
      bearerToken,
    );
  });

  it('explores bounded historical pull request metadata using the fixed repository identity', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(repository))
      .mockResolvedValueOnce(jsonResponse(pullRequestExplorerResponse));
    const { createMemoryClient } = await import('./memory-client.js');
    const input = {
      schemaVersion: 1 as const,
      query: 'redis',
      state: 'closed' as const,
      updatedAfter: '2026-07-01',
      updatedBefore: '2026-07-20',
      reviewState: 'reviewed' as const,
      sort: 'newest' as const,
    };

    await expect(
      createMemoryClient(fetcher, () => Promise.resolve(bootstrap)).explorePullRequests(input),
    ).resolves.toEqual(pullRequestExplorerResponse);

    expect(fetcher).toHaveBeenNthCalledWith(2, '/v1/pull-requests/explore', {
      body: JSON.stringify({ ...input, repositoryId: repository.repositoryId }),
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
  });

  it('returns bounded control errors for unavailable and contract-invalid responses', async () => {
    const { MemoryControlClientError, createMemoryClient } = await import('./memory-client.js');
    const loadBootstrap = () => Promise.resolve(bootstrap);
    const githubUnavailable = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(repository))
      .mockResolvedValueOnce(jsonResponse({ private: 'detail' }, 503));
    const invalidExplorer = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(repository))
      .mockResolvedValueOnce(jsonResponse({ private: 'detail' }));
    const malformedStatus = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(repository))
      .mockResolvedValueOnce(new Response('private detail'));

    await expect(
      createMemoryClient(githubUnavailable, loadBootstrap).syncGitHubHistory(),
    ).rejects.toEqual(
      new MemoryControlClientError(
        'GITHUB_UNAVAILABLE',
        'GitHub history is unavailable from this local service.',
      ),
    );
    await expect(
      createMemoryClient(invalidExplorer, loadBootstrap).explorePullRequests({
        schemaVersion: 1,
        state: 'all',
        reviewState: 'all',
        sort: 'newest',
      }),
    ).rejects.toEqual(
      new MemoryControlClientError(
        'UNAVAILABLE',
        'Project Memory returned an invalid pull request response.',
      ),
    );
    await expect(createMemoryClient(malformedStatus, loadBootstrap).getMemoryStatus()).rejects.toEqual(
      new MemoryControlClientError(
        'UNAVAILABLE',
        'Project Memory returned an invalid status response.',
      ),
    );
  });

  it('rejects failed, malformed, and contract-invalid responses without echoing content', async () => {
    const { createMemoryClient } = await import('./memory-client.js');
    const loadBootstrap = () => Promise.resolve(bootstrap);
    const failed = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ private: 'detail' }, 500));
    const malformed = vi.fn<typeof fetch>().mockResolvedValue(new Response('private detail'));
    const invalidRepository = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ private: 'detail' }));
    const invalidSearch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(repository))
      .mockResolvedValueOnce(jsonResponse({ private: 'detail' }));

    await expect(createMemoryClient(failed, loadBootstrap).search('redis')).rejects.toThrow(
      'Project Memory is unavailable.',
    );
    await expect(createMemoryClient(malformed, loadBootstrap).search('redis')).rejects.toThrow(
      'Project Memory returned invalid JSON.',
    );
    await expect(
      createMemoryClient(invalidRepository, loadBootstrap).search('redis'),
    ).rejects.toThrow('Project Memory returned an invalid repository.');
    await expect(createMemoryClient(invalidSearch, loadBootstrap).search('redis')).rejects.toThrow(
      'Project Memory returned an invalid search response.',
    );
  });
});
