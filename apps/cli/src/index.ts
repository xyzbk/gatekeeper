#!/usr/bin/env node

import { Command, Option } from 'commander';

import { normalizeArgv } from './argv.js';
import { runDoctor } from './doctor.js';
import { formatStartError, GATEKEEPER_VERSION, runStartCommand } from './start.js';
import {
  classifyReviewCommandError,
  formatWorktreeReview,
  runWorktreeReview,
  validateRepositoryPolicy,
  type OutputFormat,
} from './worktree-review.js';

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
  .addOption(
    new Option('--format <format>', 'output format').choices(['human', 'json']).default('human'),
  )
  .action(async (path: string, { format }: { format: OutputFormat }) => {
    try {
      const review = await runWorktreeReview(path);
      process.stdout.write(formatWorktreeReview(review, format));
    } catch (error) {
      const failure = classifyReviewCommandError(error);
      process.stderr.write(`Error: ${failure.message}\n`);
      process.exitCode = failure.exitCode;
    }
  });

program
  .command('doctor')
  .description('Check the local Gatekeeper toolchain without authenticating.')
  .addOption(
    new Option('--format <format>', 'output format').choices(['human', 'json']).default('human'),
  )
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
