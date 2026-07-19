import { describe, expect, it } from 'vitest';

import {
  commitExplorerInputSchema,
  commitExplorerResponseSchema,
  indexResultSchema,
  indexStateSchema,
  memorySearchInputSchema,
  memorySearchResponseJsonSchema,
  memorySearchResponseSchema,
  repositoryIdParamsSchema,
  repositoryRecordSchema,
  repositoryStatusSchema,
  reviewIdParamsSchema,
} from './memory.js';

const repository = {
  schemaVersion: 1,
  repositoryId: 'repository_fixture',
  root: 'D:/work/fixture',
  remote: 'https://github.com/example/fixture.git',
  createdAt: '2026-07-18T18:00:00.000Z',
  updatedAt: '2026-07-18T18:00:00.000Z',
} as const;

describe('Project Memory contracts', () => {
  it('accepts a strict repository record', () => {
    expect(repositoryRecordSchema.parse(repository)).toEqual(repository);
    expect(() =>
      repositoryRecordSchema.parse({ ...repository, databasePath: 'private.db' }),
    ).toThrow();
  });

  it('distinguishes uninitialized and indexed repository status', () => {
    const indexState = {
      schemaVersion: 1 as const,
      repositoryId: repository.repositoryId,
      head: 'a'.repeat(40),
      indexedAt: '2026-07-18T18:01:00.000Z',
      files: 4,
      documents: 3,
      commits: 2,
    };
    expect(
      repositoryStatusSchema.parse({
        schemaVersion: 1,
        state: 'not_initialized',
        repository: null,
        indexState: null,
      }).state,
    ).toBe('not_initialized');
    expect(
      repositoryStatusSchema.parse({
        schemaVersion: 1,
        state: 'ready',
        repository,
        indexState,
      }).state,
    ).toBe('ready');
    expect(() =>
      repositoryStatusSchema.parse({
        schemaVersion: 1,
        state: 'not_initialized',
        repository,
        indexState: null,
      }),
    ).toThrow();
  });

  it('strictly validates repository and review route parameters', () => {
    expect(repositoryIdParamsSchema.parse({ repositoryId: 'repository_fixture' })).toEqual({
      repositoryId: 'repository_fixture',
    });
    expect(reviewIdParamsSchema.parse({ reviewId: 'review_fixture' })).toEqual({
      reviewId: 'review_fixture',
    });
    expect(() =>
      repositoryIdParamsSchema.parse({ repositoryId: 'repository_fixture', path: '/private' }),
    ).toThrow();
  });

  it('accepts an index state and bounded result counts', () => {
    const state = {
      schemaVersion: 1,
      repositoryId: repository.repositoryId,
      head: 'a'.repeat(40),
      indexedAt: '2026-07-18T18:01:00.000Z',
      files: 4,
      documents: 3,
      commits: 2,
    } as const;
    expect(indexStateSchema.parse(state)).toEqual(state);

    const result = {
      ...state,
      files: { scanned: 4, written: 1, unchanged: 3, deleted: 0 },
      documents: { scanned: 3, written: 1, unchanged: 2, deleted: 0 },
      commits: { scanned: 2, written: 0, unchanged: 2, deleted: 0 },
    } as const;
    expect(indexResultSchema.parse(result)).toEqual(result);
    expect(() =>
      indexResultSchema.parse({
        ...result,
        documents: { ...result.documents, written: -1 },
      }),
    ).toThrow();
  });

  it('bounds and strictly validates a memory search request', () => {
    expect(
      memorySearchInputSchema.parse({
        schemaVersion: 1,
        repositoryId: repository.repositoryId,
        query: 'redis cache',
      }),
    ).toEqual({
      schemaVersion: 1,
      repositoryId: repository.repositoryId,
      query: 'redis cache',
    });
    expect(() =>
      memorySearchInputSchema.parse({
        schemaVersion: 1,
        repositoryId: repository.repositoryId,
        query: 'x'.repeat(257),
      }),
    ).toThrow();
    expect(() =>
      memorySearchInputSchema.parse({
        schemaVersion: 1,
        repositoryId: repository.repositoryId,
        query: 'redis',
        limit: 51,
      }),
    ).toThrow();
    expect(() =>
      memorySearchInputSchema.parse({
        schemaVersion: 1,
        repositoryId: repository.repositoryId,
        query: 'redis',
        sql: 'select 1',
      }),
    ).toThrow();
  });

  it('accepts bounded trust-labelled evidence and rejects oversized excerpts', () => {
    const response = {
      schemaVersion: 1,
      results: [
        {
          documentId: 'document_redis',
          match: 'fts',
          relationship: 'supersedes',
          trust: 'untrusted_repository_content',
          status: 'active',
          occurredAt: '2026-07-17T12:00:00.000Z',
          evidence: {
            sourceType: 'adr',
            repositoryId: repository.repositoryId,
            sourceId: 'docs/adr/0003-no-required-redis.md',
            title: 'No required Redis',
            path: 'docs/adr/0003-no-required-redis.md',
            excerpt: 'Keep cache in-process and optional.',
            contentHash: 'b'.repeat(64),
          },
        },
      ],
    } as const;

    expect(memorySearchResponseSchema.parse(response)).toEqual(response);
    expect(memorySearchResponseSchema.parse(response).results[0]?.relationship).toBe('supersedes');
    expect(() =>
      memorySearchResponseSchema.parse({
        ...response,
        results: [
          {
            ...response.results[0],
            evidence: { ...response.results[0].evidence, excerpt: 'x'.repeat(2_001) },
          },
        ],
      }),
    ).toThrow();
    expect(memorySearchResponseJsonSchema.$id).toBe('gatekeeper:memory-search-response-v1');
  });

  it('accepts repository documentation as an evidence source', () => {
    expect(
      memorySearchResponseSchema.parse({
        schemaVersion: 1,
        results: [
          {
            documentId: 'document_readme',
            match: 'exact',
            trust: 'untrusted_repository_content',
            status: 'active',
            occurredAt: null,
            evidence: {
              sourceType: 'documentation',
              repositoryId: repository.repositoryId,
              sourceId: 'README.md',
              path: 'README.md',
              excerpt: 'Repository guide.',
            },
          },
        ],
      }).results[0]?.evidence.sourceType,
    ).toBe('documentation');
  });

  it('accepts at most ten bounded recent commit evidence rows', async () => {
    const { recentCommitEvidenceResponseSchema } = await import('./memory.js');
    const commit = {
      sha: 'a'.repeat(40),
      authoredAt: '2026-07-19T20:00:00.000Z',
      title: 'Add deterministic commit review',
    } as const;

    expect(
      recentCommitEvidenceResponseSchema.parse({ schemaVersion: 1, commits: [commit] }),
    ).toEqual({ schemaVersion: 1, commits: [commit] });
    expect(() =>
      recentCommitEvidenceResponseSchema.parse({
        schemaVersion: 1,
        commits: Array.from({ length: 11 }, () => commit),
      }),
    ).toThrow();
    expect(() =>
      recentCommitEvidenceResponseSchema.parse({
        schemaVersion: 1,
        commits: [{ ...commit, title: 'x'.repeat(301) }],
      }),
    ).toThrow();
    expect(() =>
      recentCommitEvidenceResponseSchema.parse({
        schemaVersion: 1,
        commits: [{ ...commit, authoredAt: 'not-a-date' }],
      }),
    ).toThrow();
  });

  it('strictly validates a bounded local Commit Explorer request and response', () => {
    const commit = {
      sha: 'a'.repeat(40),
      authoredAt: '2026-07-19T20:00:00.000Z',
      title: 'Preserve immutable review identity',
      indexed: true,
      reviewed: false,
    } as const;
    const input = {
      schemaVersion: 1,
      branch: 'master',
      source: 'all_local',
      query: 'review identity',
      authoredAfter: '2026-07-01',
      authoredBefore: '2026-07-31',
      reviewState: 'not_reviewed',
      sort: 'newest',
      cursor: 24,
    } as const;

    expect(commitExplorerInputSchema.parse(input)).toEqual(input);
    expect(
      commitExplorerResponseSchema.parse({
        schemaVersion: 1,
        branches: ['master', 'release/0.1'],
        selection: input,
        commits: [commit],
        nextCursor: 48,
      }),
    ).toEqual({
      schemaVersion: 1,
      branches: ['master', 'release/0.1'],
      selection: input,
      commits: [commit],
      nextCursor: 48,
    });
    expect(() =>
      commitExplorerInputSchema.parse({ ...input, cursor: -1 }),
    ).toThrow();
    expect(() =>
      commitExplorerInputSchema.parse({ ...input, authoredAfter: '2026-07-40' }),
    ).toThrow();
    expect(() =>
      commitExplorerInputSchema.parse({ ...input, query: 'x'.repeat(257) }),
    ).toThrow();
    expect(() =>
      commitExplorerInputSchema.parse({ ...input, unexpected: 'selector' }),
    ).toThrow();
    expect(() =>
      commitExplorerResponseSchema.parse({
        schemaVersion: 1,
        branches: Array.from({ length: 501 }, (_, index) => `branch-${index}`),
        selection: input,
        commits: [],
        nextCursor: null,
      }),
    ).toThrow();
    expect(() =>
      commitExplorerResponseSchema.parse({
        schemaVersion: 1,
        branches: ['master'],
        selection: input,
        commits: Array.from({ length: 25 }, () => commit),
        nextCursor: null,
      }),
    ).toThrow();
  });
});
