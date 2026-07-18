import { describe, expect, it } from 'vitest';

import {
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
});
