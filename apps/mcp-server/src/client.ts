import { readFile } from 'node:fs/promises';

import { resolveServicePaths } from '@gatekeeper/config';
import {
  gatekeeperMcpStatusSchema,
  indexResultSchema,
  memorySearchResponseSchema,
  repositoryRecordSchema,
  repositoryStatusSchema,
  reviewDraftSchema,
  reviewRunSchema,
  serviceMetadataSchema,
  statusResponseSchema,
  type GatekeeperMcpStatus,
  type IndexResult,
  type MemorySearchResponse,
  type ReviewCompletionFinding,
  type ReviewDraftContract,
  type ReviewRunContract,
} from '@gatekeeper/contracts';
import type { z } from 'zod';

export const START_SERVICE_COMMAND = 'pnpm --filter @gatekeeper/cli start -- start .';
const DEFAULT_TIMEOUT_MS = 30_000;

export class GatekeeperClientError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'GatekeeperClientError';
  }
}

export interface CompleteReviewRequest {
  reviewId: string;
  findings: ReviewCompletionFinding[];
  model?: string | null;
}

export interface SearchMemoryRequest {
  query: string;
  limit?: number;
}

export interface GatekeeperClient {
  status: () => Promise<GatekeeperMcpStatus>;
  indexRepository: () => Promise<IndexResult>;
  reviewWorktree: () => Promise<ReviewDraftContract>;
  searchMemory: (input: SearchMemoryRequest) => Promise<MemorySearchResponse>;
  completeReview: (input: CompleteReviewRequest) => Promise<ReviewRunContract>;
  getReview: (reviewId: string) => Promise<ReviewRunContract>;
}

interface GatekeeperClientOptions {
  fetch?: typeof globalThis.fetch;
  loadMetadata?: () => Promise<unknown>;
  timeoutMs?: number;
}

function unavailableMessage(): string {
  return `Gatekeeper local service is unavailable. Start it with: ${START_SERVICE_COMMAND}`;
}

async function defaultLoadMetadata(): Promise<unknown> {
  return JSON.parse(await readFile(resolveServicePaths().serviceMetadata, 'utf8')) as unknown;
}

export function createGatekeeperClient(options: GatekeeperClientOptions = {}): GatekeeperClient {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const loadMetadata = options.loadMetadata ?? defaultLoadMetadata;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    init: { body?: unknown; method?: 'GET' | 'POST' } = {},
  ): Promise<T> {
    let metadata: ReturnType<typeof serviceMetadataSchema.parse>;
    try {
      metadata = serviceMetadataSchema.parse(await loadMetadata());
    } catch {
      throw new GatekeeperClientError(unavailableMessage());
    }

    const signal = AbortSignal.timeout(timeoutMs);
    const request = new Request(new URL(path, metadata.baseUrl), {
      method: init.method ?? 'GET',
      headers: {
        authorization: `Bearer ${metadata.bearerToken}`,
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal,
    });

    let response: Response;
    try {
      response = await new Promise<Response>((resolve, reject) => {
        const onAbort = () =>
          reject(new GatekeeperClientError('Gatekeeper local service did not respond.'));
        signal.addEventListener('abort', onAbort, { once: true });
        fetchImplementation(request)
          .then(resolve, reject)
          .finally(() => {
            signal.removeEventListener('abort', onAbort);
          });
      });
    } catch (error) {
      if (error instanceof GatekeeperClientError) {
        throw error;
      }
      throw new GatekeeperClientError(unavailableMessage());
    }

    if (!response.ok) {
      throw new GatekeeperClientError(
        response.status === 404
          ? 'The requested Gatekeeper record was not found.'
          : `Gatekeeper local service rejected the request (${response.status}).`,
      );
    }

    try {
      return schema.parse(await response.json());
    } catch {
      throw new GatekeeperClientError('Gatekeeper local service returned an invalid response.');
    }
  }

  async function repository() {
    return request('/v1/repositories', repositoryRecordSchema, { method: 'POST', body: {} });
  }

  return {
    status: async () => {
      const status = await request('/v1/status', statusResponseSchema);
      const selected = await repository();
      const memory = await request(
        `/v1/repositories/${encodeURIComponent(selected.repositoryId)}/memory/status`,
        repositoryStatusSchema,
      );
      return gatekeeperMcpStatusSchema.parse({ schemaVersion: 1, status, memory });
    },
    indexRepository: async () => {
      const selected = await repository();
      return request(
        `/v1/repositories/${encodeURIComponent(selected.repositoryId)}/index`,
        indexResultSchema,
        {
          method: 'POST',
          body: {},
        },
      );
    },
    reviewWorktree: async () => {
      const review = await request('/v1/reviews/worktree', reviewRunSchema, {
        method: 'POST',
        body: {},
      });
      return request(`/v1/reviews/${encodeURIComponent(review.reviewId)}/draft`, reviewDraftSchema);
    },
    searchMemory: async ({ query, limit }) => {
      const selected = await repository();
      return request('/v1/memory/search', memorySearchResponseSchema, {
        method: 'POST',
        body: {
          schemaVersion: 1,
          repositoryId: selected.repositoryId,
          query,
          ...(limit === undefined ? {} : { limit }),
        },
      });
    },
    completeReview: ({ reviewId, findings, model }) =>
      request(`/v1/reviews/${encodeURIComponent(reviewId)}/complete`, reviewRunSchema, {
        method: 'POST',
        body: {
          schemaVersion: 1,
          findings,
          ...(model === undefined ? {} : { model }),
        },
      }),
    getReview: (reviewId) =>
      request(`/v1/reviews/${encodeURIComponent(reviewId)}`, reviewRunSchema),
  };
}
