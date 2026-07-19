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
  changes: z.array(changedFileSummarySchema).max(500),
  previousReviewId: identifierSchema.optional(),
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
    reasoningProvider: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
  })
  .strict();

const reviewOperationBaseShape = {
  schemaVersion: z.literal(1),
  reviewId: identifierSchema,
  repositoryId: identifierSchema,
  target: reviewTargetSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};

export const reviewOperationSchema = z
  .discriminatedUnion('status', [
    z
      .object({
        ...reviewOperationBaseShape,
        status: z.literal('queued'),
        stage: z.literal('queued'),
      })
      .strict(),
    z
      .object({
        ...reviewOperationBaseShape,
        status: z.literal('running'),
        stage: z.enum(['syncing_history', 'evaluating_change', 'persisting_review']),
      })
      .strict(),
    z
      .object({
        ...reviewOperationBaseShape,
        status: z.literal('failed'),
        stage: z.literal('failed'),
        error: z
          .object({
            code: z.literal('REVIEW_FAILED'),
            message: z.string().trim().min(1).max(300),
            repair: z.string().trim().min(1).max(500).optional(),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...reviewOperationBaseShape,
        status: z.literal('completed'),
        stage: z.literal('completed'),
        review: reviewRunSchema,
      })
      .strict(),
  ])
  .superRefine((operation, context) => {
    if (
      operation.status === 'completed' &&
      (operation.review.reviewId !== operation.reviewId ||
        operation.review.repositoryId !== operation.repositoryId ||
        operation.review.target.kind !== operation.target.kind ||
        operation.review.target.display !== operation.target.display)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Completed operation identity must match its review.',
        path: ['review'],
      });
    }
  });

export const reviewCompletionFindingSchema = findingSchema
  .omit({ enforcement: true, policyId: true })
  .extend({
    authority: z.enum(['EVIDENCE_SUPPORTED', 'INFERENCE']),
    evidence: z.array(evidencePointerSchema).max(20),
    affectedPaths: z.array(z.string().trim().min(1).max(4_096)).max(100).optional(),
    affectedSymbols: z.array(z.string().trim().min(1).max(500)).max(100).optional(),
    remediation: z.array(z.string().trim().min(1).max(1_000)).max(20),
  })
  .strict()
  .superRefine((finding, context) => {
    if (finding.authority === 'EVIDENCE_SUPPORTED' && finding.evidence.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'Evidence-supported findings must cite at least one offered evidence pointer.',
        path: ['evidence'],
      });
    }
  });

export const reviewCompletionInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    findings: z.array(reviewCompletionFindingSchema).max(100),
    model: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .strict()
  .superRefine(({ findings }, context) => {
    const seen = new Set<string>();
    for (const [index, finding] of findings.entries()) {
      if (seen.has(finding.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Finding IDs must be unique.',
          path: ['findings', index, 'id'],
        });
      }
      seen.add(finding.id);
    }
  });

export const reviewRunJsonSchema = {
  $id: 'https://gatekeeper.local/schemas/verdict-v1.json',
  title: 'Gatekeeper Review Verdict',
  ...z.toJSONSchema(reviewRunSchema, { target: 'draft-2020-12' }),
};

export const reviewRunApiJsonSchema = {
  $id: 'gatekeeper:review-run-v1',
  ...z.toJSONSchema(reviewRunSchema, { target: 'draft-7' }),
};

export const reviewDraftJsonSchema = {
  $id: 'gatekeeper:review-draft-v1',
  ...z.toJSONSchema(reviewDraftSchema, { target: 'draft-7' }),
};

export const reviewCompletionInputJsonSchema = {
  $id: 'gatekeeper:review-completion-input-v1',
  ...z.toJSONSchema(reviewCompletionInputSchema, { target: 'draft-7' }),
};

export const reviewOperationApiJsonSchema = {
  $id: 'gatekeeper:review-operation-v1',
  ...z.toJSONSchema(reviewOperationSchema, { target: 'draft-7' }),
};

export const reviewLookupSchema = z.union([reviewOperationSchema, reviewRunSchema]);

export const reviewLookupApiJsonSchema = {
  $id: 'gatekeeper:review-lookup-v1',
  ...z.toJSONSchema(reviewLookupSchema, { target: 'draft-7' }),
};

export type ReviewRunContract = z.infer<typeof reviewRunSchema>;
export type ReviewDraftContract = z.infer<typeof reviewDraftSchema>;
export type ReviewCompletionFinding = z.infer<typeof reviewCompletionFindingSchema>;
export type ReviewCompletionInput = z.infer<typeof reviewCompletionInputSchema>;
export type ReviewOperationContract = z.infer<typeof reviewOperationSchema>;
export type ReviewLookupContract = z.infer<typeof reviewLookupSchema>;
