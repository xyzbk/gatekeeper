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
    const { reviewRunJsonSchema } = await import('./review.js');

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
