import type { RepositoryId, ReviewId } from '@gatekeeper/domain';
import { describe, expect, it } from 'vitest';

import { runPullRequestReview } from './pull-request-review.js';

describe('pull-request review composition', () => {
  it('uses the review identity preallocated by the local service', async () => {
    const result = await runPullRequestReview(
      'D:/work/fixture',
      12,
      {
        repositoryId: 'repository_persisted' as RepositoryId,
        previousReviewId: 'review_previous' as ReviewId,
        reviewId: 'review_preallocated' as ReviewId,
      },
      {
        createReviewId: () => 'review_fallback' as ReviewId,
        inspectRepository: () =>
          Promise.resolve({
            root: 'D:/work/fixture',
            branch: 'master',
            head: 'a'.repeat(40),
            dirty: false,
            remote: 'https://github.com/xyzbk/gatekeeper.git',
          }),
        loadPolicy: () =>
          Promise.resolve({ path: null, policy: { version: 1 }, source: 'default' }),
        now: () => '2026-07-19T12:00:00.000Z',
        github: {
          preflight: () =>
            Promise.resolve({ schemaVersion: 1, host: 'github.com', authenticated: true }),
          getPullRequest: () =>
            Promise.resolve({
              number: 12,
              title: 'Aligned change',
              body: '',
              state: 'OPEN',
              url: 'https://github.com/xyzbk/gatekeeper/pull/12',
              author: 'xyzbk',
              baseRefName: 'master',
              headRefName: 'aligned-change',
              headRefOid: 'b'.repeat(40),
              additions: 0,
              deletions: 0,
              changedFiles: 0,
              checks: 'pass',
              isDraft: false,
              closingIssueNumbers: [],
              createdAt: '2026-07-19T10:00:00Z',
              updatedAt: '2026-07-19T11:00:00Z',
              closedAt: null,
              mergedAt: null,
            }),
          getPullRequestDiff: () =>
            Promise.resolve({
              schemaVersion: 1,
              target: {
                kind: 'pull_request',
                display: 'Pull request #12',
                pullRequestNumber: 12,
              },
              files: [],
            }),
          listHistoricalDocuments: () => Promise.reject(new Error('not used by direct review')),
        },
      },
    );

    expect(result.review).toMatchObject({
      reviewId: 'review_preallocated',
      repositoryId: 'repository_persisted',
      previousReviewId: 'review_previous',
      target: { kind: 'pull_request', pullRequestNumber: 12 },
    });
  });
});
