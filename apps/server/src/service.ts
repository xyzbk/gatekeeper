import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';

import {
  loadRepositoryPolicy,
  resolveProjectMemoryDatabasePath,
  resolveServicePaths,
  type ServicePaths,
} from '@gatekeeper/config';
import {
  githubSyncLimitsSchema,
  reviewOperationSchema,
  serviceMetadataSchema,
  statusResponseSchema,
  type GitHubRemote,
  type GitHubSyncResult,
  type ReviewCompletionInput,
  type PullRequestRecord,
  type RepositorySnapshot,
  type MemorySearchInput,
  type ReviewOperationContract,
  type ReviewRunContract,
  type StatusResponse,
  type ToolAvailability,
} from '@gatekeeper/contracts';
import type { RepositoryId, ReviewId, ReviewRun } from '@gatekeeper/domain';
import { createGitProvider } from '@gatekeeper/git-adapter';
import {
  createGitHubProvider,
  GitHubProviderError,
  normalizeGitHubRemote,
  pullRequestToRemoteRecord,
  type GitHubProvider,
} from '@gatekeeper/github-gh';
import {
  buildEvidenceTimeline,
  createProjectMemory,
  normalizeRemoteIdentity,
} from '@gatekeeper/project-memory';
import { completeReview, prepareReviewDraft } from '@gatekeeper/review-engine';
import { openSqliteProjectStore, SqliteProjectStoreError } from '@gatekeeper/store-sqlite';
import type { FastifyInstance } from 'fastify';

import {
  buildGatekeeperServer,
  ReviewOperationUnavailableError,
  type BuildGatekeeperServerOptions,
} from './server.js';
import { exploreCommits as exploreLocalCommits } from './commit-explorer.js';

export interface StartGatekeeperServiceOptions {
  allowExternalEvidenceLinks?: boolean;
  bearerToken?: string;
  dashboardRoot: string;
  deterministicOnly?: boolean;
  logger?: BuildGatekeeperServerOptions['logger'];
  paths?: ServicePaths;
  repository: RepositorySnapshot;
  githubProvider?: GitHubProvider;
  inspectRepository?: (repositoryPath: string) => Promise<RepositorySnapshot>;
  reviewPullRequest: (
    pullRequestNumber: number,
    context: PersistentReviewContext,
  ) => Promise<PersistentPullRequestReviewResult>;
  reviewCommit?: (sha: string, context: PersistentReviewContext) => Promise<ReviewRunContract>;
  reviewWorktree: (context: PersistentReviewContext) => Promise<ReviewRunContract>;
  startedAt?: string;
  tools: {
    git: ToolAvailability;
    gh: ToolAvailability;
  };
  version: string;
}

export interface PersistentReviewContext {
  repositoryId: RepositoryId;
  previousReviewId?: ReviewId;
  reviewId: ReviewId;
}

export interface PersistentPullRequestReviewResult {
  pullRequest: PullRequestRecord;
  remote: GitHubRemote;
  review: ReviewRunContract;
}

export interface RunningGatekeeperService {
  baseUrl: string;
  bearerToken: string;
  close: () => Promise<void>;
  server: FastifyInstance;
  status: StatusResponse;
}

class ServiceOwnershipError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ServiceOwnershipError';
  }
}

interface ServiceOwnership {
  release: () => Promise<void>;
}

function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

async function readLockPid(lockPath: string): Promise<number | null> {
  try {
    const value: unknown = JSON.parse(await readFile(lockPath, 'utf8'));
    if (
      typeof value === 'object' &&
      value !== null &&
      'pid' in value &&
      typeof value.pid === 'number' &&
      Number.isSafeInteger(value.pid) &&
      value.pid > 0
    ) {
      return value.pid;
    }
  } catch {
    return null;
  }
  return null;
}

async function acquireServiceOwnership(paths: ServicePaths): Promise<ServiceOwnership> {
  const lockPath = `${paths.serviceMetadata}.lock`;
  await mkdir(paths.appData, { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, 'wx', 0o600);
      try {
        await handle.writeFile(`${JSON.stringify({ pid: process.pid })}\n`, 'utf8');
        await chmod(lockPath, 0o600);
      } finally {
        await handle.close();
      }
      return { release: () => rm(lockPath, { force: true }) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
      const pid = await readLockPid(lockPath);
      if (pid === null || processIsRunning(pid)) {
        throw new ServiceOwnershipError(
          'Gatekeeper is already running for this machine. Stop the existing foreground service before starting another one.',
        );
      }
      await rm(lockPath, { force: true });
    }
  }

  throw new ServiceOwnershipError(
    'Gatekeeper is already running for this machine. Stop the existing foreground service before starting another one.',
  );
}

