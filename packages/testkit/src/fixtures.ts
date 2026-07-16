import type { RepositoryId, ReviewId, ReviewRun } from '@gatekeeper/domain';

export function createReviewRunFixture(): ReviewRun {
  return {
    schemaVersion: 1,
    reviewId: 'review_fixture' as ReviewId,
    repositoryId: 'repository_fixture' as RepositoryId,
    target: { kind: 'worktree', display: 'Current worktree' },
    verdict: 'FAST_PATH',
    summary: 'The change is ready for review.',
    findings: [],
    metrics: { filesChanged: 1, linesAdded: 3, linesDeleted: 1 },
    createdAt: '2026-07-16T20:00:00.000Z',
  };
}
