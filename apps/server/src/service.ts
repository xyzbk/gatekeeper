import { randomBytes } from 'node:crypto';
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
  serviceMetadataSchema,
  statusResponseSchema,
  type GitHubRemote,
  type ReviewCompletionInput,
  type PullRequestRecord,
  type RepositorySnapshot,
  type MemorySearchInput,
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
        indexRepository: async () => {
          const loadedPolicy = await loadRepositoryPolicy(options.repository.root);
          return memory.indexLocalRepository({
            repositoryId: registeredRepository.repositoryId,
            ignorePatterns: loadedPolicy.policy.paths?.ignore ?? [],
          });
        },
        searchMemory: (input: MemorySearchInput) => memory.search(input),
        syncGitHub: async () => {
          const remote = fixedGitHubRemote();
          await github.preflight(remote);
          const cursor = await memory.getRemoteSyncCursor(
            registeredRepository.repositoryId,
            'github',
          );
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
        },
      },
      prepareReview: prepareStoredReview,
      reviewPullRequest: async (pullRequestNumber) => {
        const target = {
          kind: 'pull_request' as const,
          display: `Pull request #${pullRequestNumber}`,
          pullRequestNumber,
        };
        const previousReviewId = await memory.latestReviewId(
          registeredRepository.repositoryId,
          target,
        );
        const result = await options.reviewPullRequest(pullRequestNumber, {
          repositoryId: registeredRepository.repositoryId as RepositoryId,
          ...(previousReviewId === null ? {} : { previousReviewId: previousReviewId as ReviewId }),
        });
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
        await memory.saveReview(result.review);
        return result.review;
      },
      reviewWorktree: async () => {
        const target = { kind: 'worktree' as const, display: 'Current worktree' };
        const previousReviewId = await memory.latestReviewId(
          registeredRepository.repositoryId,
          target,
        );
        const review = await options.reviewWorktree({
          repositoryId: registeredRepository.repositoryId as RepositoryId,
          ...(previousReviewId === null ? {} : { previousReviewId: previousReviewId as ReviewId }),
        });
        await memory.saveReview(review);
        return review;
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
