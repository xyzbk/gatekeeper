import { z } from 'zod';

import { evidencePointerSchema } from './review.js';

const identifierSchema = z.string().trim().min(1).max(300);
const countSchema = z.int().nonnegative();
const indexCountsSchema = z
  .object({
    scanned: countSchema,
    written: countSchema,
    unchanged: countSchema,
    deleted: countSchema,
  })
  .strict();

export const repositoryRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    repositoryId: identifierSchema,
    root: z.string().trim().min(1).max(4_096),
    remote: z.string().trim().min(1).max(4_096).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const indexStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    repositoryId: identifierSchema,
    head: z.string().regex(/^[0-9a-f]{40,64}$/),
    indexedAt: z.iso.datetime(),
    files: countSchema,
    documents: countSchema,
    commits: countSchema,
  })
  .strict();

export const indexResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    repositoryId: identifierSchema,
    head: z.string().regex(/^[0-9a-f]{40,64}$/),
    indexedAt: z.iso.datetime(),
    files: indexCountsSchema,
    documents: indexCountsSchema,
    commits: indexCountsSchema,
  })
  .strict();

export const repositoryStatusSchema = z.discriminatedUnion('state', [
  z
    .object({
      schemaVersion: z.literal(1),
      state: z.literal('not_initialized'),
      repository: z.null(),
      indexState: z.null(),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(1),
      state: z.literal('ready'),
      repository: repositoryRecordSchema,
      indexState: indexStateSchema.nullable(),
    })
    .strict(),
]);

export const memorySearchInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    repositoryId: identifierSchema,
    query: z.string().trim().min(1).max(256),
    limit: z.int().min(1).max(50).optional(),
  })
  .strict();

export const memorySearchResultSchema = z
  .object({
    documentId: identifierSchema,
    match: z.enum(['exact', 'fts']),
    trust: z.literal('untrusted_repository_content'),
    status: z.enum(['active', 'historical', 'superseded', 'unknown']),
    occurredAt: z.iso.datetime().nullable(),
    evidence: evidencePointerSchema,
  })
  .strict();

export const memorySearchResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    results: z.array(memorySearchResultSchema).max(50),
  })
  .strict();

export const repositoryRecordJsonSchema = {
  $id: 'gatekeeper:repository-record-v1',
  ...z.toJSONSchema(repositoryRecordSchema, { target: 'draft-7' }),
};

export const indexStateJsonSchema = {
  $id: 'gatekeeper:index-state-v1',
  ...z.toJSONSchema(indexStateSchema, { target: 'draft-7' }),
};

export const indexResultJsonSchema = {
  $id: 'gatekeeper:index-result-v1',
  ...z.toJSONSchema(indexResultSchema, { target: 'draft-7' }),
};

export const memorySearchInputJsonSchema = {
  $id: 'gatekeeper:memory-search-input-v1',
  ...z.toJSONSchema(memorySearchInputSchema, { target: 'draft-7' }),
};

export const memorySearchResponseJsonSchema = {
  $id: 'gatekeeper:memory-search-response-v1',
  ...z.toJSONSchema(memorySearchResponseSchema, { target: 'draft-7' }),
};

export const repositoryStatusJsonSchema = {
  $id: 'gatekeeper:repository-status-v1',
  ...z.toJSONSchema(repositoryStatusSchema, { target: 'draft-7' }),
};

export type RepositoryRecord = z.infer<typeof repositoryRecordSchema>;
export type IndexState = z.infer<typeof indexStateSchema>;
export type IndexResult = z.infer<typeof indexResultSchema>;
export type RepositoryStatus = z.infer<typeof repositoryStatusSchema>;
export type MemorySearchInput = z.infer<typeof memorySearchInputSchema>;
export type MemorySearchResult = z.infer<typeof memorySearchResultSchema>;
export type MemorySearchResponse = z.infer<typeof memorySearchResponseSchema>;
