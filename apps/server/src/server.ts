import { timingSafeEqual } from 'node:crypto';
import type { Writable } from 'node:stream';

import fastifyStatic from '@fastify/static';
import {
  dashboardBootstrapJsonSchema,
  dashboardBootstrapSchema,
  commitExplorerInputJsonSchema,
  commitExplorerInputSchema,
  commitExplorerResponseJsonSchema,
  commitExplorerResponseSchema,
  commitReviewInputJsonSchema,
  commitReviewInputSchema,
  emptyRequestJsonSchema,
  errorEnvelopeJsonSchema,
  errorEnvelopeSchema,
  healthResponseJsonSchema,
  healthResponseSchema,
  githubSyncResultJsonSchema,
  githubSyncResultSchema,
  indexResultJsonSchema,
  indexResultSchema,
  indexStateJsonSchema,
  memorySearchInputJsonSchema,
  memorySearchInputSchema,
  memorySearchResponseJsonSchema,
  memorySearchResponseSchema,
  pullRequestExplorerInputJsonSchema,
  pullRequestExplorerInputSchema,
  pullRequestExplorerResponseJsonSchema,
  pullRequestExplorerResponseSchema,
  recentCommitEvidenceResponseJsonSchema,
  recentCommitEvidenceResponseSchema,
  repositoryIdParamsJsonSchema,
  repositoryRecordJsonSchema,
  repositoryRecordSchema,
  repositoryStatusJsonSchema,
  repositoryStatusSchema,
  pullRequestReviewInputJsonSchema,
  pullRequestReviewInputSchema,
  reviewCompletionInputJsonSchema,
  reviewCompletionInputSchema,
  reviewDraftJsonSchema,
  reviewDraftSchema,
  reviewIdParamsJsonSchema,
  reviewLookupApiJsonSchema,
  reviewLookupSchema,
  reviewOperationApiJsonSchema,
  reviewOperationSchema,
  reviewRunApiJsonSchema,
  reviewRunSchema,
  statusResponseJsonSchema,
  statusResponseSchema,
  type IndexResult,
  type IndexState,
  type CommitExplorerInput,
  type CommitExplorerResponse,
  type CommitReviewInput,
  type GitHubSyncResult,
  type MemorySearchInput,
  type MemorySearchResult,
  type PullRequestExplorerInput,
  type PullRequestExplorerResponse,
  type RecentCommitEvidence,
  type RepositoryRecord,
  type PullRequestReviewInput,
  type ReviewCompletionInput,
  type ReviewDraftContract,
  type ReviewOperationContract,
  type ReviewRunContract,
  type StatusResponse,
} from '@gatekeeper/contracts';
import { GitHubProviderError } from '@gatekeeper/github-gh';
import { InvalidReviewCompletionError } from '@gatekeeper/review-engine';
import fastify, { type FastifyInstance, LogController } from 'fastify';

import { CommitExplorerBranchUnavailableError } from './commit-explorer.js';

const contentSecurityPolicy = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

export class ReviewOperationUnavailableError extends Error {
  constructor() {
    super('A local Gatekeeper review is already running.');
    this.name = 'ReviewOperationUnavailableError';
  }
}

interface GatekeeperLoggerOptions {
  level: string;
  stream?: Writable;
}

export interface BuildGatekeeperServerOptions {
  bearerToken: string;
  completeReview: (
    reviewId: string,
    input: ReviewCompletionInput,
  ) => Promise<ReviewRunContract | null>;
  dashboardRoot: string;
  deterministicOnly?: boolean;
  exploreCommits: (input: CommitExplorerInput) => Promise<CommitExplorerResponse>;
  getStatus: () => StatusResponse | Promise<StatusResponse>;
  logger?: false | GatekeeperLoggerOptions;
  projectMemory: ProjectMemoryApi;
  prepareReview: (reviewId: string) => Promise<ReviewDraftContract | null>;
  reviewCommit: (sha: string) => Promise<ReviewRunContract>;
  reviewPullRequest: (pullRequestNumber: number) => Promise<ReviewRunContract>;
  reviewWorktree: () => Promise<ReviewRunContract>;
  startCommitReview: (sha: string) => Promise<ReviewOperationContract>;
  startPullRequestReview: (pullRequestNumber: number) => Promise<ReviewOperationContract>;
  startWorktreeReview: () => Promise<ReviewOperationContract>;
  version: string;
}

