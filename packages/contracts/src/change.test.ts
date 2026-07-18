import { describe, expect, it } from 'vitest';

it('exports the bounded worktree change-set contract', async () => {
  const contracts: Record<string, unknown> = await import('./index.js');

  expect(contracts).toHaveProperty('changeSetSchema');
});

const validChangeSet = {
  schemaVersion: 1,
  target: { kind: 'worktree', display: 'Current worktree' },
  files: [
    {
      path: 'src/review.ts',
      status: 'modified',
      additions: 3,
      deletions: 1,
      binary: false,
      contentTruncated: false,
      addedLines: ['export const review = true;'],
    },
  ],
};

describe('changeSetSchema', () => {
  it('accepts one bounded canonical worktree change', async () => {
    const { changeSetSchema } = await import('./change.js');

    expect(changeSetSchema.parse(validChangeSet)).toEqual(validChangeSet);
  });

  it('rejects unknown fields and non-canonical paths', async () => {
    const { changeSetSchema } = await import('./change.js');

    expect(() =>
      changeSetSchema.parse({
        ...validChangeSet,
        files: [{ ...validChangeSet.files[0], extra: 1 }],
      }),
    ).toThrow();
    for (const path of [
      '../secret.txt',
      'src/../secret.txt',
      '/etc/passwd',
      'C:/secret.txt',
      ' src/file.ts',
      'src/file.ts ',
      'src/\nfile.ts',
    ]) {
      expect(() =>
        changeSetSchema.parse({
          ...validChangeSet,
          files: [{ ...validChangeSet.files[0], path }],
        }),
      ).toThrow();
    }
  });

  it('requires a previous path only for renames', async () => {
    const { changeSetSchema } = await import('./change.js');

    expect(() =>
      changeSetSchema.parse({
        ...validChangeSet,
        files: [{ ...validChangeSet.files[0], status: 'renamed' }],
      }),
    ).toThrow();
    expect(() =>
      changeSetSchema.parse({
        ...validChangeSet,
        files: [{ ...validChangeSet.files[0], previousPath: 'src/old.ts' }],
      }),
    ).toThrow();
  });

  it('bounds changed paths and added-line inspection', async () => {
    const { changeSetSchema } = await import('./change.js');

    expect(() =>
      changeSetSchema.parse({
        ...validChangeSet,
        files: Array.from({ length: 501 }, (_, index) => ({
          ...validChangeSet.files[0],
          path: `src/file-${index}.ts`,
        })),
      }),
    ).toThrow();
    expect(() =>
      changeSetSchema.parse({
        ...validChangeSet,
        files: [
          { ...validChangeSet.files[0], addedLines: Array.from({ length: 501 }, () => 'line') },
        ],
      }),
    ).toThrow();
    expect(() =>
      changeSetSchema.parse({
        ...validChangeSet,
        files: [{ ...validChangeSet.files[0], addedLines: ['x'.repeat(2_001)] }],
      }),
    ).toThrow();
  });

  it('accepts a bounded pull-request target without weakening the worktree target', async () => {
    const { changeSetSchema } = await import('./change.js');

    expect(
      changeSetSchema.parse({
        schemaVersion: 1,
        target: {
          kind: 'pull_request',
          display: 'Pull request #12',
          pullRequestNumber: 12,
          base: 'master',
          head: 'redis-cache',
        },
        files: [],
      }),
    ).toMatchObject({ target: { kind: 'pull_request', pullRequestNumber: 12 } });

    expect(() =>
      changeSetSchema.parse({
        schemaVersion: 1,
        target: {
          kind: 'pull_request',
          display: 'Pull request #0',
          pullRequestNumber: 0,
        },
        files: [],
      }),
    ).toThrow();

    expect(changeSetSchema.parse(validChangeSet)).toEqual(validChangeSet);
  });
});
