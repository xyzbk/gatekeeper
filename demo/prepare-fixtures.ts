import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, relative } from 'node:path';

const execFileAsync = promisify(execFile);
const fixturesRoot = fileURLToPath(new URL('./fixtures', import.meta.url));
const fixtureNames = ['clean', 'missing-test', 'protected-path'] as const;
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

  if (name === 'clean') {
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
