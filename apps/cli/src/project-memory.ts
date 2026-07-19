import {
  loadRepositoryPolicy,
  PolicyValidationError,
  RepositoryPolicyError,
  resolveProjectMemoryDatabasePath,
  type LoadedRepositoryPolicy,
} from '@gatekeeper/config';
import {
  githubSyncLimitsSchema,
  commitReviewInputSchema,
  memorySearchResponseSchema,
  repositoryStatusSchema,
  type GitHubSyncResult,
  type IndexResult,
  type MemorySearchResult,
  type RepositoryRecord,
  type RepositorySnapshot,
  type RepositoryStatus,
  type ReviewRunContract,
} from '@gatekeeper/contracts';
import type { RepositoryId, ReviewId } from '@gatekeeper/domain';
import {
  createGitProvider,
  RepositoryInspectionError,
  WorktreeDiffError,
} from '@gatekeeper/git-adapter';
import {
  createGitHubProvider,
  GitHubProviderError,
  normalizeGitHubRemote,
  pullRequestToRemoteRecord,
  type GitHubProvider,
} from '@gatekeeper/github-gh';
import {
  createProjectMemory,
  ProjectMemoryError,
  type ProjectMemory,
} from '@gatekeeper/project-memory';
import { openSqliteProjectStore, SqliteProjectStoreError } from '@gatekeeper/store-sqlite';

import { runCommitReview, type CommitReviewContext } from './commit-review.js';
import {
  runWorktreeReview,
  type OutputFormat,
  type WorktreeReviewContext,
} from './worktree-review.js';
import {
  runPullRequestReview,
  type PullRequestReviewContext,
  type PullRequestReviewResult,
} from './pull-request-review.js';

export type ProjectMemoryCommandErrorCode =
  'NOT_INITIALIZED' | 'REMOTE_REQUIRED' | 'REVIEW_NOT_FOUND';

export class ProjectMemoryCommandError extends Error {
  public constructor(
    public readonly code: ProjectMemoryCommandErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectMemoryCommandError';
  }
}

export interface ProjectMemoryCommandFailure {
  exitCode: 2 | 3 | 4 | 6;
  message: string;
}

interface ProjectMemorySession {
  memory: ProjectMemory;
  close: () => void | Promise<void>;
}

interface ProjectMemoryCommandDependencies {
  githubProvider?: GitHubProvider;
  inspectRepository: (path: string) => Promise<RepositorySnapshot>;
  loadPolicy: (root: string) => Promise<LoadedRepositoryPolicy>;
  openSession: () => Promise<ProjectMemorySession>;
  reviewWorktree: (
    repositoryPath: string,
    context: WorktreeReviewContext,
  ) => Promise<ReviewRunContract>;
  reviewPullRequest?: (
    repositoryPath: string,
    pullRequestNumber: number,
    context: PullRequestReviewContext,
  ) => Promise<PullRequestReviewResult>;
  reviewCommit?: (
    repositoryPath: string,
    sha: string,
    context: CommitReviewContext,
  ) => Promise<ReviewRunContract>;
}

export interface ProjectMemoryCommands {
  initialize(repositoryPath: string): Promise<RepositoryRecord>;
  status(repositoryPath: string): Promise<RepositoryStatus>;
  index(repositoryPath: string): Promise<IndexResult>;
  search(repositoryPath: string, query: string, limit?: number): Promise<MemorySearchResult[]>;
  syncGitHub(repositoryPath: string): Promise<GitHubSyncResult>;
  reviewPullRequest(pullRequestNumber: number, repositoryPath: string): Promise<ReviewRunContract>;
  reviewCommit(sha: string, repositoryPath: string): Promise<ReviewRunContract>;
  reviewWorktree(repositoryPath: string): Promise<ReviewRunContract>;
  showReview(reviewId: string): Promise<ReviewRunContract>;
}

const gitProvider = createGitProvider();
const githubProvider = createGitHubProvider();

async function openDefaultSession(): Promise<ProjectMemorySession> {
  const store = openSqliteProjectStore({ databasePath: resolveProjectMemoryDatabasePath() });
  const memory = createProjectMemory({ persistence: store, git: gitProvider });
  try {
    await memory.migrate();
    return { memory, close: () => store.close() };
  } catch (error) {
    store.close();
    throw error;
  }
}

