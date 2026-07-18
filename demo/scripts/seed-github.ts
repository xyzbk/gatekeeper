import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { loadGhostChangeFixture, type GhostChangeFixture } from '../ghost-change-fixture.js';
import { normalizeGitHubRemote } from '../../packages/github-gh/src/index.js';

const execFileAsync = promisify(execFile);
const MARKER = /<!-- gatekeeper-demo:ghost-change:(issue|pull_request):(\d+) -->/u;

export interface SeedGhResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type RunSeedGh = (arguments_: readonly string[]) => Promise<SeedGhResult>;

interface SeedDependencies {
  runGh?: RunSeedGh;
  write?: (line: string) => void;
}

interface SeedOperation {
  kind: 'issue' | 'pull_request';
  logicalNumber: number;
  title: string;
  body: string;
  marker: string;
  createdAt: string;
  state: 'closed' | 'open';
  base?: string;
  head?: string;
}

interface DiscoveredSeed {
  actualNumber: number;
  kind: SeedOperation['kind'];
  state: 'closed' | 'open';
}

export interface SeedOutcome {
  mode: 'apply' | 'dry-run';
  target: string;
  planned: number;
  applied: number;
  skipped: number;
}

async function runGhCommand(arguments_: readonly string[]): Promise<SeedGhResult> {
  try {
    const result = await execFileAsync('gh', [...arguments_], {
      encoding: 'utf8',
      maxBuffer: 2 * 1_024 * 1_024,
      timeout: 30_000,
      windowsHide: true,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch {
    return { exitCode: 1, stdout: '', stderr: '' };
  }
}

function parseArguments(arguments_: readonly string[]): {
  mode: SeedOutcome['mode'];
  target: string;
} {
  let target: string | undefined;
  let apply = false;
  let dryRun = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--repo' && target === undefined) {
      target = arguments_[index + 1];
      index += 1;
    } else if (argument === '--apply' && !apply) {
      apply = true;
    } else if (argument === '--dry-run' && !dryRun) {
      dryRun = true;
    } else {
      throw new TypeError('Use only --repo owner/repository with one optional mode flag.');
    }
  }

  if (target === undefined || target.startsWith('-') || (apply && dryRun)) {
    throw new TypeError('Provide exactly one repository and one unambiguous mode.');
  }
  const remote = normalizeGitHubRemote(`https://github.com/${target}`);
  if (remote.host !== 'github.com' || remote.nameWithOwner !== target.toLowerCase()) {
    throw new TypeError('Repository must be exactly one GitHub owner/repository.');
  }
  return { mode: apply ? 'apply' : 'dry-run', target: remote.nameWithOwner };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function seedOperation(
  value: unknown,
  expectedKind: SeedOperation['kind'],
): SeedOperation | undefined {
  const item = record(value);
  if (item === undefined) {
    return undefined;
  }
  const title = item['title'];
  const body = item['body'];
  const createdAt = item['created_at'];
  const state = item['state'];
  if (
    typeof title !== 'string' ||
    typeof body !== 'string' ||
    typeof createdAt !== 'string' ||
    (state !== 'closed' && state !== 'open')
  ) {
    return undefined;
  }
  const marker = MARKER.exec(body);
  if (marker?.[1] !== expectedKind || marker[2] === undefined) {
    return undefined;
  }
  const logicalNumber = Number(marker[2]);
  if (!Number.isSafeInteger(logicalNumber) || logicalNumber <= 0) {
    return undefined;
  }

  if (expectedKind === 'pull_request') {
    const base = record(item['base'])?.['ref'];
    const head = record(item['head'])?.['ref'];
    if (typeof base !== 'string' || typeof head !== 'string') {
      throw new TypeError(`Pull-request seed ${logicalNumber} has no fixed branch refs.`);
    }
    return {
      kind: expectedKind,
      logicalNumber,
      title,
      body,
      marker: marker[0],
      createdAt,
      state,
      base,
      head,
    };
  }
  return {
    kind: expectedKind,
    logicalNumber,
    title,
    body,
    marker: marker[0],
    createdAt,
    state,
  };
}

function createPlan(fixture: GhostChangeFixture): SeedOperation[] {
  const issues = fixture.github.issues.flatMap((value) => {
    const item = record(value);
    return item?.['pull_request'] === undefined ? [seedOperation(value, 'issue')] : [];
  });
  const pulls = fixture.github.pullRequests.map((value) => seedOperation(value, 'pull_request'));
  const operations = [...issues, ...pulls]
    .filter((operation): operation is SeedOperation => operation !== undefined)
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.logicalNumber - right.logicalNumber,
    );
  if (operations.length !== 6 || new Set(operations.map(({ marker }) => marker)).size !== 6) {
    throw new TypeError('Ghost Change seed operations are incomplete or duplicated.');
  }
  return operations;
}

async function executeJson(runGh: RunSeedGh, arguments_: readonly string[]): Promise<unknown> {
  const response = await runGh(arguments_);
  if (response.exitCode !== 0 || Buffer.byteLength(response.stdout, 'utf8') > 2 * 1_024 * 1_024) {
    throw new Error('GitHub could not safely complete the seed request.');
  }
  try {
    return JSON.parse(response.stdout) as unknown;
  } catch {
    throw new Error('GitHub returned invalid seed metadata.');
  }
}

async function discover(runGh: RunSeedGh, target: string): Promise<Map<number, DiscoveredSeed>> {
  const items = await executeJson(runGh, [
    'api',
    '--method',
    'GET',
    `repos/${target}/issues?state=all&per_page=100`,
  ]);
  if (!Array.isArray(items) || items.length === 100) {
    throw new Error('The demo repository history is invalid or exceeds the safe discovery bound.');
  }
  const found = new Map<number, DiscoveredSeed>();
  for (const value of items) {
    const item = record(value);
    const body = item?.['body'];
    const actualNumber = item?.['number'];
    const state = item?.['state'];
    if (
      typeof body !== 'string' ||
      !Number.isSafeInteger(actualNumber) ||
      (state !== 'closed' && state !== 'open')
    ) {
      continue;
    }
    const marker = MARKER.exec(body);
    if (marker?.[1] === undefined || marker[2] === undefined) {
      continue;
    }
    const logicalNumber = Number(marker[2]);
    const kind = item?.['pull_request'] === undefined ? 'issue' : 'pull_request';
    if (kind !== marker[1] || found.has(logicalNumber)) {
      throw new Error('The demo repository contains conflicting Gatekeeper seed markers.');
    }
    found.set(logicalNumber, { actualNumber: actualNumber as number, kind, state });
  }
  return found;
}

function resolveReferences(
  body: string,
  logicalNumbers: ReadonlySet<number>,
  discovered: ReadonlyMap<number, { actualNumber: number }>,
): string {
  return body.replace(/#(\d+)\b/gu, (match, digits: string) => {
    const logicalNumber = Number(digits);
    if (!logicalNumbers.has(logicalNumber)) {
      return match;
    }
    const actual = discovered.get(logicalNumber);
    if (actual === undefined) {
      throw new Error(`Seed relationship #${logicalNumber} has not been created yet.`);
    }
    return `#${actual.actualNumber}`;
  });
}

