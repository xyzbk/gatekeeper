import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export interface GitCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  failureReason?: 'max_buffer' | 'timeout';
}

export type RunGit = (arguments_: readonly string[]) => Promise<GitCommandResult>;

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

export function isPathWithin(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);

  return (
    pathFromRoot === '' ||
    (pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot))
  );
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

export async function resolveRepositoryRoot(
  repositoryPath: string,
  runGit: RunGit,
): Promise<string> {
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

  return root;
}
