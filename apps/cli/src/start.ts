import { fileURLToPath } from 'node:url';

import type { ToolAvailability } from '@gatekeeper/contracts';
import { createGitProvider, RepositoryInspectionError } from '@gatekeeper/git-adapter';
import {
  startGatekeeperService,
  type RunningGatekeeperService,
  type StartGatekeeperServiceOptions,
} from '@gatekeeper/server';
import { execa } from 'execa';

import { runWorktreeReview } from './worktree-review.js';

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
  reviewWorktree: typeof runWorktreeReview;
  startService: StartService;
  waitUntilShutdown: () => Promise<void>;
  write: (message: string) => void;
}

async function runToolCommand(
  executable: 'gh' | 'git',
  arguments_: readonly string[],
): Promise<ToolCommandResult> {
  const result = await execa(executable, arguments_, {
    reject: false,
    stdin: 'ignore',
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
  reviewWorktree: runWorktreeReview,
  startService: startGatekeeperService,
  waitUntilShutdown: waitForShutdownSignal,
  write: (message) => {
    process.stdout.write(message);
  },
};

export async function runStartCommand(
  repositoryPath: string,
  dependencies: StartCommandDependencies = defaultDependencies,
): Promise<void> {
  const repository = await dependencies.inspectRepository(repositoryPath);
  const [git, gh] = await Promise.all([
    dependencies.inspectTool('git'),
    dependencies.inspectTool('gh'),
  ]);
  const service = await dependencies.startService({
    dashboardRoot: dependencies.dashboardRoot,
    repository,
    reviewWorktree: () => dependencies.reviewWorktree(repository.root),
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

  return 'Gatekeeper could not start the local service. Build the workspace and try again.';
}