function validateDiscovered(
  operations: readonly SeedOperation[],
  discovered: ReadonlyMap<number, DiscoveredSeed>,
): void {
  const planned = new Map(operations.map((operation) => [operation.logicalNumber, operation]));
  for (const [logicalNumber, existing] of discovered) {
    const operation = planned.get(logicalNumber);
    if (operation === undefined || operation.kind !== existing.kind) {
      throw new Error('A stable marker belongs to an unexpected GitHub object.');
    }
    if (operation.state === 'open' && existing.state === 'closed') {
      throw new Error('A marked live demo object is unexpectedly closed; use a fresh target.');
    }
  }
}

function createdNumber(stdout: string, target: string, kind: SeedOperation['kind']): number {
  let url: URL;
  try {
    url = new URL(stdout.trim());
  } catch {
    throw new Error('GitHub did not return the created object URL.');
  }
  const expectedSegment = kind === 'issue' ? 'issues' : 'pull';
  const parts = url.pathname.split('/').filter(Boolean);
  const number = Number(parts[3]);
  if (
    url.hostname !== 'github.com' ||
    parts.length !== 4 ||
    `${parts[0]}/${parts[1]}`.toLowerCase() !== target.toLowerCase() ||
    parts[2] !== expectedSegment ||
    !Number.isSafeInteger(number) ||
    number <= 0
  ) {
    throw new Error('GitHub returned an unexpected created object URL.');
  }
  return number;
}

