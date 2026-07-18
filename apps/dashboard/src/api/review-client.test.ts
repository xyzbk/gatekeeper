import type { DashboardBootstrap, ReviewRunContract } from '@gatekeeper/contracts';
import { describe, expect, it, vi } from 'vitest';

const bearerToken = 'a'.repeat(43);
const bootstrap: DashboardBootstrap = { apiBaseUrl: '/v1', bearerToken };
const review: ReviewRunContract = {
  schemaVersion: 1,
  reviewId: 'review_client_test',
  repositoryId: 'repository_client_test',
  target: { kind: 'worktree', display: 'Current worktree' },
  verdict: 'FAST_PATH',
  summary: 'FAST_PATH: 1 changed file, 0 deterministic findings.',
  findings: [],
  metrics: {
    filesChanged: 1,
    linesAdded: 2,
    linesDeleted: 1,
    productionFilesChanged: 1,
    testFilesChanged: 0,
    documentationFilesChanged: 0,
    pathGroups: [{ name: 'src', count: 1 }],
  },
  changes: [
    {
      path: 'src/app.ts',
      status: 'modified',
      additions: 2,
      deletions: 1,
      binary: false,
      contentTruncated: false,
    },
  ],
  createdAt: '2026-07-18T12:00:00.000Z',
};

function jsonResponse(body: unknown, statusCode = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: statusCode,
  });
}

describe('review client', () => {
  it('keeps the token only in the Authorization header and parses ReviewRun', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(bootstrap))
      .mockResolvedValueOnce(jsonResponse(review));
    const { createReviewClient } = await import('./review-client.js');

    await expect(createReviewClient(fetcher).reviewWorktree()).resolves.toEqual(review);

    expect(fetcher).toHaveBeenNthCalledWith(2, '/v1/reviews/worktree', {
      body: '{}',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
    const request = fetcher.mock.calls[1];
    expect(JSON.stringify(request?.[1]?.body)).not.toContain(bearerToken);
  });

  it('rejects failed, malformed, and invalid responses without echoing content', async () => {
    const { createReviewClient } = await import('./review-client.js');
    const failedFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(bootstrap))
      .mockResolvedValueOnce(jsonResponse({ private: 'source detail' }, 500));
    const invalidFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(bootstrap))
      .mockResolvedValueOnce(jsonResponse({ private: 'source detail' }));
    const malformedFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(bootstrap))
      .mockResolvedValueOnce(new Response('private source detail', { status: 200 }));

    await expect(createReviewClient(failedFetcher).reviewWorktree()).rejects.toThrow(
      'Gatekeeper review is unavailable.',
    );
    await expect(createReviewClient(invalidFetcher).reviewWorktree()).rejects.toThrow(
      'Gatekeeper review returned an invalid response.',
    );
    await expect(createReviewClient(malformedFetcher).reviewWorktree()).rejects.toThrow(
      'Gatekeeper review returned invalid JSON.',
    );
  });
});
