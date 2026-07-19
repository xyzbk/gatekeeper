import { z } from 'zod';

import { gitCommitRecordSchema } from './project-source.js';
import { evidencePointerSchema, evidenceRelationshipSchema } from './review.js';

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

export const repositoryIdParamsSchema = z.object({ repositoryId: identifierSchema }).strict();

export const reviewIdParamsSchema = z.object({ reviewId: identifierSchema }).strict();

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
    match: z.enum(['exact', 'linked', 'fts']),
    relationship: evidenceRelationshipSchema.optional(),
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

export const recentCommitEvidenceSchema = gitCommitRecordSchema
  .pick({ sha: true, authoredAt: true, title: true })
  .strict();

export const recentCommitEvidenceResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    commits: z.array(recentCommitEvidenceSchema).max(10),
  })
  .strict();

const localBranchNameSchema = z.string().trim().min(1).max(255);
const commitExplorerSourceSchema = z.enum(['all_local', 'project_memory']);
const commitExplorerReviewStateSchema = z.enum(['all', 'reviewed', 'not_reviewed']);
const commitExplorerSortSchema = z.enum(['newest', 'oldest']);
const commitExplorerCursorSchema = z.int().nonnegative().max(50_000);
const commitExplorerFiltersSchema = z
  .object({
    source: commitExplorerSourceSchema,
    query: z.string().trim().min(1).max(256).optional(),
    authoredAfter: z.iso.date().optional(),
    authoredBefore: z.iso.date().optional(),
    reviewState: commitExplorerReviewStateSchema,
    sort: commitExplorerSortSchema,
    cursor: commitExplorerCursorSchema.optional(),
  })
  .strict();

export const commitExplorerInputSchema = commitExplorerFiltersSchema
  .extend({
    schemaVersion: z.literal(1),
    branch: localBranchNameSchema.optional(),
  })
  .strict();

export const commitExplorerSelectionSchema = commitExplorerFiltersSchema
  .extend({
    schemaVersion: z.literal(1),
    branch: localBranchNameSchema,
  })
  .strict();

export const commitExplorerCommitSchema = recentCommitEvidenceSchema
  .extend({
    indexed: z.boolean(),
    reviewed: z.boolean(),
  })
  .strict();

export const commitExplorerResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    branches: z.array(localBranchNameSchema).min(1).max(500),
    selection: commitExplorerSelectionSchema,
    commits: z.array(commitExplorerCommitSchema).max(24),
    nextCursor: commitExplorerCursorSchema.nullable(),
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

export const recentCommitEvidenceResponseJsonSchema = {
  $id: 'gatekeeper:recent-commit-evidence-response-v1',
  ...z.toJSONSchema(recentCommitEvidenceResponseSchema, { target: 'draft-7' }),
};

export const commitExplorerInputJsonSchema = {
  $id: 'gatekeeper:commit-explorer-input-v1',
  ...z.toJSONSchema(commitExplorerInputSchema, { target: 'draft-7' }),
};

export const commitExplorerResponseJsonSchema = {
  $id: 'gatekeeper:commit-explorer-response-v1',
  ...z.toJSONSchema(commitExplorerResponseSchema, { target: 'draft-7' }),
};

export const repositoryStatusJsonSchema = {
  $id: 'gatekeeper:repository-status-v1',
  ...z.toJSONSchema(repositoryStatusSchema, { target: 'draft-7' }),
};

export const repositoryIdParamsJsonSchema = {
  $id: 'gatekeeper:repository-id-params-v1',
  ...z.toJSONSchema(repositoryIdParamsSchema, { target: 'draft-7' }),
};

export const reviewIdParamsJsonSchema = {
  $id: 'gatekeeper:review-id-params-v1',
  ...z.toJSONSchema(reviewIdParamsSchema, { target: 'draft-7' }),
};

export type RepositoryRecord = z.infer<typeof repositoryRecordSchema>;
export type IndexState = z.infer<typeof indexStateSchema>;
export type IndexResult = z.infer<typeof indexResultSchema>;
export type RepositoryStatus = z.infer<typeof repositoryStatusSchema>;
export type RepositoryIdParams = z.infer<typeof repositoryIdParamsSchema>;
export type ReviewIdParams = z.infer<typeof reviewIdParamsSchema>;
export type MemorySearchInput = z.infer<typeof memorySearchInputSchema>;
export type MemorySearchResult = z.infer<typeof memorySearchResultSchema>;
export type MemorySearchResponse = z.infer<typeof memorySearchResponseSchema>;
export type RecentCommitEvidence = z.infer<typeof recentCommitEvidenceSchema>;
export type RecentCommitEvidenceResponse = z.infer<typeof recentCommitEvidenceResponseSchema>;
export type CommitExplorerInput = z.infer<typeof commitExplorerInputSchema>;
export type CommitExplorerSelection = z.infer<typeof commitExplorerSelectionSchema>;
export type CommitExplorerCommit = z.infer<typeof commitExplorerCommitSchema>;
export type CommitExplorerResponse = z.infer<typeof commitExplorerResponseSchema>;
