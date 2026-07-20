import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const replayRoot = fileURLToPath(new URL('./fixtures/replay', import.meta.url));

async function git(arguments_: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', [...arguments_], {
    cwd: replayRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  return result.stdout.trim();
}

describe('prepare fixtures', () => {
  it('creates the disposable Codex replay with a rejected Redis history and dirty Redis revival', async () => {
    await execFileAsync(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'demo/prepare-fixtures.ts'],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        windowsHide: true,
      },
    );

    await expect(git(['log', '--format=%s'])).resolves.toContain('propose required redis cache');
    await expect(git(['log', '--format=%s'])).resolves.toContain('keep redis optional with sqlite');
    await expect(
      readFile(join(replayRoot, 'docs/adr/0003-no-required-redis.md'), 'utf8'),
    ).resolves.toContain('SQLite remains the durable local store.');
    await expect(readFile(join(replayRoot, 'src/cache.ts'), 'utf8')).resolves.toContain(
      "export const cache = 'redis-required';",
    );
    await expect(readFile(join(replayRoot, 'tests/cache.test.ts'), 'utf8')).resolves.toContain(
      "expect(cache).toBe('redis-required');",
    );
    await expect(git(['status', '--short'])).resolves.toContain('src/cache.ts');
    await expect(git(['status', '--short'])).resolves.toContain('tests/cache.test.ts');
  });
});