const defaultDependencies: ProjectMemoryCommandDependencies = {
  inspectRepository: (path) => gitProvider.inspectRepository(path),
  githubProvider,
  loadPolicy: (root) => loadRepositoryPolicy(root),
  openSession: openDefaultSession,
  reviewWorktree: (path, context) => runWorktreeReview(path, undefined, context),
  reviewPullRequest: (path, number, context) => runPullRequestReview(path, number, context),
  reviewCommit: (path, sha, context) => runCommitReview(path, sha, undefined, context),
};

async function withSession<T>(
  openSession: ProjectMemoryCommandDependencies['openSession'],
  action: (memory: ProjectMemory) => Promise<T>,
): Promise<T> {
  const session = await openSession();
  try {
    return await action(session.memory);
  } finally {
    await session.close();
  }
}

async function findInitializedRepository(
  memory: ProjectMemory,
  snapshot: RepositorySnapshot,
): Promise<RepositoryRecord> {
  const repository = await memory.findRepository({ root: snapshot.root, remote: snapshot.remote });
  if (repository === null) {
    throw new ProjectMemoryCommandError(
      'NOT_INITIALIZED',
      'Initialize this repository with `gatekeeper repo init` first.',
    );
  }
  return repository;
}

function requireGitHubRemote(snapshot: RepositorySnapshot) {
  if (snapshot.remote === null) {
    throw new ProjectMemoryCommandError(
      'REMOTE_REQUIRED',
      'The repository needs a GitHub origin remote for this command.',
    );
  }
  return normalizeGitHubRemote(snapshot.remote);
}

