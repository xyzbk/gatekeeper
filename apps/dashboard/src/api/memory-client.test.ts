import type {
  DashboardBootstrap,
  MemorySearchResponse,
  RecentCommitEvidenceResponse,
  RepositoryRecord,
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

function jsonResponse(body: unknown, statusCode = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: statusCode,
  });
}

describe('memory client', () => {
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
