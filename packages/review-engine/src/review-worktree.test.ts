import { reviewRunSchema, type ChangedFile, type ChangeSet } from '@gatekeeper/contracts';
import type { GatekeeperPolicy } from '@gatekeeper/config';
import { assembleVerdict, type RepositoryId, type ReviewId } from '@gatekeeper/domain';
import { describe, expect, it } from 'vitest';

import { createLocalRepositoryId, reviewWorktree } from './review-worktree.js';

const repositoryId = 'repository_test' as RepositoryId;
const reviewId = 'review_test' as ReviewId;

function changedFile(path: string, overrides: Partial<ChangedFile> = {}): ChangedFile {
  return {
    path,
    status: 'modified',
    additions: 1,
    deletions: 0,
    binary: false,
    contentTruncated: false,
    addedLines: ['export const changed = true;'],
    ...overrides,
  };
}

function changeSet(files: ChangedFile[]): ChangeSet {
  return {
    schemaVersion: 1,
    target: { kind: 'worktree', display: 'Current worktree' },
    files,
  };
}

function review(files: ChangedFile[], policy: GatekeeperPolicy) {
  return reviewWorktree({
    changeSet: changeSet(files),
    createdAt: '2026-07-18T12:00:00.000Z',
    policy,
    repositoryId,
    reviewId,
  });
}

describe('reviewWorktree', () => {
  it('fast-paths a source change accompanied by its required test', () => {
    const result = review([changedFile('src/app.ts'), changedFile('tests/app.test.ts')], {
      version: 1,
      tests: {
        relationships: [
          {
            id: 'source-needs-tests',
            source: ['src/**'],
            tests: ['tests/**'],
            enforcement: 'required',
          },
        ],
      },
    });

    expect(result.verdict).toBe('FAST_PATH');
    expect(result.findings).toEqual([]);
  });

  it('requires changes when related source changes have no test change', () => {
    const result = review([changedFile('src/app.ts')], {
      version: 1,
      tests: {
        relationships: [
          {
            id: 'source-needs-tests',
            source: ['src/**'],
            tests: ['tests/**'],
            enforcement: 'required',
          },
        ],
      },
    });

    expect(result.verdict).toBe('REQUIRE_CHANGES');
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        category: 'test-coverage',
        policyId: 'source-needs-tests',
        authority: 'DETERMINISTIC',
      }),
    );
  });

  it('escalates a critical risk-zone change for human review', () => {
    const result = review([changedFile('src/auth/session.ts')], {
      version: 1,
      riskZones: [
        {
          id: 'authentication',
          paths: ['src/auth/**'],
          level: 'critical',
          verdictFloor: 'ESCALATE',
        },
      ],
    });

    expect(result.verdict).toBe('ESCALATE');
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        category: 'risk-zone',
        severity: 'critical',
        humanApprovalRequired: true,
      }),
    );
  });

  it('blocks a hard protected-path change through deterministic authority only', () => {
    const result = review([changedFile('internal/protected/rules.ts')], {
      version: 1,
      protectedPaths: [
        {
          id: 'protected-rules',
          paths: ['internal/protected/**'],
          enforcement: 'hard',
          message: 'This path requires an authorized workflow.',
        },
      ],
    });

    expect(result.verdict).toBe('BLOCK');
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        category: 'protected-path',
        authority: 'DETERMINISTIC',
        enforcement: 'hard',
      }),
    );
  });

  it('enforces configured changed-file and changed-line limits', () => {
    const result = review(
      [changedFile('src/app.ts', { additions: 4 }), changedFile('src/other.ts')],
      {
        version: 1,
        review: {
          maxChangedFiles: { value: 1, enforcement: 'required' },
          maxChangedLines: { value: 3, enforcement: 'required' },
        },
      },
    );

    expect(result.verdict).toBe('REQUIRE_CHANGES');
    expect(result.findings.filter(({ category }) => category === 'change-size')).toHaveLength(2);
  });

  it('detects an added relative import crossing a denied boundary', () => {
    const result = review(
      [
        changedFile('src/routes/users.ts', {
          addedLines: ["import { users } from '../repositories/users.js';"],
        }),
      ],
      {
        version: 1,
        architecture: {
          importBoundaries: [
            {
              id: 'routes-no-repositories',
              from: ['src/routes/**'],
              deny: ['src/repositories/**'],
              enforcement: 'required',
              rationale: 'Routes call services.',
            },
          ],
        },
      },
    );

    expect(result.verdict).toBe('REQUIRE_CHANGES');
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        category: 'architecture',
        policyId: 'routes-no-repositories',
        affectedPaths: ['src/routes/users.ts', 'src/repositories/users.js'],
      }),
    );
  });

  it('escalates when a configured import-boundary source was not fully inspected', () => {
    const result = review(
      [
        changedFile('src/routes/users.ts', {
          addedLines: [],
          contentTruncated: true,
        }),
      ],
      {
        version: 1,
        architecture: {
          importBoundaries: [
            {
              id: 'routes-no-repositories',
              from: ['src/routes/**'],
              deny: ['src/repositories/**'],
              enforcement: 'required',
            },
          ],
        },
      },
    );

    expect(result.verdict).toBe('ESCALATE');
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        category: 'architecture',
        title: 'Import-boundary inspection incomplete',
        authority: 'DETERMINISTIC',
        humanApprovalRequired: true,
      }),
    );
  });

  it('computes deterministic metrics and excludes policy-ignored changes', () => {
    const result = review(
      [
        changedFile('src/app.ts', { additions: 3, deletions: 1 }),
        changedFile('tests/app.test.ts', { additions: 2 }),
        changedFile('docs/guide.md', { additions: 4 }),
        changedFile('dist/generated.js', { additions: 100 }),
      ],
      { version: 1, paths: { ignore: ['dist/**'] } },
    );

    expect(result.metrics).toEqual({
      filesChanged: 3,
      linesAdded: 9,
      linesDeleted: 1,
      productionFilesChanged: 1,
      testFilesChanged: 1,
      documentationFilesChanged: 1,
      pathGroups: [
        { name: 'docs', count: 1 },
        { name: 'src', count: 1 },
        { name: 'tests', count: 1 },
      ],
    });
    expect(result.changes.map(({ path }) => path)).toEqual([
      'docs/guide.md',
      'src/app.ts',
      'tests/app.test.ts',
    ]);
    expect(result.changes[0]).not.toHaveProperty('addedLines');
    expect(result).not.toHaveProperty('evidenceCandidates');
    expect(reviewRunSchema.parse(result)).toEqual(result);
  });

  it('is repeatable and never lets inference produce BLOCK', () => {
    const inputFiles = [changedFile('src/app.ts')];
    const policy: GatekeeperPolicy = { version: 1 };

    expect(review(inputFiles, policy)).toEqual(review(inputFiles, policy));
    expect(
      assembleVerdict([
        {
          id: 'inference' as never,
          authority: 'INFERENCE',
          severity: 'critical',
          enforcement: 'hard',
          humanApprovalRequired: true,
        },
      ]),
    ).toBe('ESCALATE');
  });
});

describe('createLocalRepositoryId', () => {
  it('creates stable opaque identifiers from canonical roots', () => {
    expect(createLocalRepositoryId('C:/work/gatekeeper')).toBe(
      createLocalRepositoryId('C:/work/gatekeeper'),
    );
    expect(createLocalRepositoryId('C:/work/gatekeeper')).not.toBe(
      createLocalRepositoryId('C:/work/another'),
    );
    expect(createLocalRepositoryId('C:/work/gatekeeper')).not.toContain('gatekeeper');
  });
});
