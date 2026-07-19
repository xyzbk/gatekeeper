import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const verdictSchemaUrl = new URL('../../../schemas/verdict.schema.json', import.meta.url);

describe('reviewRunSchema', () => {
  it('accepts a valid verdict fixture', async () => {
    const [{ reviewRunSchema }, { createReviewRunFixture }] = await Promise.all([
      import('./review.js'),
      import('@gatekeeper/testkit'),
    ]);

    const review = reviewRunSchema.parse(createReviewRunFixture());

    expect(review.verdict).toBe('FAST_PATH');
    expect(review.metrics.pathGroups).toEqual([{ name: 'src', count: 1 }]);
    expect(review.changes).toEqual([
      expect.objectContaining({ path: 'src/index.ts', contentTruncated: false }),
    ]);
  });

  it('rejects unknown fields', async () => {
    const [{ reviewRunSchema }, { createReviewRunFixture }] = await Promise.all([
      import('./review.js'),
      import('@gatekeeper/testkit'),
    ]);

    expect(() =>
      reviewRunSchema.parse({ ...createReviewRunFixture(), unexpected: true }),
    ).toThrow();
  });

  it('generates strict JSON Schema from the Zod contract', async () => {
    const { reviewRunApiJsonSchema, reviewRunJsonSchema } = await import('./review.js');

    expect(reviewRunJsonSchema.type).toBe('object');
    expect(reviewRunJsonSchema.additionalProperties).toBe(false);
    expect(Object.entries(reviewRunJsonSchema)).toContainEqual([
      '$id',
      'https://gatekeeper.local/schemas/verdict-v1.json',
    ]);
    expect(Object.entries(reviewRunJsonSchema)).toContainEqual([
      'title',
      'Gatekeeper Review Verdict',
    ]);
    expect(reviewRunJsonSchema.required).toContain('schemaVersion');
    expect(reviewRunJsonSchema.required).toContain('reviewId');
    expect(reviewRunJsonSchema.required).toContain('verdict');
    expect(reviewRunJsonSchema.required).toContain('changes');
    expect(reviewRunApiJsonSchema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(reviewRunApiJsonSchema.$id).toBe('gatekeeper:review-run-v1');
    expect(reviewRunApiJsonSchema.additionalProperties).toBe(false);
  });

  it('keeps the committed verdict schema synchronized with Zod', async () => {
    const [{ reviewRunJsonSchema }, serializedSchema] = await Promise.all([
      import('./review.js'),
      readFile(verdictSchemaUrl, 'utf8'),
    ]);
    const committedSchema: unknown = JSON.parse(serializedSchema);

    expect(committedSchema).toEqual(reviewRunJsonSchema);
  });
});

describe('review completion contracts', () => {
  const evidence = {
    sourceType: 'adr' as const,
    repositoryId: 'repository_fixture',
    sourceId: 'docs/adr/0001.md',
    path: 'docs/adr/0001.md',
    excerpt: 'Keep the cache optional.',
  };

  const supportedFinding = {
    id: 'finding_supported',
    category: 'architecture-history',
    severity: 'medium' as const,
    authority: 'EVIDENCE_SUPPORTED' as const,
    confidence: 0.9,
    title: 'The change conflicts with an active ADR',
    explanation: 'The retrieved ADR requires the cache to remain optional.',
    evidence: [evidence],
    affectedPaths: ['src/cache.ts'],
    remediation: ['Keep the cache optional.'],
    falsePositiveRisk: 'low' as const,
    humanApprovalRequired: false,
  };

  it('accepts only model-authored evidence-supported or inference findings', async () => {
    const { reviewCompletionInputSchema } = await import('./review.js');

    expect(
      reviewCompletionInputSchema.parse({
        schemaVersion: 1,
        findings: [
          supportedFinding,
          {
            ...supportedFinding,
            id: 'finding_inference',
            authority: 'INFERENCE',
            evidence: [],
          },
        ],
        model: 'active-codex-model',
      }),
    ).toEqual(
      expect.objectContaining({
        findings: [
          expect.objectContaining({ authority: 'EVIDENCE_SUPPORTED' }),
          expect.objectContaining({ authority: 'INFERENCE' }),
        ],
      }),
    );
  });

  it.each([
    ['a submitted verdict', { verdict: 'BLOCK' }],
    [
      'deterministic authority',
      { findings: [{ ...supportedFinding, authority: 'DETERMINISTIC' }] },
    ],
    ['model-authored enforcement', { findings: [{ ...supportedFinding, enforcement: 'hard' }] }],
    ['model-authored policy identity', { findings: [{ ...supportedFinding, policyId: 'policy' }] }],
  ])('rejects %s', async (_label, override) => {
    const { reviewCompletionInputSchema } = await import('./review.js');
    const candidate = {
      schemaVersion: 1,
      findings: [supportedFinding],
      ...override,
    };

    expect(() => reviewCompletionInputSchema.parse(candidate)).toThrow();
  });

  it('requires evidence-supported findings to cite evidence and rejects duplicate IDs', async () => {
    const { reviewCompletionInputSchema } = await import('./review.js');

    expect(() =>
      reviewCompletionInputSchema.parse({
        schemaVersion: 1,
        findings: [{ ...supportedFinding, evidence: [] }],
      }),
    ).toThrow();
    expect(() =>
      reviewCompletionInputSchema.parse({
        schemaVersion: 1,
        findings: [supportedFinding, supportedFinding],
      }),
    ).toThrow();
  });

  it('keeps changes and previous review identity in a strict review draft', async () => {
    const [{ reviewDraftSchema }, { createReviewRunFixture }] = await Promise.all([
      import('./review.js'),
      import('@gatekeeper/testkit'),
    ]);
    const review = createReviewRunFixture();

    const draft = reviewDraftSchema.parse({
      schemaVersion: 1,
      reviewId: review.reviewId,
      repositoryId: review.repositoryId,
      target: review.target,
      findings: review.findings,
      metrics: review.metrics,
      changes: review.changes,
      evidenceCandidates: [],
      createdAt: review.createdAt,
      previousReviewId: 'review_previous',
    });

    expect(draft.changes).toEqual(review.changes);
    expect(draft.previousReviewId).toBe('review_previous');
  });
});

describe('review operation contracts', () => {
  it('accepts strict queued, running, failed, and completed operation states', async () => {
    const [{ reviewOperationSchema }, { createReviewRunFixture }] = await Promise.all([
      import('./review.js'),
      import('@gatekeeper/testkit'),
    ]);
    const review = createReviewRunFixture();
    const base = {
      schemaVersion: 1 as const,
      reviewId: review.reviewId,
      repositoryId: review.repositoryId,
      target: review.target,
      createdAt: review.createdAt,
      updatedAt: review.createdAt,
    };

    expect(reviewOperationSchema.parse({ ...base, status: 'queued', stage: 'queued' })).toEqual(
      expect.objectContaining({ status: 'queued', stage: 'queued' }),
    );
    expect(
      reviewOperationSchema.parse({
        ...base,
        status: 'running',
        stage: 'evaluating_change',
      }),
    ).toEqual(expect.objectContaining({ status: 'running', stage: 'evaluating_change' }));
    expect(
      reviewOperationSchema.parse({
        ...base,
        status: 'failed',
        stage: 'failed',
        error: {
          code: 'REVIEW_FAILED',
          message: 'The review did not complete.',
          repair: 'Confirm the repository is accessible, then retry.',
        },
      }),
    ).toEqual(expect.objectContaining({ status: 'failed', stage: 'failed' }));
    expect(
      reviewOperationSchema.parse({
        ...base,
        status: 'completed',
        stage: 'completed',
        review,
      }),
    ).toEqual(expect.objectContaining({ status: 'completed', review }));
  });

  it('rejects mismatched branches, oversized failure copy, and unknown fields', async () => {
    const [{ reviewOperationSchema }, { createReviewRunFixture }] = await Promise.all([
      import('./review.js'),
      import('@gatekeeper/testkit'),
    ]);
    const review = createReviewRunFixture();
    const base = {
      schemaVersion: 1,
      reviewId: review.reviewId,
      repositoryId: review.repositoryId,
      target: review.target,
      createdAt: review.createdAt,
      updatedAt: review.createdAt,
    };

    expect(() =>
      reviewOperationSchema.parse({ ...base, status: 'queued', stage: 'completed' }),
    ).toThrow();
    expect(() =>
      reviewOperationSchema.parse({
        ...base,
        status: 'failed',
        stage: 'failed',
        error: { code: 'REVIEW_FAILED', message: 'x'.repeat(301) },
      }),
    ).toThrow();
    expect(() =>
      reviewOperationSchema.parse({
        ...base,
        status: 'completed',
        stage: 'completed',
        review,
        unexpected: true,
      }),
    ).toThrow();
  });
});
