#!/usr/bin/env node

import { Command, Option } from 'commander';

import { normalizeArgv } from './argv.js';
import { runDoctor } from './doctor.js';
import { formatStartError, GATEKEEPER_VERSION, runStartCommand } from './start.js';

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
