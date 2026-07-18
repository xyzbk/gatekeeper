import { z } from 'zod';

const remotePartSchema = z
  .string()
  .regex(/^[a-z0-9_.-]+$/)
  .max(100);
const boundedTextSchema = z.string().max(20_000);
const timestampSchema = z.iso.datetime({ offset: true });

export const githubRemoteSchema = z
  .object({
    host: remotePartSchema,
    owner: remotePartSchema,
    name: remotePartSchema,
    nameWithOwner: z
      .string()
      .regex(/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/)
      .max(201),
    url: z.url({ protocol: /^https$/ }),
  })
  .strict();

export const githubPreflightSchema = z
  .object({
    schemaVersion: z.literal(1),
    host: remotePartSchema,
    authenticated: z.literal(true),
  })
  .strict();

export const githubSyncLimitsSchema = z
  .object({
    issueLimit: z.int().min(1).max(100).default(50),
    pullRequestLimit: z.int().min(1).max(100).default(50),
    commentLimit: z.int().min(1).max(100).default(100),
    reviewLimitPerPullRequest: z.int().min(0).max(100).default(20),
    maxPullRequestFiles: z.int().min(1).max(500).default(200),
  })
  .strict();

export const pullRequestRecordSchema = z
  .object({
    number: z.int().positive(),
    title: z.string().trim().min(1).max(300),
    body: boundedTextSchema,
    state: z.enum(['OPEN', 'CLOSED', 'MERGED']),
    url: z.url({ protocol: /^https$/ }),
    author: z.string().trim().min(1).max(100).nullable(),
    baseRefName: z.string().trim().min(1).max(300),
    headRefName: z.string().trim().min(1).max(300),
    headRefOid: z.string().regex(/^[0-9a-f]{40,64}$/),
    additions: z.int().nonnegative(),
    deletions: z.int().nonnegative(),
    changedFiles: z.int().nonnegative(),
    checks: z.enum(['pass', 'fail', 'pending', 'unknown']),
    isDraft: z.boolean(),
    closingIssueNumbers: z.array(z.int().positive()).max(100),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    closedAt: timestampSchema.nullable(),
    mergedAt: timestampSchema.nullable(),
  })
  .strict();

export const githubRemoteRecordSchema = z
  .object({
    kind: z.enum(['issue', 'pull_request', 'issue_comment', 'review', 'review_comment']),
    sourceId: z.string().trim().min(1).max(300),
    number: z.int().positive().nullable().optional(),
    parentSourceId: z.string().trim().min(1).max(300).nullable(),
    title: z.string().trim().min(1).max(300),
    body: boundedTextSchema,
    url: z.url({ protocol: /^https$/ }),
    state: z.string().trim().min(1).max(50),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const githubHistoryFailureSchema = z
  .object({
    source: z.string().trim().min(1).max(300),
    code: z.enum(['malformed_record', 'unavailable']),
  })
  .strict();

export const githubHistoryBatchSchema = z
  .object({
    schemaVersion: z.literal(1),
    records: z.array(githubRemoteRecordSchema).max(2_500),
    failures: z.array(githubHistoryFailureSchema).max(500),
    cursor: timestampSchema.nullable(),
    partial: z.boolean(),
  })
  .strict();

const remoteSyncCountsSchema = z
  .object({
    received: z.int().nonnegative(),
    written: z.int().nonnegative(),
    unchanged: z.int().nonnegative(),
  })
  .strict();

export const githubSyncResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    repositoryId: z.string().trim().min(1).max(300),
    provider: z.literal('github'),
    syncedAt: timestampSchema,
    cursor: timestampSchema.nullable(),
    partial: z.boolean(),
    documents: remoteSyncCountsSchema,
    links: remoteSyncCountsSchema,
    failures: z.array(githubHistoryFailureSchema).max(500),
  })
  .strict();

export const pullRequestReviewInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    pullRequestNumber: z.int().positive(),
  })
  .strict();

export const pullRequestReviewInputJsonSchema = {
  $id: 'gatekeeper:pull-request-review-input-v1',
  ...z.toJSONSchema(pullRequestReviewInputSchema, { target: 'draft-7' }),
};

export const githubSyncResultJsonSchema = {
  $id: 'gatekeeper:github-sync-result-v1',
  ...z.toJSONSchema(githubSyncResultSchema, { target: 'draft-7' }),
};

export type GitHubRemote = z.infer<typeof githubRemoteSchema>;
export type GitHubPreflight = z.infer<typeof githubPreflightSchema>;
export type GitHubSyncLimits = z.infer<typeof githubSyncLimitsSchema>;
export type PullRequestRecord = z.infer<typeof pullRequestRecordSchema>;
export type GitHubRemoteRecord = z.infer<typeof githubRemoteRecordSchema>;
export type GitHubHistoryFailure = z.infer<typeof githubHistoryFailureSchema>;
export type GitHubHistoryBatch = z.infer<typeof githubHistoryBatchSchema>;
export type GitHubSyncResult = z.infer<typeof githubSyncResultSchema>;
export type PullRequestReviewInput = z.infer<typeof pullRequestReviewInputSchema>;
