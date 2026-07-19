import { randomUUID } from 'node:crypto';

import {
  loadRepositoryPolicy,
  PolicyValidationError,
  RepositoryPolicyError,
  type LoadedRepositoryPolicy,
} from '@gatekeeper/config';
import {
  reviewRunSchema,
  type ChangeSet,
  type RepositorySnapshot,
  type ReviewRunContract,
} from '@gatekeeper/contracts';
import type { RepositoryId, ReviewId } from '@gatekeeper/domain';
import {
  createGitProvider,
  RepositoryInspectionError,
  WorktreeDiffError,
  type WorktreeDiffOptions,
} from '@gatekeeper/git-adapter';
import { createLocalRepositoryId, reviewWorktree } from '@gatekeeper/review-engine';

export type OutputFormat = 'human' | 'json';

export interface WorktreeReviewDependencies {
  createRepositoryId: (canonicalRoot: string) => RepositoryId;
  createReviewId: () => ReviewId;
  getWorktreeDiff: (root: string, options?: WorktreeDiffOptions) => Promise<ChangeSet>;
  inspectRepository: (path: string) => Promise<RepositorySnapshot>;
  loadPolicy: (root: string) => Promise<LoadedRepositoryPolicy>;
  now: () => string;
}

export interface WorktreeReviewContext {
  repositoryId: RepositoryId;
  previousReviewId?: ReviewId;
  reviewId?: ReviewId;
}

export interface PolicyValidationDependencies {
  inspectRepository: (path: string) => Promise<RepositorySnapshot>;
  loadRequiredPolicy: (root: string) => Promise<LoadedRepositoryPolicy>;
}

export interface ReviewCommandError {
  exitCode: 2 | 3 | 6;
  message: string;
}

const gitProvider = createGitProvider();

const defaultReviewDependencies: WorktreeReviewDependencies = {
  createRepositoryId: createLocalRepositoryId,
  createReviewId: () => `review_${randomUUID().replaceAll('-', '')}` as ReviewId,
  getWorktreeDiff: (root, options) => gitProvider.getWorktreeDiff(root, options),
  inspectRepository: (path) => gitProvider.inspectRepository(path),
  loadPolicy: (root) => loadRepositoryPolicy(root),
  now: () => new Date().toISOString(),
};

const defaultPolicyValidationDependencies: PolicyValidationDependencies = {
  inspectRepository: (path) => gitProvider.inspectRepository(path),
  loadRequiredPolicy: (root) => loadRepositoryPolicy(root, { required: true }),
};

export async function runWorktreeReview(
  repositoryPath: string,
  dependencies: WorktreeReviewDependencies = defaultReviewDependencies,
  context?: WorktreeReviewContext,
): Promise<ReviewRunContract> {
  const repository = await dependencies.inspectRepository(repositoryPath);
  const loadedPolicy = await dependencies.loadPolicy(repository.root);
  const changeSet = await dependencies.getWorktreeDiff(repository.root, {
    ignorePatterns: loadedPolicy.policy.paths?.ignore ?? [],
  });
  const review = reviewWorktree({
    changeSet,
    createdAt: dependencies.now(),
    policy: loadedPolicy.policy,
    repositoryId: context?.repositoryId ?? dependencies.createRepositoryId(repository.root),
    reviewId: context?.reviewId ?? dependencies.createReviewId(),
    ...(context?.previousReviewId === undefined
      ? {}
      : { previousReviewId: context.previousReviewId }),
  });

  return reviewRunSchema.parse(review);
}

export async function validateRepositoryPolicy(
  repositoryPath: string,
  dependencies: PolicyValidationDependencies = defaultPolicyValidationDependencies,
): Promise<LoadedRepositoryPolicy> {
  const repository = await dependencies.inspectRepository(repositoryPath);
  return dependencies.loadRequiredPolicy(repository.root);
}

export function formatWorktreeReview(review: ReviewRunContract, format: OutputFormat): string {
  if (format === 'json') {
    return `${JSON.stringify(review, null, 2)}\n`;
  }

  const lines = [
    `Verdict: ${review.verdict}`,
    review.summary,
    `Changes: ${review.metrics.filesChanged} ${review.metrics.filesChanged === 1 ? 'file' : 'files'}, +${review.metrics.linesAdded}, -${review.metrics.linesDeleted}`,
  ];
  if (review.findings.length === 0) {
    lines.push('Findings: none');
  } else {
    lines.push('Findings:');
    for (const finding of review.findings) {
      lines.push(`- [${finding.authority}/${finding.severity}] ${finding.title}`);
      lines.push(`  ${finding.explanation}`);
      if (finding.affectedPaths !== undefined && finding.affectedPaths.length > 0) {
        lines.push(`  Affected: ${finding.affectedPaths.join(', ')}`);
      }
      for (const remediation of finding.remediation) {
        lines.push(`  Remediation: ${remediation}`);
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

export function classifyReviewCommandError(error: unknown): ReviewCommandError {
  if (error instanceof RepositoryPolicyError) {
    return { exitCode: 2, message: error.message };
  }
  if (error instanceof PolicyValidationError) {
    const paths = [...new Set(error.issues.map(({ path }) => path))];
    return { exitCode: 2, message: `The repository policy is invalid at: ${paths.join(', ')}.` };
  }
  if (error instanceof RepositoryInspectionError || error instanceof WorktreeDiffError) {
    return { exitCode: 3, message: error.message };
  }
  return { exitCode: 6, message: 'Gatekeeper could not complete the worktree review.' };
}
