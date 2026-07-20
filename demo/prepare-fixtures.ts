import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, relative } from 'node:path';

const execFileAsync = promisify(execFile);
const fixturesRoot = fileURLToPath(new URL('./fixtures', import.meta.url));
const fixtureNames = ['clean', 'missing-test', 'protected-path', 'history', 'replay'] as const;
const policy = `version: 1
tests:
  relationships:
    - id: source-needs-tests
      source:
        - src/**
      tests:
        - tests/**
      enforcement: required
protectedPaths:
  - id: protected-rules
    paths:
      - internal/protected/**
    enforcement: hard
    message: This path requires the authorized policy workflow.
`;

function assertFixtureTarget(target: string): void {
  const pathFromRoot = relative(fixturesRoot, target);
  if (
    pathFromRoot === '' ||
    pathFromRoot.startsWith('..') ||
    isAbsolute(pathFromRoot) ||
    !fixtureNames.includes(pathFromRoot as (typeof fixtureNames)[number])
  ) {
    throw new Error('Refusing to recreate a path outside the fixed fixture set.');
  }
}

async function runGit(root: string, arguments_: readonly string[]): Promise<void> {
  await execFileAsync('git', arguments_, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1_024 * 1_024,
    timeout: 30_000,
    windowsHide: true,
  });
}

async function writeFixtureFile(root: string, path: string, content: string): Promise<void> {
  const target = join(root, ...path.split('/'));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

async function createBaseline(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  await runGit(root, ['init', '--initial-branch=master']);
  await runGit(root, ['config', 'user.email', 'gatekeeper@example.invalid']);
  await runGit(root, ['config', 'user.name', 'Gatekeeper Demo']);
  await runGit(root, ['config', 'core.autocrlf', 'false']);
  await writeFixtureFile(root, '.gatekeeper/policies.yaml', policy);
  await writeFixtureFile(root, 'src/app.ts', 'export const total = (value: number) => value;\n');
  await writeFixtureFile(root, 'tests/app.test.ts', 'export const baselineTest = true;\n');
  await writeFixtureFile(root, 'internal/protected/rules.ts', 'export const locked = true;\n');
  await runGit(root, ['add', '--all']);
  await runGit(root, ['commit', '--message', 'fixture baseline']);
}

async function prepareFixture(name: (typeof fixtureNames)[number]): Promise<void> {
  const root = join(fixturesRoot, name);
  assertFixtureTarget(root);
  await rm(root, { force: true, recursive: true });
  await createBaseline(root);

  if (name === 'replay') {
    await writeFixtureFile(
      root,
      'docs/cache.md',
      '# Cache design\n\nThe first proposal required Redis for every local review.\n',
    );
    await writeFixtureFile(root, 'src/cache.ts', "export const cache = 'redis-required';\n");
    await writeFixtureFile(
      root,
      'tests/cache.test.ts',
      "import { cache } from '../src/cache.js';\n\nexpect(cache).toBe('redis-required');\n",
    );
    await runGit(root, ['add', '--all']);
    await runGit(root, ['commit', '--message', 'propose required redis cache']);

    await writeFixtureFile(
      root,
      'docs/adr/0003-no-required-redis.md',
      [
        '# No required Redis cache',
        '',
        'Status: active',
        '',
        'Redis remains optional. SQLite remains the durable local store.',
        '',
      ].join('\n'),
    );
    await writeFixtureFile(
      root,
      'docs/cache.md',
      '# Cache design\n\nRedis is optional; SQLite remains the durable local store.\n',
    );
    await writeFixtureFile(root, 'src/cache.ts', "export const cache = 'sqlite';\n");
    await writeFixtureFile(
      root,
      'tests/cache.test.ts',
      "import { cache } from '../src/cache.js';\n\nexpect(cache).toBe('sqlite');\n",
    );
    await runGit(root, ['add', '--all']);
    await runGit(root, ['commit', '--message', 'keep redis optional with sqlite']);

    await writeFixtureFile(root, 'src/cache.ts', "export const cache = 'redis-required';\n");
    await writeFixtureFile(
      root,
      'tests/cache.test.ts',
      "import { cache } from '../src/cache.js';\n\nexpect(cache).toBe('redis-required');\n",
    );
  } else if (name === 'history') {
    await writeFixtureFile(root, '.gatekeeperignore', 'docs/ignored.md\n');
    await writeFixtureFile(root, '.env', 'REDIS_PASSWORD=fixture-only-secret\n');
    await writeFixtureFile(
      root,
      'docs/cache.md',
      '# Cache design\n\nThe first proposal used a required Redis cache for every local review.\n',
    );
    await writeFixtureFile(
      root,
      'docs/ignored.md',
      '# Ignored design\n\nThis selected document must not enter Project Memory.\n',
    );
    await runGit(root, ['add', '--force', '.env']);
    await runGit(root, ['add', '--all']);
    await runGit(root, ['commit', '--message', 'propose required redis cache']);

    await writeFixtureFile(
      root,
      'docs/adr/0003-no-required-redis.md',
      [
        '# No required Redis cache',
        '',
        'Status: active',
        '',
        'Gatekeeper stays local-first. Redis is not required for cache or queue behavior.',
        '',
      ].join('\n'),
    );
    await writeFixtureFile(
      root,
      'docs/cache.md',
      '# Cache design\n\nThe required Redis cache was reverted; SQLite remains the durable local store.\n',
    );
    await runGit(root, ['add', '--all']);
    await runGit(root, ['commit', '--message', 'revert required redis cache']);

    await writeFixtureFile(
      root,
      'src/app.ts',
      'export const total = (value: number) => value + 1;\n',
    );
    await writeFixtureFile(root, 'tests/app.test.ts', 'export const updatedTest = true;\n');
  } else if (name === 'clean') {
    await writeFixtureFile(
      root,
      'src/app.ts',
      'export const total = (value: number) => value + 1;\n',
    );
    await writeFixtureFile(root, 'tests/app.test.ts', 'export const updatedTest = true;\n');
  } else if (name === 'missing-test') {
    await writeFixtureFile(
      root,
      'src/app.ts',
      'export const total = (value: number) => value + 1;\n',
    );
  } else {
    await writeFixtureFile(root, 'internal/protected/rules.ts', 'export const locked = false;\n');
  }
}

await mkdir(fixturesRoot, { recursive: true });
for (const name of fixtureNames) {
  await prepareFixture(name);
}

process.stdout.write(`Prepared ${fixtureNames.length} disposable Gatekeeper fixtures.\n`);
