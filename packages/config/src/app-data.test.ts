import { expect, it } from 'vitest';

it('resolves Gatekeeper state outside the repository path', async () => {
  const { resolveAppDataPath } = await import('./app-data.js');

  expect(
    resolveAppDataPath({
      platform: 'linux',
      home: '/home/tester',
      env: {},
    }),
  ).toBe('/home/tester/.local/share/gatekeeper');
});

it('treats an empty data-home variable as unset', async () => {
  const { resolveAppDataPath } = await import('./app-data.js');

  expect(
    resolveAppDataPath({
      platform: 'linux',
      home: '/home/tester',
      env: { XDG_DATA_HOME: '' },
    }),
  ).toBe('/home/tester/.local/share/gatekeeper');
});
