#!/usr/bin/env node

import { Command, Option } from 'commander';

import { normalizeArgv } from './argv.js';
import { runDoctor } from './doctor.js';

const program = new Command()
  .name('gatekeeper')
  .description('Local-first repository intelligence for Codex.')
  .version('0.1.0')
  .showHelpAfterError();

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
