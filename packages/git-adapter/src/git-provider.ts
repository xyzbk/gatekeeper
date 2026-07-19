import { repositorySnapshotSchema, type RepositorySnapshot } from '@gatekeeper/contracts';
import { execa } from 'execa';

import {
  RepositoryInspectionError,
  resolveRepositoryRoot,
  type GitCommandResult,
  type RunGit,
} from './repository-path.js';
import {
  listBranchCommits,
  listCommits,
  listLocalBranches,
  listTrackedFiles,
  readFileAtRef,
  type LocalCommitPageInput,
} from './project-memory-source.js';
import {
  extractCommitDiff,
  extractWorktreeDiff,
  type WorktreeDiffOptions,
} from './worktree-diff.js';

interface GitProviderOptions {
  runGit?: RunGit;
}

export interface GitProvider {
  getCommitDiff(
    repositoryPath: string,
    sha: string,
    options?: WorktreeDiffOptions,
  ): ReturnType<typeof extractCommitDiff>;
  getWorktreeDiff(
    repositoryPath: string,
    options?: WorktreeDiffOptions,
  ): ReturnType<typeof extractWorktreeDiff>;
  inspectRepository(repositoryPath: string): Promise<RepositorySnapshot>;
  listBranchCommits(
    repositoryPath: string,
    input: LocalCommitPageInput,
  ): ReturnType<typeof listBranchCommits>;
  listCommits(repositoryPath: string, limit: number): ReturnType<typeof listCommits>;
  listLocalBranches(repositoryPath: string): ReturnType<typeof listLocalBranches>;
  listTrackedFiles(repositoryPath: string): ReturnType<typeof listTrackedFiles>;
  readFileAtRef(
    repositoryPath: string,
    relativePath: string,
    ref: string,
  ): ReturnType<typeof readFileAtRef>;
}

async function runGitCommand(arguments_: readonly string[]): Promise<GitCommandResult> {
  const result = await execa('git', arguments_, {
    maxBuffer: 2 * 1_024 * 1_024,
    reject: false,
    stdin: 'ignore',
    timeout: 30_000,
  });

  return {
    exitCode: result.exitCode ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
    ...(result.isMaxBuffer ? { failureReason: 'max_buffer' as const } : {}),
    ...(result.timedOut ? { failureReason: 'timeout' as const } : {}),
  };
}

function requireSuccessfulCommand(result: GitCommandResult, message: string): GitCommandResult {
  if (result.exitCode !== 0) {
    throw new RepositoryInspectionError('GIT_COMMAND_FAILED', message);
  }

  return result;
}

async function inspectRepository(
  repositoryPath: string,
  runGit: RunGit,
): Promise<RepositorySnapshot> {
  const root = await resolveRepositoryRoot(repositoryPath, runGit);

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
    getCommitDiff: async (repositoryPath, sha, diffOptions) =>
      extractCommitDiff(repositoryPath, sha, runGit, diffOptions),
    getWorktreeDiff: async (repositoryPath, diffOptions) =>
      extractWorktreeDiff(repositoryPath, runGit, diffOptions),
    inspectRepository: async (repositoryPath) => inspectRepository(repositoryPath, runGit),
    listBranchCommits: async (repositoryPath, input) =>
      listBranchCommits(repositoryPath, input, runGit),
    listCommits: async (repositoryPath, limit) => listCommits(repositoryPath, limit, runGit),
    listLocalBranches: async (repositoryPath) => listLocalBranches(repositoryPath, runGit),
    listTrackedFiles: async (repositoryPath) => listTrackedFiles(repositoryPath, runGit),
    readFileAtRef: async (repositoryPath, relativePath, ref) =>
      readFileAtRef(repositoryPath, relativePath, ref, runGit),
  };
}

export { RepositoryInspectionError } from './repository-path.js';
