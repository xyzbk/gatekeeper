import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { execa } from 'execa';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function runGit(root: string, arguments_: readonly string[]): Promise<string> {
  const result = await execa('git', arguments_, { cwd: root, stdin: 'ignore' });
  return result.stdout.trim();
}

async function writeRepositoryFile(root: string, path: string, content: string): Promise<void> {
  const target = join(root, ...path.split('/'));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

async function commitAll(root: string, message: string): Promise<string> {
  await runGit(root, ['add', '--all']);
  await runGit(root, ['commit', '--message', message]);
  return runGit(root, ['rev-parse', 'HEAD']);
}

async function createRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'gatekeeper-commit-diff-'));
  temporaryRoots.push(root);
  await runGit(root, ['init', '--initial-branch=master']);
  await runGit(root, ['config', 'user.email', 'gatekeeper@example.invalid']);
  await runGit(root, ['config', 'user.name', 'Gatekeeper Tests']);
  await runGit(root, ['config', 'core.autocrlf', 'false']);
  return root;
}

async function repositoryState(root: string): Promise<string[]> {
  return [
    await runGit(root, ['symbolic-ref', '--short', 'HEAD']),
    await runGit(root, ['rev-parse', 'HEAD']),
    await runGit(root, ['write-tree']),
    await runGit(root, ['status', '--porcelain=v1']),
  ];
}

describe('historical commit change extraction', () => {
  it('extracts a selected commit against its first parent without changing the repository', async () => {
    const root = await createRepository();
    await writeRepositoryFile(root, 'src/app.ts', 'export const value = 1;\n');
    const base = await commitAll(root, 'create app');
    await writeRepositoryFile(root, 'src/app.ts', 'export const value = 2;\n');
    const head = await commitAll(root, 'update app');
    const before = await repositoryState(root);
    const { createGitProvider } = await import('./git-provider.js');

    const changeSet = await createGitProvider().getCommitDiff(root, head);

    expect(changeSet.target).toEqual({
      kind: 'commit_range',
      display: `Commit ${head.slice(0, 12)}`,
      base,
      head,
    });
    expect(changeSet.files).toEqual([
      {
        path: 'src/app.ts',
        status: 'modified',
        additions: 1,
        deletions: 1,
        binary: false,
        contentTruncated: false,
        addedLines: ['export const value = 2;'],
      },
    ]);
    await expect(repositoryState(root)).resolves.toEqual(before);
  });

  it('rejects malformed commit IDs before running Git', async () => {
    const { createGitProvider } = await import('./git-provider.js');
    const runGit = () => {
      throw new Error('Git must not run for malformed input.');
    };

    await expect(createGitProvider({ runGit }).getCommitDiff('.', '--help')).rejects.toEqual(
      expect.objectContaining({ code: 'GIT_COMMAND_FAILED' }),
    );
  });

  it('compares a root commit with the empty tree', async () => {
    const root = await createRepository();
    await writeRepositoryFile(root, 'README.md', '# Gatekeeper\n');
    const head = await commitAll(root, 'create repository');
    const { createGitProvider } = await import('./git-provider.js');
    const before = await repositoryState(root);

    const changeSet = await createGitProvider().getCommitDiff(root, head);

    expect(changeSet.target).toEqual({
      kind: 'commit_range',
      display: `Commit ${head.slice(0, 12)}`,
      base: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
      head,
    });
    expect(changeSet.files).toContainEqual(
      expect.objectContaining({ path: 'README.md', status: 'added', additions: 1 }),
    );
    await expect(repositoryState(root)).resolves.toEqual(before);
  });

  it('keeps rename, binary, deletion, and current ignore handling bounded', async () => {
    const root = await createRepository();
    await writeRepositoryFile(root, '.gatekeeperignore', 'private/**\n');
    await writeRepositoryFile(root, 'src/old.ts', 'export const value = 1;\n');
    await writeRepositoryFile(root, 'src/remove.ts', 'export const remove = true;\n');
    await writeRepositoryFile(root, 'assets/data.bin', String.fromCharCode(0, 1, 2));
    await commitAll(root, 'create files');
    await runGit(root, ['mv', 'src/old.ts', 'src/new.ts']);
    await writeRepositoryFile(root, 'assets/data.bin', String.fromCharCode(0, 9, 2));
    await writeRepositoryFile(root, 'private/secret.ts', 'export const hidden = true;\n');
    await runGit(root, ['rm', '--', 'src/remove.ts']);
    const head = await commitAll(root, 'change files');
    const { createGitProvider } = await import('./git-provider.js');
    const before = await repositoryState(root);

    const files = (await createGitProvider().getCommitDiff(root, head)).files;

    expect(files).toContainEqual(
      expect.objectContaining({
        path: 'src/new.ts',
        previousPath: 'src/old.ts',
        status: 'renamed',
      }),
    );
    expect(files).toContainEqual(
      expect.objectContaining({ path: 'assets/data.bin', status: 'modified', binary: true }),
    );
    expect(files).toContainEqual(
      expect.objectContaining({ path: 'src/remove.ts', status: 'deleted' }),
    );
    expect(files.map(({ path }) => path)).not.toContain('private/secret.ts');
    await expect(repositoryState(root)).resolves.toEqual(before);
  });

  it('rejects an object that is not a commit without leaking Git output', async () => {
    const root = await createRepository();
    await writeRepositoryFile(root, 'README.md', '# Gatekeeper\n');
    await commitAll(root, 'create repository');
    const tree = await runGit(root, ['rev-parse', 'HEAD^{tree}']);
    const { createGitProvider } = await import('./git-provider.js');
    const before = await repositoryState(root);

    await expect(createGitProvider().getCommitDiff(root, tree)).rejects.toEqual(
      expect.objectContaining({
        code: 'GIT_COMMAND_FAILED',
        message: 'Git could not resolve the selected commit.',
      }),
    );
    await expect(repositoryState(root)).resolves.toEqual(before);
  });

  it('uses the first parent when the selected commit is a merge', async () => {
    const root = await createRepository();
    await writeRepositoryFile(root, 'README.md', '# Gatekeeper\n');
    await commitAll(root, 'create repository');
    await runGit(root, ['switch', '-c', 'feature']);
    await writeRepositoryFile(root, 'src/feature.ts', 'export const feature = true;\n');
    await commitAll(root, 'add feature');
    await runGit(root, ['switch', 'master']);
    await writeRepositoryFile(root, 'src/master.ts', 'export const master = true;\n');
    await commitAll(root, 'add master change');
    const firstParent = await runGit(root, ['rev-parse', 'HEAD']);
    await runGit(root, ['merge', '--no-ff', 'feature', '--message', 'merge feature']);
    const head = await runGit(root, ['rev-parse', 'HEAD']);
    const { createGitProvider } = await import('./git-provider.js');
    const before = await repositoryState(root);

    const changeSet = await createGitProvider().getCommitDiff(root, head);

    expect(changeSet.target).toMatchObject({ base: firstParent, head });
    expect(changeSet.files.map(({ path }) => path)).toEqual(['src/feature.ts']);
    await expect(repositoryState(root)).resolves.toEqual(before);
  });
});
