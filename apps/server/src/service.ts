import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
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
import { createProjectMemory } from '@gatekeeper/project-memory';
import { completeReview, prepareReviewDraft } from '@gatekeeper/review-engine';
import { openSqliteProjectStore } from '@gatekeeper/store-sqlite';
import type { FastifyInstance } from 'fastify';

import { buildGatekeeperServer, type BuildGatekeeperServerOptions } from './server.js';

export interface StartGatekeeperServiceOptions {
  bearerToken?: string;
  dashboardRoot: string;
  logger?: BuildGatekeeperServerOptions['logger'];
  paths?: ServicePaths;
  repository: RepositorySnapshot;
  githubProvider?: GitHubProvider;
  reviewPullRequest: (
    pullRequestNumber: number,
    context: PersistentReviewContext,
  ) => Promise<PersistentPullRequestReviewResult>;
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
  const store = openSqliteProjectStore({
    databasePath: resolveProjectMemoryDatabasePath(paths.appData),
  });
  const memory = createProjectMemory({ persistence: store, git: createGitProvider() });
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
    await memory.migrate();
    const registeredRepository = await memory.registerRepository({
      root: options.repository.root,
      remote: options.repository.remote,
    });
    await memory.failInterruptedReviewOperations(startedAt);
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
    const executePullRequestReview = async (
      pullRequestNumber: number,
      context: PersistentReviewContext,
    ) => {
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
    const startReviewOperation = async (
      target: ReviewRunContract['target'],
      run: (
        context: PersistentReviewContext,
        setStage: (
          stage: 'syncing_history' | 'evaluating_change' | 'persisting_review',
        ) => Promise<void>,
      ) => Promise<ReviewRunContract>,
    ): Promise<ReviewOperationContract> => {
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
      await memory.saveReviewOperation(queued);

      void (async () => {
        const context = await createReviewContext(target, reviewId);
        const setStage = async (
          stage: 'syncing_history' | 'evaluating_change' | 'persisting_review',
        ) => {
          await memory.saveReviewOperation(
            reviewOperationSchema.parse({
              ...queued,
              status: 'running',
              stage,
              updatedAt: new Date().toISOString(),
            }),
          );
        };
        try {
          const review = await run(context, setStage);
          if (
            review.reviewId !== reviewId ||
            review.repositoryId !== registeredRepository.repositoryId ||
            review.target.kind !== target.kind ||
            review.target.display !== target.display
          ) {
            throw new Error('Review operation result identity does not match.');
          }
          await setStage('persisting_review');
          await memory.saveReview(review);
        } catch {
          await memory.saveReviewOperation(
            reviewOperationSchema.parse({
              ...queued,
              status: 'failed',
              stage: 'failed',
              error: {
                code: 'REVIEW_FAILED',
                message: 'Gatekeeper could not complete the local review.',
                repair: 'Confirm the repository and local tools are ready, then retry.',
              },
              updatedAt: new Date().toISOString(),
            }),
          );
        }
      })().catch(() => undefined);
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
      getStatus: () => {
        if (status === undefined) {
          throw new Error('Service status is not ready.');
        }

        return status;
      },
      projectMemory: {
        repository: registeredRepository,
        getIndexState: () => memory.getIndexState(registeredRepository.repositoryId),
        getReview: (reviewId) => memory.getReview(reviewId),
        getReviewOperation: (reviewId) => memory.getReviewOperation(reviewId),
        indexRepository: async () => {
          const loadedPolicy = await loadRepositoryPolicy(options.repository.root);
          return memory.indexLocalRepository({
            repositoryId: registeredRepository.repositoryId,
            ignorePatterns: loadedPolicy.policy.paths?.ignore ?? [],
          });
        },
        searchMemory: (input: MemorySearchInput) => memory.search(input),
        syncGitHub,
      },
      prepareReview: prepareStoredReview,
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
        const review = await options.reviewWorktree(
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
          await syncGitHub();
          await setStage('evaluating_change');
          return executePullRequestReview(pullRequestNumber, context);
        });
      },
      startWorktreeReview: () => {
        const target = { kind: 'worktree' as const, display: 'Current worktree' };
        return startReviewOperation(target, async (context, setStage) => {
          await setStage('evaluating_change');
          return options.reviewWorktree(context);
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
        try {
          await activeServer.close();
        } finally {
          try {
            store.close();
          } finally {
            await rm(paths.serviceMetadata, { force: true });
          }
        }
      },
    };
  } catch (error) {
    try {
      await server?.close();
    } finally {
      try {
        store.close();
      } finally {
        await rm(paths.serviceMetadata, { force: true });
      }
    }
    throw error;
  }
}