export function createProjectMemoryCommands(
  dependencies: ProjectMemoryCommandDependencies = defaultDependencies,
): ProjectMemoryCommands {
  const selectedGitHubProvider = dependencies.githubProvider ?? githubProvider;
  const selectedPullRequestReview =
    dependencies.reviewPullRequest ??
    ((path: string, number: number, context: PullRequestReviewContext) =>
      runPullRequestReview(path, number, context));
  const selectedCommitReview =
    dependencies.reviewCommit ??
    ((path: string, sha: string, context: CommitReviewContext) =>
      runCommitReview(path, sha, undefined, context));
  return {
    initialize: async (repositoryPath) => {
      const snapshot = await dependencies.inspectRepository(repositoryPath);
      return withSession(dependencies.openSession, (memory) =>
        memory.registerRepository({ root: snapshot.root, remote: snapshot.remote }),
      );
    },
    status: async (repositoryPath) => {
      const snapshot = await dependencies.inspectRepository(repositoryPath);
      return withSession(dependencies.openSession, async (memory) => {
        const repository = await memory.findRepository({
          root: snapshot.root,
          remote: snapshot.remote,
        });
        return repositoryStatusSchema.parse(
          repository === null
            ? {
                schemaVersion: 1,
                state: 'not_initialized',
                repository: null,
                indexState: null,
              }
            : {
                schemaVersion: 1,
                state: 'ready',
                repository,
                indexState: await memory.getIndexState(repository.repositoryId),
              },
        );
      });
    },
    index: async (repositoryPath) => {
      const snapshot = await dependencies.inspectRepository(repositoryPath);
      const loadedPolicy = await dependencies.loadPolicy(snapshot.root);
      return withSession(dependencies.openSession, async (memory) => {
        const repository = await findInitializedRepository(memory, snapshot);
        return memory.indexLocalRepository({
          repositoryId: repository.repositoryId,
          ignorePatterns: loadedPolicy.policy.paths?.ignore ?? [],
        });
      });
    },
    search: async (repositoryPath, query, limit) => {
      const snapshot = await dependencies.inspectRepository(repositoryPath);
      return withSession(dependencies.openSession, async (memory) => {
        const repository = await findInitializedRepository(memory, snapshot);
        return memory.search({
          schemaVersion: 1,
          repositoryId: repository.repositoryId,
          query,
          ...(limit === undefined ? {} : { limit }),
        });
      });
    },
    syncGitHub: async (repositoryPath) => {
      const snapshot = await dependencies.inspectRepository(repositoryPath);
      const remote = requireGitHubRemote(snapshot);
      await selectedGitHubProvider.preflight(remote);
      return withSession(dependencies.openSession, async (memory) => {
        const repository = await findInitializedRepository(memory, snapshot);
        const cursor = await memory.getRemoteSyncCursor(repository.repositoryId, 'github');
        const batch = await selectedGitHubProvider.listHistoricalDocuments(
          remote,
          githubSyncLimitsSchema.parse({}),
          cursor,
        );
        return memory.indexRemoteDocuments({
          repositoryId: repository.repositoryId,
          provider: 'github',
          batch,
        });
      });
    },
    reviewPullRequest: async (pullRequestNumber, repositoryPath) => {
      const snapshot = await dependencies.inspectRepository(repositoryPath);
      requireGitHubRemote(snapshot);
      return withSession(dependencies.openSession, async (memory) => {
        const repository = await memory.registerRepository({
          root: snapshot.root,
          remote: snapshot.remote,
        });
        const target = {
          kind: 'pull_request' as const,
          display: `Pull request #${pullRequestNumber}`,
          pullRequestNumber,
        };
        const previousReviewId = await memory.latestReviewId(repository.repositoryId, target);
        const result = await selectedPullRequestReview(snapshot.root, pullRequestNumber, {
          repositoryId: repository.repositoryId as RepositoryId,
          ...(previousReviewId === null ? {} : { previousReviewId: previousReviewId as ReviewId }),
        });
        await memory.indexRemoteDocuments({
          repositoryId: repository.repositoryId,
          provider: 'github',
          batch: {
            schemaVersion: 1,
            records: [pullRequestToRemoteRecord(result.pullRequest)],
            failures: [],
            cursor: null,
            partial: false,
          },
        });
        await memory.saveReview(result.review);
        return result.review;
      });
    },
    reviewCommit: async (sha, repositoryPath) => {
      const input = commitReviewInputSchema.parse({ schemaVersion: 1, sha });
      const snapshot = await dependencies.inspectRepository(repositoryPath);
      return withSession(dependencies.openSession, async (memory) => {
        const repository = await memory.registerRepository({
          root: snapshot.root,
          remote: snapshot.remote,
        });
        const target = {
          kind: 'commit_range' as const,
          display: `Commit ${input.sha.slice(0, 12)}`,
          head: input.sha,
        };
        const previousReviewId = await memory.latestReviewId(repository.repositoryId, target);
        const review = await selectedCommitReview(snapshot.root, input.sha, {
          repositoryId: repository.repositoryId as RepositoryId,
          ...(previousReviewId === null ? {} : { previousReviewId: previousReviewId as ReviewId }),
        });
        await memory.saveReview(review);
        return review;
      });
    },
    reviewWorktree: async (repositoryPath) => {
      const snapshot = await dependencies.inspectRepository(repositoryPath);
      return withSession(dependencies.openSession, async (memory) => {
        const repository = await memory.registerRepository({
          root: snapshot.root,
          remote: snapshot.remote,
        });
        const target = { kind: 'worktree' as const, display: 'Current worktree' };
        const previousReviewId = await memory.latestReviewId(repository.repositoryId, target);
        const review = await dependencies.reviewWorktree(snapshot.root, {
          repositoryId: repository.repositoryId as RepositoryId,
          ...(previousReviewId === null ? {} : { previousReviewId: previousReviewId as ReviewId }),
        });
        await memory.saveReview(review);
        return review;
      });
    },
    showReview: (reviewId) =>
      withSession(dependencies.openSession, async (memory) => {
        const review = await memory.getReview(reviewId);
        if (review === null) {
          throw new ProjectMemoryCommandError('REVIEW_NOT_FOUND', 'No stored review has that ID.');
        }
        return review;
      }),
  };
}

export function formatRepositoryRecord(record: RepositoryRecord, format: OutputFormat): string {
  return format === 'json'
    ? `${JSON.stringify(record, null, 2)}\n`
    : `Repository: ${record.repositoryId}\nRoot: ${record.root}\n`;
}

