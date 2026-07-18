import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadRepositoryPolicy, RepositoryPolicyError } from './repository-policy.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function temporaryDirectory(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

async function writePolicy(root: string, source: string): Promise<void> {
  await mkdir(join(root, '.gatekeeper'), { recursive: true });
  await writeFile(join(root, '.gatekeeper', 'policies.yaml'), source, 'utf8');
}

describe('loadRepositoryPolicy', () => {
  it('loads .gatekeeper/policies.yaml from the canonical repository root', async () => {
    const root = await temporaryDirectory('gatekeeper-policy-');
    await writePolicy(root, 'version: 1\npaths:\n  ignore:\n    - dist/**\n');

    const loaded = await loadRepositoryPolicy(root);

    expect(loaded.source).toBe('file');
    expect(loaded.path).toBe(join(root, '.gatekeeper', 'policies.yaml'));
    expect(loaded.policy.paths?.ignore).toEqual(['dist/**']);
  });

  it('uses the strict empty v1 policy only when a review allows a missing file', async () => {
    const root = await temporaryDirectory('gatekeeper-policy-default-');

    await expect(loadRepositoryPolicy(root)).resolves.toEqual({
      path: join(root, '.gatekeeper', 'policies.yaml'),
      policy: { version: 1 },
      source: 'default',
    });
    await expect(loadRepositoryPolicy(root, { required: true })).rejects.toEqual(
      expect.objectContaining({ code: 'MISSING_POLICY' }),
    );
  });

  it('reports invalid policy field paths without returning repository content', async () => {
    const root = await temporaryDirectory('gatekeeper-policy-invalid-');
    await writePolicy(
      root,
      'version: 1\nreview:\n  maxChangedFiles:\n    value: -1\n    enforcement: required\nprivate: do-not-echo\n',
    );

    try {
      await loadRepositoryPolicy(root, { required: true });
      expect.unreachable('Expected policy validation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(RepositoryPolicyError);
      if (!(error instanceof RepositoryPolicyError)) {
        throw error;
      }
      expect(error.code).toBe('INVALID_POLICY');
      expect(error.issuePaths).toContain('review.maxChangedFiles.value');
      expect(error.issuePaths).toContain('private');
      expect(String(error)).not.toContain('do-not-echo');
    }
  });

  it('rejects a policy symlink that resolves outside the repository', async () => {
    const root = await temporaryDirectory('gatekeeper-policy-link-');
    const outside = await temporaryDirectory('gatekeeper-policy-outside-');
    await writeFile(join(outside, 'policies.yaml'), 'version: 1\n', 'utf8');
    await symlink(outside, join(root, '.gatekeeper'), 'junction');

    await expect(loadRepositoryPolicy(root, { required: true })).rejects.toEqual(
      expect.objectContaining({ code: 'UNSAFE_POLICY_PATH' }),
    );
  });
});
