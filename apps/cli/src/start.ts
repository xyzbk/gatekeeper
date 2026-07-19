import { fileURLToPath } from 'node:url';

import type { ToolAvailability } from '@gatekeeper/contracts';
import { createGitProvider, RepositoryInspectionError } from '@gatekeeper/git-adapter';
import {
  startGatekeeperService,
  type PersistentReviewContext,
  type RunningGatekeeperService,
  type StartGatekeeperServiceOptions,
} from '@gatekeeper/server';
import { SqliteProjectStoreError } from '@gatekeeper/store-sqlite';
import { execa } from 'execa';

import { runWorktreeReview } from './worktree-review.js';
import { runPullRequestReview } from './pull-request-review.js';
import { runCommitReview } from './commit-review.js';

export const GATEKEEPER_VERSION = '0.1.0';

interface ToolCommandResult {
  exitCode: number;
  stdout: string;
}

type RunToolCommand = (
  executable: 'gh' | 'git',
  arguments_: readonly string[],
) => Promise<ToolCommandResult>;

type StartService = (
  options: StartGatekeeperServiceOptions,
) => Promise<Pick<RunningGatekeeperService, 'baseUrl' | 'close'>>;

export interface StartCommandDependencies {
  dashboardRoot: string;
  inspectRepository: ReturnType<typeof createGitProvider>['inspectRepository'];
  inspectTool: (name: 'gh' | 'git') => Promise<ToolAvailability>;
  reviewWorktree: (
    repositoryPath: string,
    context: PersistentReviewContext,
  ) => ReturnType<typeof runWorktreeReview>;
  reviewPullRequest: (
    repositoryPath: string,
    pullRequestNumber: number,
    context: PersistentReviewContext,
  ) => ReturnType<typeof runPullRequestReview>;
  reviewCommit: (
    repositoryPath: string,
    sha: string,
    context: PersistentReviewContext,
  ) => ReturnType<typeof runCommitReview>;
  startService: StartService;
  waitUntilShutdown: () => Promise<void>;
  write: (message: string) => void;
}

export interface StartCommandOptions {
  deterministicOnly?: boolean;
}

async function runToolCommand(
  executable: 'gh' | 'git',
  arguments_: readonly string[],
): Promise<ToolCommandResult> {
  const result = await execa(executable, arguments_, {
    maxBuffer: 1_024 * 1_024,
    reject: false,
    shell: false,
    stdin: 'ignore',
    timeout: 30_000,
  });

  return {
    exitCode: result.exitCode ?? -1,
    stdout: result.stdout,
  };
}

export async function inspectLocalTool(
  name: 'gh' | 'git',
  runCommand: RunToolCommand = runToolCommand,
): Promise<ToolAvailability> {
  try {
    const result = await runCommand(name, ['--version']);
    const version = result.stdout.split(/\r?\n/, 1)[0]?.trim();

    return result.exitCode === 0 && version !== undefined && version.length > 0
      ? { available: true, version }
      : { available: false, version: null };
  } catch {
    return { available: false, version: null };
  }
}

export function waitForShutdownSignal(): Promise<void> {
  return new Promise((resolve) => {
    const signals = ['SIGINT', 'SIGTERM'] as const;
    const handleShutdown = () => {
      for (const signal of signals) {
        process.removeListener(signal, handleShutdown);
      }
      resolve();
    };

    for (const signal of signals) {
      process.once(signal, handleShutdown);
    }
  });
}

const gitProvider = createGitProvider();

const defaultDependencies: StartCommandDependencies = {
  dashboardRoot: fileURLToPath(new URL('../../dashboard/dist', import.meta.url)),
  inspectRepository: (repositoryPath) => gitProvider.inspectRepository(repositoryPath),
  inspectTool: inspectLocalTool,
  reviewWorktree: (repositoryPath, context) =>
    runWorktreeReview(repositoryPath, undefined, context),
  reviewPullRequest: (repositoryPath, number, context) =>
    runPullRequestReview(repositoryPath, number, context),
  reviewCommit: (repositoryPath, sha, context) =>
    runCommitReview(repositoryPath, sha, undefined, context),
  startService: startGatekeeperService,
  waitUntilShutdown: waitForShutdownSignal,
  write: (message) => {
    process.stdout.write(message);
  },
};

export async function runStartCommand(
  repositoryPath: string,
  dependencies: StartCommandDependencies = defaultDependencies,
  options: StartCommandOptions = {},
): Promise<void> {
  const repository = await dependencies.inspectRepository(repositoryPath);
  const [git, gh] = await Promise.all([
    dependencies.inspectTool('git'),
    dependencies.inspectTool('gh'),
  ]);
  const service = await dependencies.startService({
    dashboardRoot: dependencies.dashboardRoot,
    ...(options.deterministicOnly === true ? { deterministicOnly: true } : {}),
    repository,
    reviewPullRequest: (number, context) =>
      dependencies.reviewPullRequest(repository.root, number, context),
    reviewCommit: (sha, context) => dependencies.reviewCommit(repository.root, sha, context),
    reviewWorktree: (context) => dependencies.reviewWorktree(repository.root, context),
    tools: { git, gh },
    version: GATEKEEPER_VERSION,
  });

  dependencies.write('Gatekeeper is running.\n');
  dependencies.write(`Repository: ${repository.root}\n`);
  dependencies.write(`Dashboard: ${service.baseUrl}\n`);
  dependencies.write('Press Ctrl+C to stop.\n');

  try {
    await dependencies.waitUntilShutdown();
  } finally {
    await service.close();
  }
}

export function formatStartError(error: unknown): string {
  if (error instanceof RepositoryInspectionError) {
    return error.message;
  }

  if (error instanceof SqliteProjectStoreError && error.code === 'CORRUPT_DATA') {
    return 'Project Memory needs local repair. Run gatekeeper doctor --repair, then start again.';
  }

  return 'Gatekeeper could not start the local service. Build the workspace and try again.';
}
