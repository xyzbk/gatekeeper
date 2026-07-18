import { posix, win32 } from 'node:path';

import envPaths from 'env-paths';

interface AppDataEnvironment {
  env: Readonly<Record<string, string | undefined>>;
  home: string;
  platform: NodeJS.Platform;
}

export function resolveAppDataPath(environment?: AppDataEnvironment): string {
  if (environment === undefined) {
    return envPaths('Gatekeeper', { suffix: '' }).data;
  }

  if (environment.platform === 'win32') {
    return win32.join(
      environment.env.LOCALAPPDATA?.trim() || win32.join(environment.home, 'AppData', 'Local'),
      'Gatekeeper',
    );
  }

  if (environment.platform === 'darwin') {
    return posix.join(environment.home, 'Library', 'Application Support', 'Gatekeeper');
  }

  return posix.join(
    environment.env.XDG_DATA_HOME?.trim() || posix.join(environment.home, '.local', 'share'),
    'gatekeeper',
  );
}

export interface ServicePaths {
  appData: string;
  serviceMetadata: string;
  storage: string;
}

export function resolveServicePaths(appData = resolveAppDataPath()): ServicePaths {
  const path = /^[A-Za-z]:[\\/]|^\\\\/.test(appData) ? win32 : posix;

  return {
    appData,
    serviceMetadata: path.join(appData, 'service.json'),
    storage: path.join(appData, 'storage'),
  };
}

export function resolveProjectMemoryDatabasePath(appData = resolveAppDataPath()): string {
  const { storage } = resolveServicePaths(appData);
  const path = /^[A-Za-z]:[\\/]|^\\\\/.test(storage) ? win32 : posix;
  return path.join(storage, 'project-memory.sqlite3');
}
