import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

describe('Git repository inspection', () => {
  it('passes repository paths as one argument and never shell interpolates them', async () => {
    const requestedPath = await mkdtemp(join(tmpdir(), 'gatekeeper;echo-unsafe-'));
    const canonicalPath = await realpath(requestedPath);
    const runGit = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: canonicalPath, stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'master', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'a'.repeat(40), stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'https://github.com/xyzbk/gatekeeper.git',
        stderr: '',
      });
    const { createGitProvider } = await import('./git-provider.js');

    await createGitProvider({ runGit }).inspectRepository(requestedPath);

    expect(runGit).toHaveBeenNthCalledWith(1, [
      '-C',
      canonicalPath,
      'rev-parse',
      '--show-toplevel',
    ]);
    expect(runGit.mock.calls.flat(2)).not.toContain('shell');
  });

  it('rejects a discovered repository root unrelated to the requested path', async () => {
    const requestedPath = await mkdtemp(join(tmpdir(), 'gatekeeper-requested-'));
    const unrelatedPath = await mkdtemp(join(tmpdir(), 'gatekeeper-unrelated-'));
    const runGit = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: await realpath(unrelatedPath),
      stderr: '',
    });
    const { createGitProvider } = await import('./git-provider.js');

    await expect(createGitProvider({ runGit }).inspectRepository(requestedPath)).rejects.toEqual(
      expect.objectContaining({
        code: 'INVALID_REPOSITORY_ROOT',
      }),
    );
    expect(runGit).toHaveBeenCalledTimes(1);
  });

  it('maps detached HEAD and a missing origin to null', async () => {
    const requestedPath = await mkdtemp(join(tmpdir(), 'gatekeeper-detached-'));
    const canonicalPath = await realpath(requestedPath);
    const runGit = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: canonicalPath, stderr: '' })
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'b'.repeat(40), stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: ' M src/index.ts', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '' });
    const { createGitProvider } = await import('./git-provider.js');

    await expect(createGitProvider({ runGit }).inspectRepository(requestedPath)).resolves.toEqual({
      root: canonicalPath,
      branch: null,
      head: 'b'.repeat(40),
      dirty: true,
      remote: null,
    });
  });

  it('reports command failures without returning command output', async () => {
    const requestedPath = await mkdtemp(join(tmpdir(), 'gatekeeper-failure-'));
    const runGit = vi.fn().mockResolvedValue({
      exitCode: 128,
      stdout: 'private source content',
      stderr: 'secret path',
    });
    const { createGitProvider } = await import('./git-provider.js');

    await expect(createGitProvider({ runGit }).inspectRepository(requestedPath)).rejects.toThrow(
      'Git could not resolve the repository root.',
    );
  });
});
