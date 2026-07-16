import { expect, it } from 'vitest';

it('rejects unsafe extra fields in the shared error envelope', async () => {
  const { errorEnvelopeSchema } = await import('./error.js');

  expect(() =>
    errorEnvelopeSchema.parse({
      error: {
        code: 'ENVIRONMENT_ERROR',
        message: 'Git is unavailable.',
        repair: 'Install Git and retry.',
        stack: 'must not cross the boundary',
      },
    }),
  ).toThrow();
});
