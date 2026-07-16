import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const examplePolicyUrl = new URL('../../../gatekeeper.policy.example.yaml', import.meta.url);

describe('parsePolicy', () => {
  it('validates the project policy example', async () => {
    const [{ parsePolicy }, source] = await Promise.all([
      import('./policy.js'),
      readFile(examplePolicyUrl, 'utf8'),
    ]);

    expect(parsePolicy(source).version).toBe(1);
  });

  it('reports an actionable path for an invalid field', async () => {
    const { parsePolicy, PolicyValidationError } = await import('./policy.js');

    try {
      parsePolicy(
        'version: 1\nreview:\n  maxChangedFiles:\n    value: -1\n    enforcement: required\n',
      );
      expect.unreachable('Expected invalid policy to throw.');
    } catch (error) {
      expect(error).toBeInstanceOf(PolicyValidationError);
      if (error instanceof PolicyValidationError) {
        expect(error.issues.some(({ path }) => path === 'review.maxChangedFiles.value')).toBe(true);
      }
    }
  });
});
