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
const memoryStatus = {
  schemaVersion: 1 as const,
  state: 'ready' as const,
  repository,
  indexState: {
    schemaVersion: 1 as const,
    repositoryId: repository.repositoryId,
    head: status.repository.head,
    indexedAt: metadata.startedAt,
    files: 1,
    documents: 0,
    commits: 1,
  },
};

const review = { ...createReviewRunFixture(), repositoryId: repository.repositoryId };
const pullRequestReview = {
  ...review,
  reviewId: 'review_pr_12',
  target: { kind: 'pull_request' as const, display: 'Pull request #12', pullRequestNumber: 12 },
};
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
const recentCommitsResponse = {
  schemaVersion: 1 as const,
  commits: [
    {
      sha: 'c'.repeat(40),
      authoredAt: metadata.startedAt,
      title: 'Keep this as untrusted repository data',
    },
  ],
};
const commitReview = {
  ...review,
  reviewId: 'review_commit_1',
  target: {
    kind: 'commit_range' as const,
    display: `Commit ${'c'.repeat(12)}`,
    head: 'c'.repeat(40),
  },
};

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
            : url.pathname.endsWith('/memory/status')
              ? memoryStatus
              : url.pathname.endsWith('/index')
                ? indexResult
                : url.pathname === '/v1/reviews/worktree'
                  ? review
                  : url.pathname === '/v1/reviews/pull-request'
                    ? pullRequestReview
                    : url.pathname.endsWith('/draft')
                      ? url.pathname.includes(pullRequestReview.reviewId)
                        ? {
                            ...draft,
                            reviewId: pullRequestReview.reviewId,
                            target: pullRequestReview.target,
                          }
                        : url.pathname.includes(commitReview.reviewId)
                          ? {
                              ...draft,
                              reviewId: commitReview.reviewId,
                              target: commitReview.target,
                            }
                          : draft
                      : url.pathname.endsWith('/complete') ||
                          url.pathname === `/v1/reviews/${review.reviewId}`
                        ? review
                        : url.pathname === '/v1/memory/search'
                          ? memoryResponse
                          : url.pathname === '/v1/memory/commits'
                            ? recentCommitsResponse
                            : url.pathname === '/v1/reviews/commit'
                              ? commitReview
                              : undefined;
      return Promise.resolve(response === undefined ? json({}, 404) : json(response));
    });
    const client = createGatekeeperClient({
      fetch: fetchImplementation,
      loadMetadata: () => Promise.resolve(metadata),
    });

    await expect(client.status()).resolves.toEqual({
      schemaVersion: 1,
      status,
      memory: memoryStatus,
    });
    await expect(client.indexRepository()).resolves.toEqual(indexResult);
    await expect(client.reviewWorktree()).resolves.toEqual(draft);
    await expect(client.reviewPullRequest(12)).resolves.toEqual({
      ...draft,
      reviewId: pullRequestReview.reviewId,
      target: pullRequestReview.target,
    });
    await expect(client.reviewCommit('c'.repeat(40))).resolves.toEqual({
      ...draft,
      reviewId: commitReview.reviewId,
      target: commitReview.target,
    });
    await expect(client.recentCommits()).resolves.toEqual(recentCommitsResponse);
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
    const pullRequestCall = fetchImplementation.mock.calls
      .map(([request]) => request as Request)
      .find((request) => new URL(request.url).pathname === '/v1/reviews/pull-request');
    expect(await pullRequestCall?.json()).toEqual({ schemaVersion: 1, pullRequestNumber: 12 });
    const commitCall = fetchImplementation.mock.calls
      .map(([request]) => request as Request)
      .find((request) => new URL(request.url).pathname === '/v1/reviews/commit');
    expect(await commitCall?.json()).toEqual({ schemaVersion: 1, sha: 'c'.repeat(40) });
  });

  it('returns actionable bounded errors without leaking metadata or response content', async () => {
    const fetchImplementation = vi.fn(() => Promise.resolve(json(status)));
    const unavailable = createGatekeeperClient({
      loadMetadata: () => Promise.reject(new Error(`missing ${metadata.bearerToken}`)),
    });
    const malformedMetadata = createGatekeeperClient({
      fetch: fetchImplementation,
      loadMetadata: () => Promise.resolve({ ...metadata, baseUrl: 'https://attacker.example' }),
    });
    const invalidResponse = createGatekeeperClient({
      loadMetadata: () => Promise.resolve(metadata),
      fetch: () => Promise.resolve(json({ privateSource: 'do not leak' })),
    });
    const repairResponse = createGatekeeperClient({
      loadMetadata: () => Promise.resolve(metadata),
      fetch: () =>
        Promise.resolve(
          json(
            {
              error: {
                code: 'ENVIRONMENT_ERROR',
                message: 'GitHub authentication is required for this local operation.',
                repair: 'Run gh auth login --hostname github.com.',
              },
            },
            503,
          ),
        ),
    });

    await expect(unavailable.status()).rejects.toThrow(
      'Gatekeeper local service is unavailable. Start it with:',
    );
    await expect(unavailable.status()).rejects.not.toThrow(metadata.bearerToken);
    await expect(malformedMetadata.status()).rejects.toThrow(
      'Gatekeeper local service is unavailable.',
    );
    expect(fetchImplementation).not.toHaveBeenCalled();
    await expect(invalidResponse.status()).rejects.toThrow(
      'Gatekeeper local service returned an invalid response.',
    );
    await expect(invalidResponse.status()).rejects.not.toThrow('do not leak');
    await expect(repairResponse.reviewPullRequest(12)).rejects.toThrow(
      'GitHub authentication is required for this local operation. Run gh auth login --hostname github.com.',
    );
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
