import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

import { repositorySnapshotSchema, type RepositorySnapshot } from '@gatekeeper/contracts';
import { execa } from 'execa';

interface GitCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

type RunGit = (arguments_: readonly string[]) => Promise<GitCommandResult>;

interface GitProviderOptions {
  runGit?: RunGit;
}

export interface GitProvider {
  inspectRepository(repositoryPath: string): Promise<RepositorySnapshot>;
}

export type RepositoryInspectionErrorCode =
  'INVALID_REPOSITORY_PATH' | 'INVALID_REPOSITORY_ROOT' | 'NOT_A_REPOSITORY' | 'GIT_COMMAND_FAILED';

export class RepositoryInspectionError extends Error {
  public readonly code: RepositoryInspectionErrorCode;

  public constructor(code: RepositoryInspectionErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RepositoryInspectionError';
    this.code = code;
  }
}

async function runGitCommand(arguments_: readonly string[]): Promise<GitCommandResult> {
  const result = await execa('git', arguments_, {
    reject: false,
    stdin: 'ignore',
  });

  return {
    exitCode: result.exitCode ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function isPathWithin(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);

  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot));
}

function requireSuccessfulCommand(result: GitCommandResult, message: string): GitCommandResult {
  if (result.exitCode !== 0) {
    throw new RepositoryInspectionError('GIT_COMMAND_FAILED', message);
  }

  return result;
}

async function resolveRequestedDirectory(repositoryPath: string): Promise<string> {
  try {
    const requestedPath = await realpath(resolve(repositoryPath));
    const requestedPathStat = await stat(requestedPath);

    if (!requestedPathStat.isDirectory()) {
      throw new RepositoryInspectionError(
        'INVALID_REPOSITORY_PATH',
        'The requested repository path must be a directory.',
      );
    }

    return requestedPath;
  } catch (error) {
    if (error instanceof RepositoryInspectionError) {
      throw error;
    }

    throw new RepositoryInspectionError(
      'INVALID_REPOSITORY_PATH',
      'The requested repository path is not accessible.',
      { cause: error },
    );
  }
}

async function inspectRepository(
  repositoryPath: string,
  runGit: RunGit,
): Promise<RepositorySnapshot> {
  const requestedPath = await resolveRequestedDirectory(repositoryPath);
  const rootResult = await runGit(['-C', requestedPath, 'rev-parse', '--show-toplevel']);

  if (rootResult.exitCode !== 0) {
    throw new RepositoryInspectionError(
      'NOT_A_REPOSITORY',
      'Git could not resolve the repository root.',
    );
  }

  let root: string;
  try {
    root = await realpath(resolve(rootResult.stdout.trim()));
  } catch (error) {
    throw new RepositoryInspectionError(
      'INVALID_REPOSITORY_ROOT',
      'Git returned an inaccessible repository root.',
      { cause: error },
    );
  }

  if (!isPathWithin(root, requestedPath)) {
    throw new RepositoryInspectionError(
      'INVALID_REPOSITORY_ROOT',
      'Git returned a repository root unrelated to the requested path.',
    );
  }

  const [branchResult, headResult, statusResult, remoteResult] = await Promise.all([
    runGit(['-C', root, 'symbolic-ref', '--quiet', '--short', 'HEAD']),
    runGit(['-C', root, 'rev-parse', 'HEAD']),
    runGit(['-C', root, 'status', '--porcelain=v1', '--untracked-files=normal']),
    runGit(['-C', root, 'remote', 'get-url', 'origin']),
  ]);

  requireSuccessfulCommand(headResult, 'Git could not read HEAD.');
  requireSuccessfulCommand(statusResult, 'Git could not read worktree status.');

  if (branchResult.exitCode !== 0 && branchResult.exitCode !== 1) {
    throw new RepositoryInspectionError('GIT_COMMAND_FAILED', 'Git could not read the branch.');
  }

  if (remoteResult.exitCode !== 0 && remoteResult.exitCode !== 1 && remoteResult.exitCode !== 2) {
    throw new RepositoryInspectionError(
      'GIT_COMMAND_FAILED',
      'Git could not read the origin remote.',
    );
  }

  return repositorySnapshotSchema.parse({
    root,
    branch: branchResult.exitCode === 0 ? branchResult.stdout.trim() : null,
    head: headResult.stdout.trim(),
    dirty: statusResult.stdout.length > 0,
    remote: remoteResult.exitCode === 0 ? remoteResult.stdout.trim() : null,
  });
}

export function createGitProvider(options: GitProviderOptions = {}): GitProvider {
  const runGit = options.runGit ?? runGitCommand;

  return {
    inspectRepository: async (repositoryPath) => inspectRepository(repositoryPath, runGit),
  };
}
