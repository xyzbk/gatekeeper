import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

const manifestPath = fileURLToPath(new URL('../package.json', import.meta.url));
const windowsLauncherPath = fileURLToPath(new URL('../Judge Gatekeeper Demo.cmd', import.meta.url));
const ciWorkflowPath = fileURLToPath(new URL('../.github/workflows/ci.yml', import.meta.url));

test('exposes one command for a clean local judge evaluation', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    scripts?: Record<string, string>;
  };

  expect(manifest.scripts?.judge).toBe(
    'pnpm install --frozen-lockfile && pnpm build && pnpm demo:smoke && pnpm demo',
  );
});

test('provides a Windows double-click wrapper for the judge command', async () => {
  const launcher = await readFile(windowsLauncherPath, 'utf8').catch(() => '');

  expect(launcher.replace(/\r\n/gu, '\n')).toBe(
    '@echo off\ncall pnpm run judge\nexit /b %ERRORLEVEL%\n',
  );
});

test('runs the offline judge smoke check in continuous integration', async () => {
  const workflow = await readFile(ciWorkflowPath, 'utf8');

  expect(workflow).toMatch(/^ {6}- run: pnpm demo:smoke$/mu);
});