export interface ProjectMemoryApi {
  repository: RepositoryRecord;
  getIndexState: () => Promise<IndexState | null>;
  getReview: (reviewId: string) => Promise<ReviewRunContract | null>;
  getReviewOperation: (reviewId: string) => Promise<ReviewOperationContract | null>;
  indexRepository: () => Promise<IndexResult>;
  recentCommits: () => Promise<RecentCommitEvidence[]>;
  explorePullRequests: (input: PullRequestExplorerInput) => Promise<PullRequestExplorerResponse>;
  searchMemory: (input: MemorySearchInput) => Promise<MemorySearchResult[]>;
  syncGitHub: () => Promise<GitHubSyncResult>;
}

function createError(
  code:
    | 'ENVIRONMENT_ERROR'
    | 'FORBIDDEN'
    | 'UNAUTHORIZED'
    | 'INTERNAL_ERROR'
    | 'NOT_FOUND'
    | 'USAGE_ERROR',
  message: string,
  repair?: string,
) {
  return errorEnvelopeSchema.parse({
    error: { code, message, ...(repair === undefined ? {} : { repair }) },
  });
}

function isAllowedHost(host: string | undefined): boolean {
  if (host === undefined) {
    return false;
  }

  try {
    const parsedHost = new URL(`http://${host}`);
    return (
      parsedHost.hostname === '127.0.0.1' &&
      parsedHost.host === host &&
      parsedHost.username === '' &&
      parsedHost.password === '' &&
      parsedHost.pathname === '/' &&
      parsedHost.search === '' &&
      parsedHost.hash === ''
    );
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined) {
    return true;
  }

  try {
    const parsedOrigin = new URL(origin);
    return (
      parsedOrigin.protocol === 'http:' &&
      parsedOrigin.hostname === '127.0.0.1' &&
      parsedOrigin.host === host
    );
  } catch {
    return false;
  }
}

function hasValidBearerToken(authorization: string | undefined, bearerToken: string): boolean {
  if (authorization === undefined) {
    return false;
  }

  const expected = Buffer.from(`Bearer ${bearerToken}`);
  const actual = Buffer.from(authorization);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function isValidationError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'validation' in error;
}

