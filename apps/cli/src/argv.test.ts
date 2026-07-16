import { expect, it } from 'vitest';

it('removes the pnpm separator before Commander parses arguments', async () => {
  const { normalizeArgv } = await import('./argv.js');

  expect(normalizeArgv(['node', 'gatekeeper', '--', '--help'])).toEqual([
    'node',
    'gatekeeper',
    '--help',
  ]);
});
