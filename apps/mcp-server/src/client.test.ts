import type { ServiceMetadata } from '@gatekeeper/contracts';
import { createReviewRunFixture } from '@gatekeeper/testkit';
import { describe, expect, it, vi } from 'vitest';

import { createGatekeeperClient } from './client.js';

const metadata: ServiceMetadata = {
  schemaVersion: 1,
  pid: 4242,
  port: 43127,
  baseUrl: 'http://127.0.0.1:43127',
  bearerToken: 'a'.repeat(43),
  repositoryRoot: 'D:\\work\\gatekeeper',
  startedAt: '2026-07-18T12:00:00.000Z',
};

const status = {
  schemaVersion: 1 as const,
  service: {
    state: 'ready' as const,
    version: '0.1.0',
    startedAt: metadata.startedAt,
    baseUrl: metadata.baseUrl,
  },
  repository: {
    root: metadata.repositoryRoot,
    branch: 'master',
    head: 'b'.repeat(40),
    dirty: true,
    remote: null,
  },
  tools: {
    git: { available: true, version: 'git version 2.50.1' },
    gh: { available: false, version: null },
  },
  features: { modelReasoning: 'disabled' as const, projectMemory: 'ready' as const },
  paths: {
    appData: 'C:\\Users\\developer\\AppData\\Local\\Gatekeeper',
    serviceMetadata: 'C:\\Users\\developer\\AppData\\Local\\Gatekeeper\\service.json',
    storage: 'C:\\Users\\developer\\AppData\\Local\\Gatekeeper\\storage',
  },
};

const repository = {
  schemaVersion: 1 as const,
  repositoryId: 'repository_fixture',
  root: metadata.repositoryRoot,
  remote: null,
  createdAt: metadata.startedAt,
  updatedAt: metadata.startedAt,
};

const indexResult = {
  schemaVersion: 1 as const,
  repositoryId: repository.repositoryId,
  head: 'b'.repeat(40),
  indexedAt: metadata.startedAt,
  files: { scanned: 1, written: 1, unchanged: 0, deleted: 0 },
  documents: { scanned: 0, written: 0, unchanged: 0, deleted: 0 },
  commits: { scanned: 1, written: 1, unchanged: 0, deleted: 0 },
};

const review = { ...createReviewRunFixture(), repositoryId: repository.repositoryId };
const draft = {
  schemaVersion: 1 as const,
  reviewId: review.reviewId,
  repositoryId: review.repositoryId,
  target: review.target,
  findings: review.findings,
  metrics: review.metrics,
  changes: review.changes,
  evidenceCandidates: [],
  createdAt: review.createdAt,
};
const memoryResponse = { schemaVersion: 1 as const, results: [] };

function json(body: unknown, statusCode = 200): Response {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Gatekeeper local service client', () => {
  it('routes every operation to the fixed loopback service with bearer authentication', async () => {
    const fetchImplementation = vi.fn((input: string | URL | Request) => {
      const request = input instanceof Request ? input : new Request(input);
      const url = new URL(request.url);
      const response =
        url.pathname === '/v1/status'
          ? status
          : url.pathname === '/v1/repositories'
            ? repository
            : url.pathname.endsWith('/index')
              ? indexResult
              : url.pathname === '/v1/reviews/worktree'
                ? review
                : url.pathname.endsWith('/draft')
                  ? draft
                  : url.pathname.endsWith('/complete') ||
                      url.pathname === `/v1/reviews/${review.reviewId}`
                    ? review
                    : url.pathname === '/v1/memory/search'
                      ? memoryResponse
                      : undefined;
      return Promise.resolve(response === undefined ? json({}, 404) : json(response));
    });
    const client = createGatekeeperClient({
      fetch: fetchImplementation,
      loadMetadata: () => Promise.resolve(metadata),
    });

    await expect(client.status()).resolves.toEqual(status);
    await expect(client.indexRepository()).resolves.toEqual(indexResult);
    await expect(client.reviewWorktree()).resolves.toEqual(draft);
    await expect(client.searchMemory({ query: 'cache', limit: 5 })).resolves.toEqual(
      memoryResponse,
    );
    await expect(
      client.completeReview({ reviewId: review.reviewId, findings: [], model: null }),
    ).resolves.toEqual(review);
    await expect(client.getReview(review.reviewId)).resolves.toEqual(review);

    expect(fetchImplementation).toHaveBeenCalled();
    for (const [request] of fetchImplementation.mock.calls) {
      expect(request).toBeInstanceOf(Request);
      expect((request as Request).headers.get('authorization')).toBe(
        `Bearer ${metadata.bearerToken}`,
      );
      expect(new URL((request as Request).url).origin).toBe(metadata.baseUrl);
    }
  });

  it('returns actionable bounded errors without leaking metadata or response content', async () => {
    const unavailable = createGatekeeperClient({
      loadMetadata: () => Promise.reject(new Error(`missing ${metadata.bearerToken}`)),
    });
    const invalidResponse = createGatekeeperClient({
      loadMetadata: () => Promise.resolve(metadata),
      fetch: () => Promise.resolve(json({ privateSource: 'do not leak' })),
    });

    await expect(unavailable.status()).rejects.toThrow(
      'Gatekeeper local service is unavailable. Start it with:',
    );
    await expect(unavailable.status()).rejects.not.toThrow(metadata.bearerToken);
    await expect(invalidResponse.status()).rejects.toThrow(
      'Gatekeeper local service returned an invalid response.',
    );
    await expect(invalidResponse.status()).rejects.not.toThrow('do not leak');
  });

  it('uses a bounded request timeout', async () => {
    const fetchImplementation = vi.fn(() => new Promise<Response>(() => undefined));
    const client = createGatekeeperClient({
      fetch: fetchImplementation,
      loadMetadata: () => Promise.resolve(metadata),
      timeoutMs: 5,
    });

    await expect(client.status()).rejects.toThrow('did not respond');
  });
});