async function verifyBranches(
  runGh: RunSeedGh,
  target: string,
  operations: readonly SeedOperation[],
): Promise<void> {
  const heads = new Set(
    operations.flatMap((operation) =>
      operation.kind === 'pull_request' && operation.head !== undefined ? [operation.head] : [],
    ),
  );
  for (const head of heads) {
    let branch: unknown;
    try {
      branch = await executeJson(runGh, [
        'api',
        '--method',
        'GET',
        `repos/${target}/branches/${encodeURIComponent(head)}`,
      ]);
    } catch {
      throw new Error(`The required demo branch ${head} is unavailable; no objects were created.`);
    }
    if (record(branch)?.['name'] !== head) {
      throw new Error(`The required demo branch ${head} is unavailable; no objects were created.`);
    }
  }
}

async function applyOperation(
  runGh: RunSeedGh,
  target: string,
  operation: SeedOperation,
  body: string,
): Promise<number> {
  const arguments_ =
    operation.kind === 'issue'
      ? ['issue', 'create', '--repo', target, '--title', operation.title, '--body', body]
      : [
          'pr',
          'create',
          '--repo',
          target,
          '--title',
          operation.title,
          '--body',
          body,
          '--base',
          operation.base!,
          '--head',
          operation.head!,
        ];
  const response = await runGh(arguments_);
  if (response.exitCode !== 0 || Buffer.byteLength(response.stdout, 'utf8') > 8_192) {
    throw new Error('GitHub could not safely create the marked demo object.');
  }
  return createdNumber(response.stdout, target, operation.kind);
}

async function closeMarkedOperation(
  runGh: RunSeedGh,
  target: string,
  operation: SeedOperation,
  actualNumber: number,
): Promise<void> {
  const response = await runGh([
    operation.kind === 'issue' ? 'issue' : 'pr',
    'close',
    String(actualNumber),
    '--repo',
    target,
  ]);
  if (response.exitCode !== 0) {
    throw new Error('GitHub could not close the marked historical demo object.');
  }
}

export async function runSeedGitHub(
  arguments_: readonly string[],
  dependencies: SeedDependencies = {},
): Promise<SeedOutcome> {
  const { mode, target } = parseArguments(arguments_);
  const write = dependencies.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const operations = createPlan(await loadGhostChangeFixture());

  write(`${mode === 'apply' ? 'APPLY' : 'DRY RUN'} ${target}: ${operations.length} objects`);
  for (const operation of operations) {
    const branch =
      operation.kind === 'pull_request' ? ` (${operation.head} -> ${operation.base})` : '';
    write(`- ${operation.kind} ${operation.marker}${branch} ${operation.title}`);
  }
  if (mode === 'dry-run') {
    write(
      'No GitHub requests were made. Re-run with --apply only after approving this exact target.',
    );
    return { mode, target, planned: operations.length, applied: 0, skipped: 0 };
  }

  const runGh = dependencies.runGh ?? runGhCommand;
  const repository = await executeJson(runGh, ['repo', 'view', target, '--json', 'nameWithOwner']);
  if (record(repository)?.['nameWithOwner']?.toString().toLowerCase() !== target.toLowerCase()) {
    throw new Error('GitHub resolved a different repository than the approved target.');
  }
  await verifyBranches(runGh, target, operations);
  const discovered = await discover(runGh, target);
  validateDiscovered(operations, discovered);
  const logicalNumbers = new Set(operations.map(({ logicalNumber }) => logicalNumber));
  let applied = 0;
  let skipped = 0;
  for (const operation of operations) {
    const existing = discovered.get(operation.logicalNumber);
    if (existing !== undefined) {
      if (operation.state === 'closed' && existing.state === 'open') {
        await closeMarkedOperation(runGh, target, operation, existing.actualNumber);
        existing.state = 'closed';
        applied += 1;
        continue;
      }
      skipped += 1;
      continue;
    }
    const body = resolveReferences(operation.body, logicalNumbers, discovered);
    const actualNumber = await applyOperation(runGh, target, operation, body);
    if (operation.state === 'closed') {
      await closeMarkedOperation(runGh, target, operation, actualNumber);
    }
    discovered.set(operation.logicalNumber, {
      actualNumber,
      kind: operation.kind,
      state: operation.state,
    });
    applied += 1;
  }
  write(`Applied ${applied}; skipped ${skipped} existing marked objects.`);
  return { mode, target, planned: operations.length, applied, skipped };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runSeedGitHub(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Seeder failed.'}\n`);
    process.exitCode = 1;
  });
}
