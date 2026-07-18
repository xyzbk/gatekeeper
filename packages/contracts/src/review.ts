import {
  ENFORCEMENT_LEVELS,
  EVIDENCE_SOURCE_TYPES,
  FINDING_AUTHORITIES,
  FINDING_SEVERITIES,
  REVIEW_TARGET_KINDS,
  VERDICTS,
} from '@gatekeeper/domain';
import { z } from 'zod';

import { changedFileSummarySchema } from './change.js';

const identifierSchema = z.string().trim().min(1);

export const evidencePointerSchema = z
  .object({
    sourceType: z.enum(EVIDENCE_SOURCE_TYPES),
    repositoryId: identifierSchema,
    sourceId: identifierSchema,
    title: z.string().optional(),
    path: z.string().optional(),
    startLine: z.int().positive().optional(),
    endLine: z.int().positive().optional(),
    commitSha: z.string().optional(),
    remoteUrl: z.string().optional(),
    excerpt: z.string().max(2_000).optional(),
    contentHash: z.string().optional(),
  })
  .strict();

export const reviewTargetSchema = z
  .object({
    kind: z.enum(REVIEW_TARGET_KINDS),
    display: z.string().trim().min(1),
    base: z.string().optional(),
    head: z.string().optional(),
    pullRequestNumber: z.int().positive().optional(),
  })
  .strict();

export const findingSchema = z
  .object({
    id: identifierSchema,
    category: identifierSchema,
    severity: z.enum(FINDING_SEVERITIES),
    authority: z.enum(FINDING_AUTHORITIES),
    confidence: z.number().min(0).max(1),
    title: z.string().trim().min(1).max(300),
    explanation: z.string().trim().min(1).max(6_000),
    evidence: z.array(evidencePointerSchema),
    affectedPaths: z.array(z.string()).optional(),
    affectedSymbols: z.array(z.string()).optional(),
    remediation: z.array(z.string().trim().min(1)),
    falsePositiveRisk: z.enum(['none', 'low', 'medium', 'high']).optional(),
    humanApprovalRequired: z.boolean(),
    policyId: z.string().nullable().optional(),
    enforcement: z.enum(ENFORCEMENT_LEVELS).optional(),
  })
  .strict();

export const reviewMetricsSchema = z
  .object({
    filesChanged: z.int().nonnegative(),
    linesAdded: z.int().nonnegative(),
    linesDeleted: z.int().nonnegative(),
    pathGroups: z.array(
      z
        .object({
          name: z.string().trim().min(1).max(4_096),
          count: z.int().positive(),
        })
        .strict(),
    ),
    productionFilesChanged: z.int().nonnegative().optional(),
    testFilesChanged: z.int().nonnegative().optional(),
    documentationFilesChanged: z.int().nonnegative().optional(),
  })
  .strict();

const reviewBaseShape = {
  schemaVersion: z.literal(1),
  reviewId: identifierSchema,
  repositoryId: identifierSchema,
  target: reviewTargetSchema,
  findings: z.array(findingSchema),
  metrics: reviewMetricsSchema,
  createdAt: z.iso.datetime(),
};

export const reviewDraftSchema = z
  .object({
    ...reviewBaseShape,
    evidenceCandidates: z.array(evidencePointerSchema),
  })
  .strict();

export const reviewRunSchema = z
  .object({
    ...reviewBaseShape,
    verdict: z.enum(VERDICTS),
    summary: z.string().trim().min(1).max(4_000),
    changes: z.array(changedFileSummarySchema).max(500),
    previousReviewId: identifierSchema.optional(),
    reasoningProvider: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
  })
  .strict();

export const reviewRunJsonSchema = {
  $id: 'https://gatekeeper.local/schemas/verdict-v1.json',
  title: 'Gatekeeper Review Verdict',
  ...z.toJSONSchema(reviewRunSchema, { target: 'draft-2020-12' }),
};

export type ReviewRunContract = z.infer<typeof reviewRunSchema>;
