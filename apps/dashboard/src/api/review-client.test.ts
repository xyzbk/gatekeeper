import type {
  DashboardBootstrap,
  GitHubSyncResult,
  RepositoryRecord,
  ReviewRunContract,
} from '@gatekeeper/contracts';
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
const repository: RepositoryRecord = {
  schemaVersion: 1,
  repositoryId: review.repositoryId,
  root: 'D:\\work\\gatekeeper',
  remote: 'https://github.com/xyzbk/gatekeeper.git',
  createdAt: review.createdAt,
  updatedAt: review.createdAt,
};
const syncResult: GitHubSyncResult = {
  schemaVersion: 1,
  repositoryId: repository.repositoryId,
  provider: 'github',
  syncedAt: review.createdAt,
  cursor: null,
  partial: true,
  documents: { received: 2, written: 1, unchanged: 0 },
  links: { received: 1, written: 1, unchanged: 0 },
  failures: [{ source: 'review:99', code: 'malformed_record' }],
};
const pullRequestReview: ReviewRunContract = {
  ...review,
  reviewId: 'review_client_pr_12',
  target: { kind: 'pull_request', display: 'Pull request #12', pullRequestNumber: 12 },
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

  it('reads a persisted review and distinguishes not found from unavailable', async () => {
    const { createReviewClient, ReviewClientError } = await import('./review-client.js');
    const foundFetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(review));
    const missingFetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({}, 404));
    const loadBootstrap = () => Promise.resolve(bootstrap);

    await expect(
      createReviewClient(foundFetcher, loadBootstrap).getReview(review.reviewId),
    ).resolves.toEqual(review);
    expect(foundFetcher).toHaveBeenCalledWith(`/v1/reviews/${review.reviewId}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Authorization: `Bearer ${bearerToken}` },
      method: 'GET',
    });
    await expect(
      createReviewClient(missingFetcher, loadBootstrap).getReview('review_missing'),
    ).rejects.toEqual(new ReviewClientError('NOT_FOUND', 'Stored review not found.'));
  });

  it('explicitly synchronizes the fixed repository before reviewing one pull request', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(repository))
      .mockResolvedValueOnce(jsonResponse(syncResult))
      .mockResolvedValueOnce(jsonResponse(pullRequestReview));
    const { createReviewClient } = await import('./review-client.js');
    const client = createReviewClient(fetcher, () => Promise.resolve(bootstrap));

    await expect(client.reviewPullRequest(12)).resolves.toEqual({
      review: pullRequestReview,
      sync: syncResult,
    });
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
      `/v1/repositories/${repository.repositoryId}/sync/github`,
      expect.objectContaining({ body: '{}', method: 'POST' }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      '/v1/reviews/pull-request',
      expect.objectContaining({
        body: JSON.stringify({ schemaVersion: 1, pullRequestNumber: 12 }),
        method: 'POST',
      }),
    );
  });

  it('rejects invalid pull-request numbers before loading bootstrap or making a request', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const loadBootstrap = vi.fn(() => Promise.resolve(bootstrap));
    const { createReviewClient } = await import('./review-client.js');

    await expect(createReviewClient(fetcher, loadBootstrap).reviewPullRequest(0)).rejects.toThrow(
      'Pull-request number must be a positive integer.',
    );
    expect(loadBootstrap).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
