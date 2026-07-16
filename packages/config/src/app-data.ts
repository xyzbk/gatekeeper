import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';

interface AppDataEnvironment {
  env: Readonly<Record<string, string | undefined>>;
  home: string;
  platform: NodeJS.Platform;
}

export function resolveAppDataPath(
  environment: AppDataEnvironment = {
    env: process.env,
    home: homedir(),
    platform: process.platform,
  },
): string {
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
