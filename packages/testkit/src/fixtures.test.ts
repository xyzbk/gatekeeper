import { expect, it } from 'vitest';

it('creates isolated valid review fixtures', async () => {
  const { createReviewRunFixture } = await import('./fixtures.js');

  const first = createReviewRunFixture();
  first.findings.push({} as never);

  expect(createReviewRunFixture().findings).toEqual([]);
});
