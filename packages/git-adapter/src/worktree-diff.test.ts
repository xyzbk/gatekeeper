import { appendFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { execa } from 'execa';
import { afterEach, describe, expect, it, vi } from 'vitest';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function createTemporaryDirectory(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

async function runGit(root: string, arguments_: readonly string[]): Promise<void> {
  await execa('git', arguments_, { cwd: root, stdin: 'ignore' });
}

async function writeRepositoryFile(
  root: string,
  path: string,
  content: string | Uint8Array,
): Promise<void> {
  const target = join(root, ...path.split('/'));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

async function createRepository(prefix = 'gatekeeper-worktree-'): Promise<string> {
  const root = await createTemporaryDirectory(prefix);
  await runGit(root, ['init', '--initial-branch=master']);
  await runGit(root, ['config', 'user.email', 'gatekeeper@example.invalid']);
  await runGit(root, ['config', 'user.name', 'Gatekeeper Tests']);
  await runGit(root, ['config', 'core.autocrlf', 'false']);
  return root;
}

async function commitAll(root: string, message = 'baseline'): Promise<void> {
  await runGit(root, ['add', '--all']);
  await runGit(root, ['commit', '--message', message]);
}

it('exposes worktree change extraction from the Git provider', async () => {
  const { createGitProvider } = await import('./git-provider.js');
  const provider: Record<string, unknown> = createGitProvider() as unknown as Record<
    string,
    unknown
  >;

  expect(provider.getWorktreeDiff).toBeTypeOf('function');
});

describe('worktree change extraction', () => {
  it('combines staged, unstaged, and untracked text while honoring all ignore layers', async () => {
    const root = await createRepository('gatekeeper;safe-');
    await writeRepositoryFile(root, '.gitignore', '*.log\n');
    await writeRepositoryFile(root, '.gatekeeperignore', 'private/**\n');
    await writeRepositoryFile(root, 'src/app.ts', 'export const value = 1;\n');
    await commitAll(root);

    await writeRepositoryFile(
      root,
      'src/app.ts',
      'export const value = 1;\nexport const staged = true;\n',
    );
    await runGit(root, ['add', '--', 'src/app.ts']);
    await appendFile(join(root, 'src', 'app.ts'), 'export const unstaged = true;\n', 'utf8');
    await writeRepositoryFile(root, 'src/new.ts', 'export const fresh = true;\n');
    await writeRepositoryFile(root, 'debug.log', 'ignored by git\n');
    await writeRepositoryFile(root, 'private/secret.ts', 'ignored by gatekeeper\n');
    await writeRepositoryFile(root, 'docs/note.md', 'ignored by policy\n');
    const { createGitProvider } = await import('./git-provider.js');

    const changeSet = await createGitProvider().getWorktreeDiff(root, {
      ignorePatterns: ['docs/**'],
    });

    expect(changeSet.files.map(({ path }) => path)).toEqual(['src/app.ts', 'src/new.ts']);
    expect(changeSet.files[0]).toEqual({
      path: 'src/app.ts',
      status: 'modified',
      additions: 2,
      deletions: 0,
      binary: false,
      contentTruncated: false,
      addedLines: ['export const staged = true;', 'export const unstaged = true;'],
    });
    expect(changeSet.files[1]).toEqual({
      path: 'src/new.ts',
      status: 'untracked',
      additions: 1,
      deletions: 0,
      binary: false,
      contentTruncated: false,
      addedLines: ['export const fresh = true;'],
    });
  });

  it('accepts a safe path segment that begins with two dots', async () => {
    const root = await createRepository();
    await writeRepositoryFile(root, 'README.md', '# Fixture\n');
    await commitAll(root);
    await writeRepositoryFile(root, '..config/app.ts', 'export const valid = true;\n');
    const { createGitProvider } = await import('./git-provider.js');

    const result = await createGitProvider().getWorktreeDiff(root);

    expect(result.files).toContainEqual(
      expect.objectContaining({ path: '..config/app.ts', status: 'untracked' }),
    );
  });

  it('reports renames and binary changes without reading binary content', async () => {
    const root = await createRepository();
    await writeRepositoryFile(root, 'src/old.ts', 'export const value = 1;\n');
    await writeRepositoryFile(root, 'assets/data.bin', Uint8Array.from([0, 1, 2, 3]));
    await commitAll(root);

    await runGit(root, ['mv', 'src/old.ts', 'src/new.ts']);
    await writeRepositoryFile(root, 'assets/data.bin', Uint8Array.from([0, 9, 2, 3]));
    const { createGitProvider } = await import('./git-provider.js');

    const changeSet = await createGitProvider().getWorktreeDiff(root);

    expect(changeSet.files).toContainEqual({
      path: 'src/new.ts',
      previousPath: 'src/old.ts',
      status: 'renamed',
      additions: 0,
      deletions: 0,
      binary: false,
      contentTruncated: false,
      addedLines: [],
    });
    expect(changeSet.files).toContainEqual({
      path: 'assets/data.bin',
      status: 'modified',
      additions: 0,
      deletions: 0,
      binary: true,
      contentTruncated: false,
      addedLines: [],
    });
  });

  it('rejects malformed Git stats and traversal paths with safe errors', async () => {
    const root = await createTemporaryDirectory('gatekeeper-malformed-');
    const runMalformedGit = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: root, stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'many\t0\tsrc/app.ts\0', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'M\0src/app.ts\0', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });
    const { createGitProvider } = await import('./git-provider.js');

    await expect(
      createGitProvider({ runGit: runMalformedGit }).getWorktreeDiff(root),
    ).rejects.toEqual(expect.objectContaining({ code: 'MALFORMED_DIFF' }));

    const runTraversalGit = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: root, stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '1\t0\t../secret.ts\0', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'A\0../secret.ts\0', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

    await expect(
      createGitProvider({ runGit: runTraversalGit }).getWorktreeDiff(root),
    ).rejects.toEqual(expect.objectContaining({ code: 'UNSAFE_PATH' }));
  });

  it('rejects an untracked junction that resolves outside the repository', async () => {
    const root = await createRepository();
    await writeRepositoryFile(root, 'src/app.ts', 'export const value = 1;\n');
    await commitAll(root);
    const outside = await createTemporaryDirectory('gatekeeper-outside-');
    await writeRepositoryFile(outside, 'private.ts', 'export const secret = true;\n');
    await symlink(outside, join(root, 'outside-link'), 'junction');
    const { createGitProvider } = await import('./git-provider.js');

    await expect(createGitProvider().getWorktreeDiff(root)).rejects.toEqual(
      expect.objectContaining({ code: 'UNSAFE_PATH' }),
    );
  });

  it('bounds oversized diff output without returning source content', async () => {
    const root = await createRepository();
    await writeRepositoryFile(root, 'src/large.ts', 'export const value = 1;\n');
    await commitAll(root);
    await writeRepositoryFile(
      root,
      'src/large.ts',
      `const privateValue = '${'x'.repeat(2_200_000)}';\n`,
    );
    const { createGitProvider } = await import('./git-provider.js');

    try {
      await createGitProvider().getWorktreeDiff(root);
      expect.unreachable('Expected an oversized diff to be rejected.');
    } catch (error) {
      expect(error).toEqual(expect.objectContaining({ code: 'DIFF_TOO_LARGE' }));
      expect(String(error)).not.toContain('privateValue');
    }
  });

  it('rejects the 501st included path before reading its content', async () => {
    const root = await createRepository();
    await mkdir(join(root, 'untracked'), { recursive: true });
    const existingPaths = Array.from({ length: 500 }, (_, index) => `untracked/${index}.ts`);
    await Promise.all(
      existingPaths.map((path) => writeFile(join(root, ...path.split('/')), '', 'utf8')),
    );
    const untrackedOutput = [...existingPaths, 'untracked/missing.ts']
      .map((path) => `${path}\0`)
      .join('');
    const runGit = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: root, stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: untrackedOutput, stderr: '' });
    const { createGitProvider } = await import('./git-provider.js');

    await expect(createGitProvider({ runGit }).getWorktreeDiff(root)).rejects.toEqual(
      expect.objectContaining({ code: 'DIFF_TOO_LARGE' }),
    );
  });

  it('returns a stable safe error when an untracked file disappears during inspection', async () => {
    const root = await createRepository();
    const runGit = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: root, stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'private-disappeared.ts\0',
        stderr: '',
      });
    const { createGitProvider } = await import('./git-provider.js');

    try {
      await createGitProvider({ runGit }).getWorktreeDiff(root);
      expect.unreachable('Expected the disappearing file to be rejected.');
    } catch (error) {
      expect(error).toEqual(expect.objectContaining({ code: 'UNSAFE_PATH' }));
      expect(String(error)).not.toContain('private-disappeared');
    }
  });

  it('marks added-line inspection truncated only after the 500-line cap', async () => {
    const root = await createRepository();
    await writeRepositoryFile(root, 'src/generated.ts', 'export const baseline = true;\n');
    await commitAll(root);
    const fiveHundredLines = Array.from(
      { length: 500 },
      (_, index) => `export const value${index} = ${index};`,
    );
    await writeRepositoryFile(root, 'src/generated.ts', `${fiveHundredLines.join('\n')}\n`);
    const { createGitProvider } = await import('./git-provider.js');

    const complete = await createGitProvider().getWorktreeDiff(root);
    expect(complete.files[0]).toEqual(expect.objectContaining({ contentTruncated: false }));

    await appendFile(join(root, 'src', 'generated.ts'), 'export const overflow = true;\n', 'utf8');
    const truncated = await createGitProvider().getWorktreeDiff(root);
    expect(truncated.files[0]).toEqual(expect.objectContaining({ contentTruncated: true }));
    expect(truncated.files[0]?.addedLines).toHaveLength(500);
  });
});
