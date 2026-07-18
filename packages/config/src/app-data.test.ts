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

it('derives all service paths from one machine-local root', async () => {
  const { resolveProjectMemoryDatabasePath, resolveServicePaths } = await import('./app-data.js');

  expect(resolveServicePaths('/var/lib/gatekeeper')).toEqual({
    appData: '/var/lib/gatekeeper',
    serviceMetadata: '/var/lib/gatekeeper/service.json',
    storage: '/var/lib/gatekeeper/storage',
  });
  expect(resolveProjectMemoryDatabasePath('/var/lib/gatekeeper')).toBe(
    '/var/lib/gatekeeper/storage/project-memory.sqlite3',
  );
  expect(resolveProjectMemoryDatabasePath('C:\\Users\\tester\\Gatekeeper')).toBe(
    'C:\\Users\\tester\\Gatekeeper\\storage\\project-memory.sqlite3',
  );
});