async function writeServiceMetadata(
  paths: ServicePaths,
  metadata: ReturnType<typeof serviceMetadataSchema.parse>,
): Promise<void> {
  await mkdir(paths.appData, { recursive: true });
  await writeFile(paths.serviceMetadata, `${JSON.stringify(metadata, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await chmod(paths.serviceMetadata, 0o600);
}

export async function startGatekeeperService(
  options: StartGatekeeperServiceOptions,
): Promise<RunningGatekeeperService> {
  const bearerToken = options.bearerToken ?? randomBytes(32).toString('base64url');
  const paths = options.paths ?? resolveServicePaths();
  const startedAt = options.startedAt ?? new Date().toISOString();
  let ownership: ServiceOwnership | undefined;
  let store: ReturnType<typeof openSqliteProjectStore> | undefined;
  const github = options.githubProvider ?? createGitHubProvider();
  const fixedGitHubRemote = () => {
    if (options.repository.remote === null) {
      throw new GitHubProviderError(
        'INVALID_REMOTE',
        'The fixed repository has no GitHub remote.',
        'Configure an origin remote for a GitHub repository.',
      );
    }
    return normalizeGitHubRemote(options.repository.remote);
  };
  let status: StatusResponse | undefined;
  let server: FastifyInstance | undefined;

  try {
    ownership = await acquireServiceOwnership(paths);
    store = openSqliteProjectStore({
      databasePath: resolveProjectMemoryDatabasePath(paths.appData),
    });
    const git = createGitProvider();
    const memory = createProjectMemory({ persistence: store, git });
    const inspectFixedRepository = async (): Promise<RepositorySnapshot> => {
      const snapshot = await (options.inspectRepository ?? git.inspectRepository)(
        options.repository.root,
      );
      if (
        snapshot.root !== options.repository.root ||
        normalizeRemoteIdentity(snapshot.remote) !==
          normalizeRemoteIdentity(options.repository.remote)
      ) {
        throw new Error('The fixed repository identity changed while Gatekeeper was running.');
      }
      return snapshot;
    };
    await memory.migrate();
    if (store.inspectStoredState().integrity === 'corrupt') {
      throw new SqliteProjectStoreError(
        'CORRUPT_DATA',
        'Project Memory needs local repair before Gatekeeper can start safely.',
      );
    }
    const registeredRepository = await memory.registerRepository({
      root: options.repository.root,
      remote: options.repository.remote,
    });
    await memory.failInterruptedReviewOperations(startedAt);
    let acceptingReviewOperations = true;
    const activeReviewOperations = new Map<ReviewId, ReviewOperationContract>();
    const transientReviewOperations = new Map<string, ReviewOperationContract>();
    const createReviewId = () => `review_${randomUUID().replaceAll('-', '')}` as ReviewId;
    const createReviewContext = async (
      target: ReviewRunContract['target'],
      reviewId: ReviewId,
    ): Promise<PersistentReviewContext> => {
      const previousReviewId = await memory.latestReviewId(
        registeredRepository.repositoryId,
        target,
      );
      return {
        repositoryId: registeredRepository.repositoryId as RepositoryId,
        reviewId,
        ...(previousReviewId === null ? {} : { previousReviewId: previousReviewId as ReviewId }),
      };
    };
    const syncGitHub = async () => {
      const remote = fixedGitHubRemote();
      await github.preflight(remote);
      const cursor = await memory.getRemoteSyncCursor(registeredRepository.repositoryId, 'github');
      const batch = await github.listHistoricalDocuments(
        remote,
        githubSyncLimitsSchema.parse({}),
        cursor,
      );
      return memory.indexRemoteDocuments({
        repositoryId: registeredRepository.repositoryId,
        provider: 'github',
        batch,
      });
    };
    const getComposedReviewOperation = async (
      reviewId: string,
    ): Promise<ReviewOperationContract | null> => {
      const transientOperation = transientReviewOperations.get(reviewId);
      if (transientOperation !== undefined) {
        return transientOperation;
      }
      const operation = await memory.getReviewOperation(reviewId);
      if (operation === null || operation.status !== 'completed') {
        return operation;
      }
      const previousReview =
        operation.review.previousReviewId === undefined
          ? null
          : await memory.getReview(operation.review.previousReviewId);
      const queries =
        operation.review.target.kind === 'pull_request' &&
        operation.review.target.pullRequestNumber !== undefined
          ? [`pull_request:#${operation.review.target.pullRequestNumber}`]
          : [
              ...new Set(
                operation.review.findings.flatMap(({ evidence }) =>
                  evidence.map(({ sourceId }) => sourceId),
                ),
              ),
            ].slice(0, 8);
      const results = (
        await Promise.all(
          queries.map((query) =>
            memory.search({
              schemaVersion: 1,
              repositoryId: registeredRepository.repositoryId,
              query,
              limit: 20,
            }),
          ),
        )
      ).flat();
      return reviewOperationSchema.parse({
        ...operation,
        previousReview,
        evidenceTimeline: buildEvidenceTimeline({
          ...(options.allowExternalEvidenceLinks === undefined
            ? {}
            : { allowExternalEvidenceLinks: options.allowExternalEvidenceLinks }),
          repositoryHead: options.repository.head,
          repositoryRemote: registeredRepository.remote,
          results,
        }),
      });
    };
    const executePullRequestReview = async (
      pullRequestNumber: number,
      context: PersistentReviewContext,
    ) => {
      await inspectFixedRepository();
      const result = await options.reviewPullRequest(pullRequestNumber, context);
      if (result.remote.url !== fixedGitHubRemote().url) {
        throw new GitHubProviderError(
          'INVALID_REMOTE',
          'The repository remote changed after the local service started.',
          'Restart Gatekeeper after confirming the repository origin.',
        );
      }
      await memory.indexRemoteDocuments({
        repositoryId: registeredRepository.repositoryId,
        provider: 'github',
        batch: {
          schemaVersion: 1,
          records: [pullRequestToRemoteRecord(result.pullRequest)],
          failures: [],
          cursor: null,
          partial: false,
        },
      });
      return result.review;
    };
    const executeCommitReview = async (sha: string, context: PersistentReviewContext) => {
      await inspectFixedRepository();
      if (options.reviewCommit === undefined) {
        throw new Error('Historical commit review is not configured.');
      }
      return options.reviewCommit(sha, context);
    };
    const executeWorktreeReview = async (context: PersistentReviewContext) => {
      await inspectFixedRepository();
      return options.reviewWorktree(context);
    };
    const startReviewOperation = async (
      target: ReviewRunContract['target'],
      run: (
        context: PersistentReviewContext,
        setStage: (
          stage: 'syncing_history' | 'evaluating_change' | 'persisting_review',
        ) => Promise<void>,
      ) => Promise<{ historySync: GitHubSyncResult | null; review: ReviewRunContract }>,
    ): Promise<ReviewOperationContract> => {
      if (!acceptingReviewOperations || activeReviewOperations.size > 0) {
        throw new ReviewOperationUnavailableError();
      }
      const reviewId = createReviewId();
      const createdAt = new Date().toISOString();
      const queued = reviewOperationSchema.parse({
        schemaVersion: 1,
        reviewId,
        repositoryId: registeredRepository.repositoryId,
        target,
        status: 'queued',
        stage: 'queued',
        createdAt,
        updatedAt: createdAt,
      });
      activeReviewOperations.set(reviewId, queued);
      try {
        await memory.saveReviewOperation(queued);
      } catch (error) {
        activeReviewOperations.delete(reviewId);
        throw error;
      }
      if (!acceptingReviewOperations) {
        activeReviewOperations.delete(reviewId);
        throw new ReviewOperationUnavailableError();
      }

      const saveFailedOperation = async () => {
        const failed = reviewOperationSchema.parse({
          ...queued,
          status: 'failed',
          stage: 'failed',
          error: {
            code: 'REVIEW_FAILED',
            message: 'Gatekeeper could not complete the local review.',
            repair: 'Confirm the repository and local tools are ready, then retry.',
          },
          updatedAt: new Date().toISOString(),
        });
        transientReviewOperations.set(reviewId, failed);
        try {
          await memory.saveReviewOperation(failed);
          transientReviewOperations.delete(reviewId);
        } catch {
          // The in-memory terminal record keeps the failure observable until this service stops.
        }
      };

      void (async () => {
        try {
          const context = await createReviewContext(target, reviewId);
          const setStage = async (
            stage: 'syncing_history' | 'evaluating_change' | 'persisting_review',
          ) => {
            if (!acceptingReviewOperations) {
              return;
            }
            await memory.saveReviewOperation(
              reviewOperationSchema.parse({
                ...queued,
                status: 'running',
                stage,
                updatedAt: new Date().toISOString(),
              }),
            );
          };
          const { historySync, review } = await run(context, setStage);
          if (!acceptingReviewOperations) {
            return;
          }
          if (
            review.reviewId !== reviewId ||
            review.repositoryId !== registeredRepository.repositoryId ||
            review.target.kind !== target.kind ||
            review.target.display !== target.display
          ) {
            throw new Error('Review operation result identity does not match.');
          }
          await setStage('persisting_review');
          if (!acceptingReviewOperations) {
            return;
          }
          await memory.saveReview(review);
          if (!acceptingReviewOperations) {
            return;
          }
          if (historySync !== null) {
            const completed = await memory.getReviewOperation(reviewId);
            if (completed === null || completed.status !== 'completed') {
              throw new Error('Review operation did not complete after persistence.');
            }
            await memory.saveReviewOperation(
              reviewOperationSchema.parse({ ...completed, historySync }),
            );
          }
        } catch {
          if (acceptingReviewOperations) {
            await saveFailedOperation();
          }
        } finally {
          activeReviewOperations.delete(reviewId);
        }
      })();
      return queued;
    };
    const prepareStoredReview = async (reviewId: string) => {
      const review = await memory.getReview(reviewId);
      if (review === null || review.repositoryId !== registeredRepository.repositoryId) {
        return null;
      }

      return prepareReviewDraft({
        review: review as ReviewRun,
        searchMemory: (input) => memory.search(input),
      });
    };
    const serverOptions: BuildGatekeeperServerOptions = {
      bearerToken,
      completeReview: async (reviewId: string, input: ReviewCompletionInput) => {
        const review = await memory.getReview(reviewId);
        if (review === null || review.repositoryId !== registeredRepository.repositoryId) {
          return null;
        }
        const draft = await prepareStoredReview(reviewId);
        if (draft === null) {
          return null;
        }
        const completed = completeReview({
          review: review as ReviewRun,
          draft,
          findings: input.findings,
          ...(input.model === undefined ? {} : { model: input.model }),
        });
        await memory.saveReview(completed);
        return completed;
      },
      dashboardRoot: options.dashboardRoot,
      ...(options.deterministicOnly === true ? { deterministicOnly: true } : {}),
      exploreCommits: async (input) => {
        const snapshot = await inspectFixedRepository();
        return exploreLocalCommits(input, {
          currentBranch: snapshot.branch,
          git,
          memory,
          repositoryId: registeredRepository.repositoryId,
          repositoryRoot: snapshot.root,
        });
      },
      getStatus: async () => {
        if (status === undefined) {
          throw new Error('Service status is not ready.');
        }
        return statusResponseSchema.parse({
          ...status,
          repository: await inspectFixedRepository(),
        });
      },
      projectMemory: {
        repository: registeredRepository,
        getIndexState: () => memory.getIndexState(registeredRepository.repositoryId),
        getReview: (reviewId) => memory.getReview(reviewId),
        getReviewOperation: getComposedReviewOperation,
        indexRepository: async () => {
          await inspectFixedRepository();
          const loadedPolicy = await loadRepositoryPolicy(options.repository.root);
          return memory.indexLocalRepository({
            repositoryId: registeredRepository.repositoryId,
            ignorePatterns: loadedPolicy.policy.paths?.ignore ?? [],
          });
        },
        recentCommits: () => memory.recentCommits(registeredRepository.repositoryId),
        explorePullRequests: (input) => memory.explorePullRequests(input),
        searchMemory: (input: MemorySearchInput) => memory.search(input),
        syncGitHub,
      },
      prepareReview: prepareStoredReview,
      reviewCommit: async (sha) => {
        const target = {
          kind: 'commit_range' as const,
          display: `Commit ${sha.slice(0, 12)}`,
          head: sha,
        };
        const review = await executeCommitReview(
          sha,
          await createReviewContext(target, createReviewId()),
        );
        await memory.saveReview(review);
        return review;
      },
      reviewPullRequest: async (pullRequestNumber) => {
        const target = {
          kind: 'pull_request' as const,
          display: `Pull request #${pullRequestNumber}`,
          pullRequestNumber,
        };
        const review = await executePullRequestReview(
          pullRequestNumber,
          await createReviewContext(target, createReviewId()),
        );
        await memory.saveReview(review);
        return review;
      },
      reviewWorktree: async () => {
        const target = { kind: 'worktree' as const, display: 'Current worktree' };
        const review = await executeWorktreeReview(
          await createReviewContext(target, createReviewId()),
        );
        await memory.saveReview(review);
        return review;
      },
      startPullRequestReview: (pullRequestNumber) => {
        const target = {
          kind: 'pull_request' as const,
          display: `Pull request #${pullRequestNumber}`,
          pullRequestNumber,
        };
        return startReviewOperation(target, async (context, setStage) => {
          await setStage('syncing_history');
          const historySync = await syncGitHub();
          await setStage('evaluating_change');
          return {
            historySync,
            review: await executePullRequestReview(pullRequestNumber, context),
          };
        });
      },
      startCommitReview: (sha) => {
        const target = {
          kind: 'commit_range' as const,
          display: `Commit ${sha.slice(0, 12)}`,
          head: sha,
        };
        return startReviewOperation(target, async (context, setStage) => {
          await setStage('evaluating_change');
          return { historySync: null, review: await executeCommitReview(sha, context) };
        });
      },
      startWorktreeReview: () => {
        const target = { kind: 'worktree' as const, display: 'Current worktree' };
        return startReviewOperation(target, async (context, setStage) => {
          await setStage('evaluating_change');
          return { historySync: null, review: await executeWorktreeReview(context) };
        });
      },
      version: options.version,
      ...(options.logger === undefined ? {} : { logger: options.logger }),
    };
    server = await buildGatekeeperServer(serverOptions);
    const activeServer = server;
    await activeServer.listen({ host: '127.0.0.1', port: 0 });
    const address = activeServer.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    status = statusResponseSchema.parse({
      schemaVersion: 1,
      service: {
        state: 'ready',
        version: options.version,
        startedAt,
        baseUrl,
      },
      repository: options.repository,
      tools: options.tools,
      features: {
        modelReasoning: 'disabled',
        projectMemory: 'ready',
      },
      paths,
    });
    const metadata = serviceMetadataSchema.parse({
      schemaVersion: 1,
      pid: process.pid,
      port: address.port,
      baseUrl,
      bearerToken,
      repositoryRoot: options.repository.root,
      startedAt,
    });
    await writeServiceMetadata(paths, metadata);

    return {
      baseUrl,
      bearerToken,
      server: activeServer,
      status,
      close: async () => {
        acceptingReviewOperations = false;
        await Promise.all(
          [...activeReviewOperations.keys()].map((reviewId) => {
            const operation = activeReviewOperations.get(reviewId);
            if (operation === undefined) {
              return Promise.resolve();
            }
            const failed = reviewOperationSchema.parse({
              ...operation,
              status: 'failed',
              stage: 'failed',
              error: {
                code: 'REVIEW_FAILED',
                message: 'Gatekeeper stopped before the local review completed.',
                repair: 'Start a new review from the dashboard.',
              },
              updatedAt: new Date().toISOString(),
            });
            transientReviewOperations.set(reviewId, failed);
            return memory.saveReviewOperation(failed).then(
              () => transientReviewOperations.delete(reviewId),
              () => undefined,
            );
          }),
        );
        try {
          await activeServer.close();
        } finally {
          try {
            store?.close();
          } finally {
            try {
              await rm(paths.serviceMetadata, { force: true });
            } finally {
              await ownership?.release();
            }
          }
        }
      },
    };
  } catch (error) {
    try {
      await server?.close();
    } finally {
      try {
        store?.close();
      } finally {
        if (ownership !== undefined) {
          try {
            await rm(paths.serviceMetadata, { force: true });
          } finally {
            await ownership.release();
          }
        }
      }
    }
    throw error;
  }
}