export function formatRepositoryStatus(status: RepositoryStatus, format: OutputFormat): string {
  if (format === 'json') {
    return `${JSON.stringify(status, null, 2)}\n`;
  }
  if (status.state === 'not_initialized') {
    return 'Project Memory: not initialized\n';
  }
  return [
    'Project Memory: ready',
    `Repository: ${status.repository.repositoryId}`,
    status.indexState === null
      ? 'Index: not built'
      : `Index: ${status.indexState.documents} documents at ${status.indexState.head.slice(0, 12)}`,
    '',
  ].join('\n');
}

export function formatIndexResult(result: IndexResult, format: OutputFormat): string {
  if (format === 'json') {
    return `${JSON.stringify(result, null, 2)}\n`;
  }
  return [
    `Indexed: ${result.repositoryId}`,
    `Files: ${result.files.written} written, ${result.files.unchanged} unchanged, ${result.files.deleted} deleted`,
    `Documents: ${result.documents.written} written, ${result.documents.unchanged} unchanged, ${result.documents.deleted} deleted`,
    `Commits: ${result.commits.written} written, ${result.commits.unchanged} unchanged, ${result.commits.deleted} deleted`,
    '',
  ].join('\n');
}

export function formatGitHubSyncResult(result: GitHubSyncResult, format: OutputFormat): string {
  if (format === 'json') {
    return `${JSON.stringify(result, null, 2)}\n`;
  }
  return [
    `GitHub sync: ${result.partial ? 'partial' : 'complete'}`,
    `Documents: ${result.documents.written} written, ${result.documents.unchanged} unchanged`,
    `Relationships: ${result.links.written} written, ${result.links.unchanged} unchanged`,
    `Cursor: ${result.cursor ?? 'not advanced'}`,
    '',
  ].join('\n');
}

export function formatMemorySearch(
  results: readonly MemorySearchResult[],
  format: OutputFormat,
): string {
  const response = memorySearchResponseSchema.parse({ schemaVersion: 1, results });
  if (format === 'json') {
    return `${JSON.stringify(response, null, 2)}\n`;
  }
  if (response.results.length === 0) {
    return 'No Project Memory evidence matched.\n';
  }
  return `${response.results
    .map(({ evidence, match, trust }) => {
      const location = evidence.path ?? evidence.sourceId;
      return `[${trust}/${match}] ${evidence.sourceType} ${location}\n${evidence.excerpt ?? ''}`.trimEnd();
    })
    .join('\n\n')}\n`;
}

export function classifyProjectMemoryCommandError(error: unknown): ProjectMemoryCommandFailure {
  if (error instanceof ProjectMemoryCommandError) {
    return { exitCode: 2, message: error.message };
  }
  if (error instanceof RepositoryPolicyError || error instanceof PolicyValidationError) {
    return { exitCode: 2, message: 'The repository policy is missing or invalid.' };
  }
  if (error instanceof RepositoryInspectionError || error instanceof WorktreeDiffError) {
    return { exitCode: 3, message: error.message };
  }
  if (error instanceof GitHubProviderError) {
    return {
      exitCode: error.code === 'AUTH_REQUIRED' || error.code === 'GH_UNAVAILABLE' ? 3 : 4,
      message: [error.message, error.repair].filter(Boolean).join(' '),
    };
  }
  if (error instanceof ProjectMemoryError) {
    return {
      exitCode: error.code === 'INDEX_SOURCE_FAILED' ? 4 : 2,
      message: error.message,
    };
  }
  if (error instanceof SqliteProjectStoreError) {
    if (error.code === 'INDEX_WRITE_FAILED' || error.code === 'REMOTE_SYNC_WRITE_FAILED') {
      return { exitCode: 4, message: error.message };
    }
    if (
      error.code === 'DATABASE_OPEN_FAILED' ||
      error.code === 'MIGRATION_FAILED' ||
      error.code === 'FTS5_UNAVAILABLE'
    ) {
      return { exitCode: 3, message: error.message };
    }
  }
  if (error instanceof Error && error.name === 'ZodError') {
    return { exitCode: 2, message: 'The Project Memory command input is invalid.' };
  }
  return { exitCode: 6, message: 'Gatekeeper could not complete the Project Memory command.' };
}
