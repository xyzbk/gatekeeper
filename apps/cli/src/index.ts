#!/usr/bin/env node

import { Command, Option } from 'commander';

import { normalizeArgv } from './argv.js';
import { runDoctor } from './doctor.js';
import {
  classifyProjectMemoryCommandError,
  createProjectMemoryCommands,
  formatIndexResult,
  formatMemorySearch,
  formatRepositoryRecord,
  formatRepositoryStatus,
} from './project-memory.js';
import { formatStartError, GATEKEEPER_VERSION, runStartCommand } from './start.js';
import {
  classifyReviewCommandError,
  formatWorktreeReview,
  validateRepositoryPolicy,
  type OutputFormat,
} from './worktree-review.js';

const projectMemory = createProjectMemoryCommands();

function outputFormatOption(): Option {
  return new Option('--format <format>', 'output format')
    .choices(['human', 'json'])
    .default('human');
}

async function runProjectMemoryCommand<T>(
  action: () => Promise<T>,
  format: (value: T) => string,
): Promise<void> {
  try {
    process.stdout.write(format(await action()));
  } catch (error) {
    const failure = classifyProjectMemoryCommandError(error);
    process.stderr.write(`Error: ${failure.message}\n`);
    process.exitCode = failure.exitCode;
  }
}

const program = new Command()
  .name('gatekeeper')
  .description('Local-first repository intelligence for Codex.')
  .version(GATEKEEPER_VERSION)
  .showHelpAfterError();

program
  .command('start')
  .description('Start Gatekeeper for one local Git repository.')
  .argument('[path]', 'repository path', '.')
  .action(async (path: string) => {
    try {
      await runStartCommand(path);
    } catch (error) {
      process.stderr.write(`Error: ${formatStartError(error)}\n`);
      process.exitCode = 1;
    }
  });

const policyCommand = program.command('policy').description('Validate repository policy.');

policyCommand
  .command('validate')
  .description('Validate .gatekeeper/policies.yaml for one Git repository.')
  .argument('[path]', 'repository path', '.')
  .action(async (path: string) => {
    try {
      const loaded = await validateRepositoryPolicy(path);
      process.stdout.write(`Policy valid: ${loaded.path}\n`);
    } catch (error) {
      const failure = classifyReviewCommandError(error);
      process.stderr.write(`Error: ${failure.message}\n`);
      process.exitCode = failure.exitCode;
    }
  });

const reviewCommand = program.command('review').description('Review repository changes.');

reviewCommand
  .command('worktree')
  .description('Review staged, unstaged, and untracked worktree changes.')
  .argument('[path]', 'repository path', '.')
  .addOption(outputFormatOption())
  .action(async (path: string, { format }: { format: OutputFormat }) => {
    await runProjectMemoryCommand(
      () => projectMemory.reviewWorktree(path),
      (review) => formatWorktreeReview(review, format),
    );
  });

reviewCommand
  .command('show')
  .description('Show one persisted review by ID.')
  .argument('<review-id>', 'persisted review ID')
  .addOption(outputFormatOption())
  .action(async (reviewId: string, { format }: { format: OutputFormat }) => {
    await runProjectMemoryCommand(
      () => projectMemory.showReview(reviewId),
      (review) => formatWorktreeReview(review, format),
    );
  });

const repositoryCommand = program.command('repo').description('Manage local repository memory.');

repositoryCommand
  .command('init')
  .description('Register one local Git repository in Project Memory.')
  .argument('[path]', 'repository path', '.')
  .addOption(outputFormatOption())
  .action(async (path: string, { format }: { format: OutputFormat }) => {
    await runProjectMemoryCommand(
      () => projectMemory.initialize(path),
      (repository) => formatRepositoryRecord(repository, format),
    );
  });

repositoryCommand
  .command('status')
  .description('Show Project Memory status for one local Git repository.')
  .argument('[path]', 'repository path', '.')
  .addOption(outputFormatOption())
  .action(async (path: string, { format }: { format: OutputFormat }) => {
    await runProjectMemoryCommand(
      () => projectMemory.status(path),
      (status) => formatRepositoryStatus(status, format),
    );
  });

program
  .command('index')
  .description('Incrementally index one initialized local Git repository.')
  .argument('[path]', 'repository path', '.')
  .addOption(outputFormatOption())
  .action(async (path: string, { format }: { format: OutputFormat }) => {
    await runProjectMemoryCommand(
      () => projectMemory.index(path),
      (result) => formatIndexResult(result, format),
    );
  });

const memoryCommand = program.command('memory').description('Search local Project Memory.');

memoryCommand
  .command('search')
  .description('Search indexed repository evidence.')
  .argument('<query>', 'exact or full-text query')
  .argument('[path]', 'repository path', '.')
  .option('--limit <count>', 'maximum results', (value: string) => Number.parseInt(value, 10))
  .addOption(outputFormatOption())
  .action(
    async (
      query: string,
      path: string,
      { format, limit }: { format: OutputFormat; limit?: number },
    ) => {
      await runProjectMemoryCommand(
        () => projectMemory.search(path, query, limit),
        (results) => formatMemorySearch(results, format),
      );
    },
  );

program
  .command('doctor')
  .description('Check the local Gatekeeper toolchain without authenticating.')
  .addOption(outputFormatOption())
  .action(async ({ format }: { format: 'human' | 'json' }) => {
    const result = await runDoctor();

    if (format === 'json') {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      for (const check of result.checks) {
        process.stdout.write(
          `${check.status.toUpperCase().padEnd(4)} ${check.name}: ${check.message}\n`,
        );
      }
    }

    if (result.status === 'failed') {
      process.exitCode = 3;
    }
  });

await program.parseAsync(normalizeArgv(process.argv));