export async function buildGatekeeperServer(
  options: BuildGatekeeperServerOptions,
): Promise<FastifyInstance> {
  const server = fastify({
    ajv: { customOptions: { removeAdditional: false } },
    bodyLimit: 1_048_576,
    logController: new LogController({ disableRequestLogging: true }),
    logger: options.logger ?? { level: 'info' },
  });

  server.addSchema(errorEnvelopeJsonSchema);
  server.addSchema(healthResponseJsonSchema);
  server.addSchema(githubSyncResultJsonSchema);
  server.addSchema(statusResponseJsonSchema);
  server.addSchema(dashboardBootstrapJsonSchema);
  server.addSchema(emptyRequestJsonSchema);
  server.addSchema(reviewRunApiJsonSchema);
  server.addSchema(reviewOperationApiJsonSchema);
  server.addSchema(reviewLookupApiJsonSchema);
  server.addSchema(reviewDraftJsonSchema);
  server.addSchema(commitExplorerInputJsonSchema);
  server.addSchema(commitExplorerResponseJsonSchema);
  server.addSchema(reviewCompletionInputJsonSchema);
  server.addSchema(commitReviewInputJsonSchema);
  server.addSchema(pullRequestReviewInputJsonSchema);
  server.addSchema(repositoryRecordJsonSchema);
  server.addSchema(indexStateJsonSchema);
  server.addSchema(indexResultJsonSchema);
  server.addSchema(repositoryStatusJsonSchema);
  server.addSchema(memorySearchInputJsonSchema);
  server.addSchema(memorySearchResponseJsonSchema);
  server.addSchema(pullRequestExplorerInputJsonSchema);
  server.addSchema(pullRequestExplorerResponseJsonSchema);
  server.addSchema(recentCommitEvidenceResponseJsonSchema);
  server.addSchema(repositoryIdParamsJsonSchema);
  server.addSchema(reviewIdParamsJsonSchema);

  server.addHook('onRequest', async (request, reply) => {
    if (!isAllowedHost(request.headers.host)) {
      return reply.code(403).send(createError('FORBIDDEN', 'The request Host is not allowed.'));
    }

    if (!isAllowedOrigin(request.headers.origin, request.headers.host)) {
      return reply.code(403).send(createError('FORBIDDEN', 'The request Origin is not allowed.'));
    }

    if (
      request.url.startsWith('/v1/') &&
      !hasValidBearerToken(request.headers.authorization, options.bearerToken)
    ) {
      return reply
        .code(401)
        .send(createError('UNAUTHORIZED', 'A valid local bearer token is required.'));
    }
  });

  server.setErrorHandler((error, request, reply) => {
    if (error instanceof CommitExplorerBranchUnavailableError) {
      return reply
        .code(404)
        .send(createError('NOT_FOUND', 'The selected local branch is unavailable.'));
    }
    if (error instanceof ReviewOperationUnavailableError) {
      return reply
        .code(503)
        .send(
          createError(
            'ENVIRONMENT_ERROR',
            error.message,
            'Wait for the current review to finish, then retry.',
          ),
        );
    }
    if (
      error instanceof GitHubProviderError &&
      (error.code === 'AUTH_REQUIRED' ||
        error.code === 'GH_UNAVAILABLE' ||
        error.code === 'INVALID_REMOTE')
    ) {
      server.log.warn(
        {
          requestId: request.id,
          operation: `${request.method} ${request.routeOptions.url ?? 'unmatched-route'}`,
          errorCategory: 'environment',
        },
        'request rejected',
      );
      const message =
        error.code === 'AUTH_REQUIRED'
          ? 'GitHub authentication is required for this local operation.'
          : error.code === 'GH_UNAVAILABLE'
            ? 'GitHub CLI is required for this local operation.'
            : 'The fixed repository does not have a usable GitHub remote.';
      return reply.code(503).send(createError('ENVIRONMENT_ERROR', message, error.repair));
    }
    const validationFailure =
      isValidationError(error) || error instanceof InvalidReviewCompletionError;
    server.log.warn(
      {
        requestId: request.id,
        operation: `${request.method} ${request.routeOptions.url ?? 'unmatched-route'}`,
        errorCategory: validationFailure ? 'validation' : 'internal',
      },
      'request rejected',
    );

    if (validationFailure) {
      return reply
        .code(400)
        .send(createError('USAGE_ERROR', 'The request does not match the local API contract.'));
    }

    return reply
      .code(500)
      .send(createError('INTERNAL_ERROR', 'The local service could not complete the request.'));
  });

  server.setNotFoundHandler((_request, reply) =>
    reply.code(404).send(createError('NOT_FOUND', 'The requested local resource was not found.')),
  );

  server.addHook('onSend', async (_request, reply, payload) => {
    reply
      .header('Cache-Control', 'no-store')
      .header('Content-Security-Policy', contentSecurityPolicy)
      .header('Cross-Origin-Resource-Policy', 'same-origin')
      .header('Permissions-Policy', 'camera=(), geolocation=(), microphone=()')
      .header('Referrer-Policy', 'no-referrer')
      .header('X-Content-Type-Options', 'nosniff')
      .header('X-Frame-Options', 'DENY');

    return payload;
  });

  server.addHook('onResponse', async (request, reply) => {
    server.log.info(
      {
        requestId: request.id,
        operation: `${request.method} ${request.routeOptions.url ?? 'unmatched-route'}`,
        durationMs: reply.elapsedTime,
        resultCount: reply.statusCode < 400 ? 1 : 0,
        resultState: reply.statusCode < 400 ? 'success' : 'rejected',
      },
      'request completed',
    );
  });

  server.get(
    '/health',
    {
      schema: {
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          200: { $ref: 'gatekeeper:health-response#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    () => healthResponseSchema.parse({ status: 'ok', version: options.version }),
  );

  server.post<{ Body: CommitExplorerInput }>(
    '/v1/commits/explore',
    {
      schema: {
        body: { $ref: 'gatekeeper:commit-explorer-input-v1#' },
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          200: { $ref: 'gatekeeper:commit-explorer-response-v1#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          401: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
          404: { $ref: 'gatekeeper:error-envelope#' },
          500: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    async (request) =>
      commitExplorerResponseSchema.parse(
        await options.exploreCommits(commitExplorerInputSchema.parse(request.body)),
      ),
  );

  server.post<{ Body: PullRequestExplorerInput }>(
    '/v1/pull-requests/explore',
    {
      schema: {
        body: { $ref: 'gatekeeper:pull-request-explorer-input-v1#' },
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          200: { $ref: 'gatekeeper:pull-request-explorer-response-v1#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          401: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
          404: { $ref: 'gatekeeper:error-envelope#' },
          500: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    async (request, reply) => {
      const input = pullRequestExplorerInputSchema.parse(request.body);
      if (input.repositoryId !== options.projectMemory.repository.repositoryId) {
        return reply
          .code(404)
          .send(createError('NOT_FOUND', 'The requested local resource was not found.'));
      }
      return pullRequestExplorerResponseSchema.parse(
        await options.projectMemory.explorePullRequests(input),
      );
    },
  );

  server.post(
    '/v1/reviews/worktree',
    {
      schema: {
        body: { $ref: 'gatekeeper:empty-request#' },
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          200: { $ref: 'gatekeeper:review-run-v1#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          401: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
          503: { $ref: 'gatekeeper:error-envelope#' },
          500: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    async () => reviewRunSchema.parse(await options.reviewWorktree()),
  );

  server.post(
    '/v1/reviews/worktree/start',
    {
      schema: {
        body: { $ref: 'gatekeeper:empty-request#' },
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          202: { $ref: 'gatekeeper:review-operation-v1#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          401: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
          503: { $ref: 'gatekeeper:error-envelope#' },
          500: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    async (_request, reply) =>
      reply.code(202).send(reviewOperationSchema.parse(await options.startWorktreeReview())),
  );

  server.post<{ Body: CommitReviewInput }>(
    '/v1/reviews/commit',
    {
      schema: {
        body: { $ref: 'gatekeeper:commit-review-input-v1#' },
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          200: { $ref: 'gatekeeper:review-run-v1#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          401: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
          500: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    async (request) => {
      const input = commitReviewInputSchema.parse(request.body);
      return reviewRunSchema.parse(await options.reviewCommit(input.sha));
    },
  );

  server.post<{ Body: CommitReviewInput }>(
    '/v1/reviews/commit/start',
    {
      schema: {
        body: { $ref: 'gatekeeper:commit-review-input-v1#' },
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          202: { $ref: 'gatekeeper:review-operation-v1#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          401: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
          500: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    async (request, reply) => {
      const input = commitReviewInputSchema.parse(request.body);
      return reply
        .code(202)
        .send(reviewOperationSchema.parse(await options.startCommitReview(input.sha)));
    },
  );

  server.post<{ Body: PullRequestReviewInput }>(
    '/v1/reviews/pull-request',
    {
      schema: {
        body: { $ref: 'gatekeeper:pull-request-review-input-v1#' },
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          200: { $ref: 'gatekeeper:review-run-v1#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          401: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
          500: { $ref: 'gatekeeper:error-envelope#' },
          503: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    async (request) => {
      const input = pullRequestReviewInputSchema.parse(request.body);
      return reviewRunSchema.parse(await options.reviewPullRequest(input.pullRequestNumber));
    },
  );

  server.post<{ Body: PullRequestReviewInput }>(
    '/v1/reviews/pull-request/start',
    {
      schema: {
        body: { $ref: 'gatekeeper:pull-request-review-input-v1#' },
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          202: { $ref: 'gatekeeper:review-operation-v1#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          401: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
          500: { $ref: 'gatekeeper:error-envelope#' },
          503: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    async (request, reply) => {
      const input = pullRequestReviewInputSchema.parse(request.body);
      return reply
        .code(202)
        .send(
          reviewOperationSchema.parse(
            await options.startPullRequestReview(input.pullRequestNumber),
          ),
        );
    },
  );

  server.post(
    '/v1/repositories',
    {
      schema: {
        body: { $ref: 'gatekeeper:empty-request#' },
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          200: { $ref: 'gatekeeper:repository-record-v1#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          401: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
          500: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    () => repositoryRecordSchema.parse(options.projectMemory.repository),
  );

  server.get<{ Params: { repositoryId: string } }>(
    '/v1/repositories/:repositoryId',
    {
      schema: {
        params: { $ref: 'gatekeeper:repository-id-params-v1#' },
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          200: { $ref: 'gatekeeper:repository-record-v1#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          401: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
          404: { $ref: 'gatekeeper:error-envelope#' },
          500: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    (request, reply) =>
      request.params.repositoryId === options.projectMemory.repository.repositoryId
        ? repositoryRecordSchema.parse(options.projectMemory.repository)
        : reply
            .code(404)
            .send(createError('NOT_FOUND', 'The requested local resource was not found.')),
  );

  server.post<{ Params: { repositoryId: string } }>(
    '/v1/repositories/:repositoryId/index',
    {
      schema: {
        params: { $ref: 'gatekeeper:repository-id-params-v1#' },
        body: { $ref: 'gatekeeper:empty-request#' },
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          200: { $ref: 'gatekeeper:index-result-v1#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          401: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
          404: { $ref: 'gatekeeper:error-envelope#' },
          500: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    async (request, reply) => {
      if (request.params.repositoryId !== options.projectMemory.repository.repositoryId) {
        return reply
          .code(404)
          .send(createError('NOT_FOUND', 'The requested local resource was not found.'));
      }
      return indexResultSchema.parse(await options.projectMemory.indexRepository());
    },
  );

  server.post<{ Params: { repositoryId: string } }>(
    '/v1/repositories/:repositoryId/sync/github',
    {
      schema: {
        params: { $ref: 'gatekeeper:repository-id-params-v1#' },
        body: { $ref: 'gatekeeper:empty-request#' },
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          200: { $ref: 'gatekeeper:github-sync-result-v1#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          401: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
          404: { $ref: 'gatekeeper:error-envelope#' },
          500: { $ref: 'gatekeeper:error-envelope#' },
          503: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    async (request, reply) => {
      if (request.params.repositoryId !== options.projectMemory.repository.repositoryId) {
        return reply
          .code(404)
          .send(createError('NOT_FOUND', 'The requested local resource was not found.'));
      }
      return githubSyncResultSchema.parse(await options.projectMemory.syncGitHub());
    },
  );

  server.get<{ Params: { repositoryId: string } }>(
    '/v1/repositories/:repositoryId/memory/status',
    {
      schema: {
        params: { $ref: 'gatekeeper:repository-id-params-v1#' },
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          200: { $ref: 'gatekeeper:repository-status-v1#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          401: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
          404: { $ref: 'gatekeeper:error-envelope#' },
          500: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    async (request, reply) => {
      if (request.params.repositoryId !== options.projectMemory.repository.repositoryId) {
        return reply
          .code(404)
          .send(createError('NOT_FOUND', 'The requested local resource was not found.'));
      }
      return repositoryStatusSchema.parse({
        schemaVersion: 1,
        state: 'ready',
        repository: options.projectMemory.repository,
        indexState: await options.projectMemory.getIndexState(),
      });
    },
  );

  server.post<{ Body: MemorySearchInput }>(
    '/v1/memory/search',
    {
      schema: {
        body: { $ref: 'gatekeeper:memory-search-input-v1#' },
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          200: { $ref: 'gatekeeper:memory-search-response-v1#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          401: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
          404: { $ref: 'gatekeeper:error-envelope#' },
          500: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    async (request, reply) => {
      const input = memorySearchInputSchema.parse(request.body);
      if (input.repositoryId !== options.projectMemory.repository.repositoryId) {
        return reply
          .code(404)
          .send(createError('NOT_FOUND', 'The requested local resource was not found.'));
      }
      return memorySearchResponseSchema.parse({
        schemaVersion: 1,
        results: await options.projectMemory.searchMemory(input),
      });
    },
  );

  server.get(
    '/v1/memory/commits',
    {
      schema: {
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          200: { $ref: 'gatekeeper:recent-commit-evidence-response-v1#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          401: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
          500: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    async () =>
      recentCommitEvidenceResponseSchema.parse({
        schemaVersion: 1,
        commits: await options.projectMemory.recentCommits(),
      }),
  );

  server.get<{ Params: { reviewId: string } }>(
    '/v1/reviews/:reviewId/draft',
    {
      schema: {
        params: { $ref: 'gatekeeper:review-id-params-v1#' },
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          200: { $ref: 'gatekeeper:review-draft-v1#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          401: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
          404: { $ref: 'gatekeeper:error-envelope#' },
          500: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    async (request, reply) => {
      const draft = await options.prepareReview(request.params.reviewId);
      return draft === null
        ? reply
            .code(404)
            .send(createError('NOT_FOUND', 'The requested local resource was not found.'))
        : reviewDraftSchema.parse(draft);
    },
  );

  server.post<{ Body: ReviewCompletionInput; Params: { reviewId: string } }>(
    '/v1/reviews/:reviewId/complete',
    {
      schema: {
        params: { $ref: 'gatekeeper:review-id-params-v1#' },
        body: { $ref: 'gatekeeper:review-completion-input-v1#' },
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          200: { $ref: 'gatekeeper:review-run-v1#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          401: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
          404: { $ref: 'gatekeeper:error-envelope#' },
          500: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    async (request, reply) => {
      if (options.deterministicOnly === true) {
        return reply
          .code(403)
          .send(
            createError(
              'FORBIDDEN',
              'Model-assisted completion is disabled in deterministic-only mode.',
            ),
          );
      }

      const input = reviewCompletionInputSchema.parse(request.body);
      const review = await options.completeReview(request.params.reviewId, input);
      return review === null
        ? reply
            .code(404)
            .send(createError('NOT_FOUND', 'The requested local resource was not found.'))
        : reviewRunSchema.parse(review);
    },
  );

  server.get<{ Params: { reviewId: string } }>(
    '/v1/reviews/:reviewId',
    {
      schema: {
        params: { $ref: 'gatekeeper:review-id-params-v1#' },
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          200: { $ref: 'gatekeeper:review-lookup-v1#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          401: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
          404: { $ref: 'gatekeeper:error-envelope#' },
          500: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    async (request, reply) => {
      const operation = await options.projectMemory.getReviewOperation(request.params.reviewId);
      const review =
        operation === null
          ? await options.projectMemory.getReview(request.params.reviewId)
          : operation;
      return review === null
        ? reply
            .code(404)
            .send(createError('NOT_FOUND', 'The requested local resource was not found.'))
        : reviewLookupSchema.parse(review);
    },
  );

  server.get(
    '/bootstrap.json',
    {
      schema: {
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          200: { $ref: 'gatekeeper:dashboard-bootstrap-v1#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    () =>
      dashboardBootstrapSchema.parse({
        apiBaseUrl: '/v1',
        bearerToken: options.bearerToken,
      }),
  );

  server.get(
    '/v1/status',
    {
      schema: {
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          200: { $ref: 'gatekeeper:status-response-v1#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          401: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
          500: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    async (_request, reply) => {
      try {
        return statusResponseSchema.parse(await options.getStatus());
      } catch {
        return reply
          .code(500)
          .send(createError('INTERNAL_ERROR', 'The local service status is unavailable.'));
      }
    },
  );

  server.register(fastifyStatic, {
    root: options.dashboardRoot,
    wildcard: false,
  });
  server.get('/memory', (_request, reply) => reply.sendFile('index.html'));
  server.get('/pull-requests', (_request, reply) => reply.sendFile('index.html'));
  server.get('/reviews/worktree', (_request, reply) => reply.sendFile('index.html'));
  server.get('/reviews/pull-request', (_request, reply) => reply.sendFile('index.html'));
  server.get('/reviews/:reviewId', (_request, reply) => reply.sendFile('index.html'));

  await server.ready();
  return server;
}
