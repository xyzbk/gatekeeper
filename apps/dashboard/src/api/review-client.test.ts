import type {
  DashboardBootstrap,
  ReviewOperationContract,
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
const queued: ReviewOperationContract = {
  schemaVersion: 1,
  reviewId: review.reviewId,
  repositoryId: review.repositoryId,
  target: review.target,
  status: 'queued',
  stage: 'queued',
  createdAt: review.createdAt,
  updatedAt: review.createdAt,
};
const completed: ReviewOperationContract = {
  ...queued,
  status: 'completed',
  stage: 'completed',
  review,
  previousReview: null,
  historySync: null,
  evidenceTimeline: [],
};

function jsonResponse(body: unknown, statusCode = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: statusCode,
  });
}

describe('review client', () => {
  it('starts a worktree operation and keeps the token only in the header', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(bootstrap))
      .mockResolvedValueOnce(jsonResponse(queued, 202));
    const { createReviewClient } = await import('./review-client.js');

    await expect(createReviewClient(fetcher).startWorktreeReview()).resolves.toEqual(queued);

    expect(fetcher).toHaveBeenNthCalledWith(2, '/v1/reviews/worktree/start', {
      body: '{}',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
    expect(JSON.stringify(fetcher.mock.calls[1]?.[1]?.body)).not.toContain(bearerToken);
  });

  it('starts one pull-request operation without a duplicate repository or sync request', async () => {
    const pullRequestOperation: ReviewOperationContract = {
      ...queued,
      target: { kind: 'pull_request', display: 'Pull request #12', pullRequestNumber: 12 },
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(bootstrap))
      .mockResolvedValueOnce(jsonResponse(pullRequestOperation, 202));
    const { createReviewClient } = await import('./review-client.js');
    const client = createReviewClient(fetcher);

    await expect(client.startPullRequestReview(12)).resolves.toEqual(pullRequestOperation);
    await expect(client.startPullRequestReview(0)).rejects.toThrow(
      'Pull-request number must be a positive integer.',
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(2, '/v1/reviews/pull-request/start', {
      body: JSON.stringify({ schemaVersion: 1, pullRequestNumber: 12 }),
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
  });

  it('starts one strict historical commit operation', async () => {
    const commitOperation: ReviewOperationContract = {
      ...queued,
      target: {
        kind: 'commit_range',
        display: 'Commit cccccccccccc',
        base: 'b'.repeat(40),
        head: 'c'.repeat(40),
      },
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(bootstrap))
      .mockResolvedValueOnce(jsonResponse(commitOperation, 202));
    const { createReviewClient } = await import('./review-client.js');

    await expect(createReviewClient(fetcher).startCommitReview('c'.repeat(40))).resolves.toEqual(
      commitOperation,
    );
    expect(fetcher).toHaveBeenNthCalledWith(2, '/v1/reviews/commit/start', {
      body: JSON.stringify({ schemaVersion: 1, sha: 'c'.repeat(40) }),
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
  });

  it('polls queued and completed operation lookups with abort support', async () => {
    const controller = new AbortController();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(bootstrap))
      .mockResolvedValueOnce(jsonResponse(queued))
      .mockResolvedValueOnce(jsonResponse(completed));
    const { createReviewClient } = await import('./review-client.js');
    const client = createReviewClient(fetcher);

    await expect(client.getReview(review.reviewId, controller.signal)).resolves.toEqual(queued);
    await expect(client.getReview(review.reviewId)).resolves.toEqual(completed);
    expect(fetcher.mock.calls[1]?.[1]?.signal).toBe(controller.signal);
  });

  it('returns bounded unavailable and not-found errors for bad lookups', async () => {
    const { createReviewClient, ReviewClientError } = await import('./review-client.js');
    const unavailable = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(bootstrap))
      .mockResolvedValueOnce(jsonResponse({ private: 'source detail' }, 500));
    const missing = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(bootstrap))
      .mockResolvedValueOnce(jsonResponse({}, 404));
    const invalid = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(bootstrap))
      .mockResolvedValueOnce(jsonResponse({ private: 'source detail' }));

    await expect(createReviewClient(unavailable).getReview('review_private')).rejects.toEqual(
      new ReviewClientError('UNAVAILABLE', 'Stored review is unavailable.'),
    );
    await expect(createReviewClient(missing).getReview('review_missing')).rejects.toEqual(
      new ReviewClientError('NOT_FOUND', 'Stored review not found.'),
    );
    await expect(createReviewClient(invalid).getReview('review_private')).rejects.toThrow(
      'Gatekeeper review returned an invalid response.',
    );
  });
});
