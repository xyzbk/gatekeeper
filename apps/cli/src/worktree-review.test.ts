import type { ChangeSet, RepositorySnapshot, ReviewRunContract } from '@gatekeeper/contracts';
import { reviewRunSchema } from '@gatekeeper/contracts';
import type { RepositoryId, ReviewId } from '@gatekeeper/domain';
import { describe, expect, it, vi } from 'vitest';

import {
  classifyReviewCommandError,
  formatWorktreeReview,
  runWorktreeReview,
} from './worktree-review.js';

const repository: RepositorySnapshot = {
  root: '/target/repository',
  branch: 'master',
  head: 'a'.repeat(40),
  dirty: true,
  remote: null,
};

const changes: ChangeSet = {
  schemaVersion: 1,
  target: { kind: 'worktree', display: 'Current worktree' },
  files: [
    {
      path: 'src/app.ts',
      status: 'modified',
      additions: 1,
      deletions: 0,
      binary: false,
      contentTruncated: false,
      addedLines: ['export const changed = true;'],
    },
  ],
};

describe('runWorktreeReview', () => {
  it('uses one ordered composition and forwards policy ignores to bounded extraction', async () => {
    const events: string[] = [];
    const inspectRepository = vi.fn((path: string) => {
      events.push(`inspect:${path}`);
      return Promise.resolve(repository);
    });
    const loadPolicy = vi.fn((root: string) => {
      events.push(`policy:${root}`);
      return Promise.resolve({
        path: `${root}/.gatekeeper/policies.yaml`,
        policy: { version: 1 as const, paths: { ignore: ['dist/**'] } },
        source: 'file' as const,
      });
    });
    const getWorktreeDiff = vi.fn((root: string) => {
      events.push(`diff:${root}`);
      return Promise.resolve(changes);
    });

    const result = await runWorktreeReview('.', {
      createRepositoryId: () => 'repository_test' as RepositoryId,
      createReviewId: () => 'review_test' as ReviewId,
      getWorktreeDiff,
      inspectRepository,
      loadPolicy,
      now: () => '2026-07-18T12:00:00.000Z',
    });

    expect(events).toEqual(['inspect:.', 'policy:/target/repository', 'diff:/target/repository']);
    expect(inspectRepository).toHaveBeenCalledWith('.');
    expect(loadPolicy).toHaveBeenCalledWith(repository.root);
    expect(getWorktreeDiff).toHaveBeenCalledWith(repository.root, {
      ignorePatterns: ['dist/**'],
    });
    expect(reviewRunSchema.parse(result)).toEqual(result);
  });

  it('uses the persistent repository identity and previous review context when provided', async () => {
    const result = await runWorktreeReview(
      '.',
      {
        createRepositoryId: () => 'repository_fallback' as RepositoryId,
        createReviewId: () => 'review_next' as ReviewId,
        getWorktreeDiff: () => Promise.resolve({ ...changes, files: [] }),
        inspectRepository: () => Promise.resolve(repository),
        loadPolicy: () =>
          Promise.resolve({ path: null, policy: { version: 1 }, source: 'default' }),
        now: () => '2026-07-18T12:00:00.000Z',
      },
      {
        repositoryId: 'repository_persisted' as RepositoryId,
        previousReviewId: 'review_previous' as ReviewId,
      },
    );

    expect(result.repositoryId).toBe('repository_persisted');
    expect(result.previousReviewId).toBe('review_previous');
  });
});

describe('worktree review presentation', () => {
  const findingReview: ReviewRunContract = reviewRunSchema.parse({
    schemaVersion: 1,
    reviewId: 'review_test',
    repositoryId: 'repository_test',
    target: { kind: 'worktree', display: 'Current worktree' },
    verdict: 'REQUIRE_CHANGES',
    summary: 'REQUIRE_CHANGES: 1 changed file, 1 deterministic finding.',
    findings: [
      {
        id: 'finding:test:source-needs-tests',
        category: 'test-coverage',
        severity: 'medium',
        authority: 'DETERMINISTIC',
        confidence: 1,
        title: 'Related test change required',
        explanation: 'A related source changed without a test.',
        evidence: [],
        affectedPaths: ['src/app.ts'],
        remediation: ['Add a matching test change.'],
        falsePositiveRisk: 'low',
        humanApprovalRequired: false,
        policyId: 'source-needs-tests',
        enforcement: 'required',
      },
    ],
    metrics: {
      filesChanged: 1,
      linesAdded: 1,
      linesDeleted: 0,
      productionFilesChanged: 1,
      testFilesChanged: 0,
      documentationFilesChanged: 0,
      pathGroups: [{ name: 'src', count: 1 }],
    },
    changes: [
      {
        path: 'src/app.ts',
        status: 'modified',
        additions: 1,
        deletions: 0,
        binary: false,
        contentTruncated: false,
      },
    ],
    createdAt: '2026-07-18T12:00:00.000Z',
  });

  it('emits JSON that validates through the shared ReviewRun schema', () => {
    const output = formatWorktreeReview(findingReview, 'json');

    expect(reviewRunSchema.parse(JSON.parse(output))).toEqual(findingReview);
  });

  it('emits a human verdict, finding, affected path, and remediation', () => {
    const output = formatWorktreeReview(findingReview, 'human');

    expect(output).toContain('Verdict: REQUIRE_CHANGES');
    expect(output).toContain('Changes: 1 file, +1, -0');
    expect(output).toContain('Related test change required');
    expect(output).toContain('src/app.ts');
    expect(output).toContain('Remediation: Add a matching test change.');
  });

  it('maps only safe stable error categories and never echoes internal details', async () => {
    const [{ RepositoryPolicyError }, { RepositoryInspectionError }, { WorktreeDiffError }] =
      await Promise.all([
        import('@gatekeeper/config'),
        import('@gatekeeper/git-adapter'),
        import('@gatekeeper/git-adapter'),
      ]);

    expect(
      classifyReviewCommandError(
        new RepositoryPolicyError('MISSING_POLICY', 'No repository policy was found.'),
      ),
    ).toEqual({ exitCode: 2, message: 'No repository policy was found.' });
    expect(
      classifyReviewCommandError(
        new RepositoryInspectionError('NOT_A_REPOSITORY', 'Git could not resolve a repository.'),
      ),
    ).toEqual({ exitCode: 3, message: 'Git could not resolve a repository.' });
    expect(
      classifyReviewCommandError(
        new WorktreeDiffError('DIFF_TOO_LARGE', 'The worktree diff exceeds its safe limit.'),
      ),
    ).toEqual({ exitCode: 3, message: 'The worktree diff exceeds its safe limit.' });

    const internal = classifyReviewCommandError(new Error('private source and token'));
    expect(internal).toEqual({
      exitCode: 6,
      message: 'Gatekeeper could not complete the worktree review.',
    });
    expect(internal.message).not.toContain('private');
  });
});
