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
  serviceMetadataSchema,
  statusResponseSchema,
  type ReviewCompletionInput,
  type RepositorySnapshot,
  type MemorySearchInput,
  type ReviewRunContract,
  type StatusResponse,
  type ToolAvailability,
} from '@gatekeeper/contracts';
import type { RepositoryId, ReviewId, ReviewRun } from '@gatekeeper/domain';
import { createGitProvider } from '@gatekeeper/git-adapter';
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
      },
      prepareReview: prepareStoredReview,
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
