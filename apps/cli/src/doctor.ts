import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

import { resolveAppDataPath, resolveProjectMemoryDatabasePath } from '@gatekeeper/config';

export type DoctorCheckStatus = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  message: string;
  name: 'node' | 'pnpm' | 'git' | 'gh' | 'appData' | 'betterSqlite3' | 'database' | 'fts5';
  required: boolean;
  status: DoctorCheckStatus;
  repair?: string;
}

export interface DoctorResult {
  checks: DoctorCheck[];
  status: 'ok' | 'degraded' | 'failed';
}

export interface DoctorDependencies {
  appDataPath: string;
  commandExists: (command: string) => Promise<boolean>;
  databasePath: string;
  ensureWritable: (path: string) => Promise<void>;
  nodeVersion: string;
  probeProjectMemory: (databasePath: string) => Promise<ProjectMemoryProbe>;
}

export interface ProjectMemoryProbe {
  betterSqlite3: boolean;
  database: boolean;
  fts5: boolean;
  journalMode: string | null;
}

function defaultCommandExists(command: string): Promise<boolean> {
  const executable = process.platform === 'win32' ? 'where.exe' : 'which';

  return new Promise((resolve) => {
    const child = spawn(executable, [command], { stdio: 'ignore', windowsHide: true });
    child.once('error', () => resolve(false));
    child.once('exit', (code) => resolve(code === 0));
  });
}

async function defaultEnsureWritable(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
  await access(path, constants.W_OK);
}

async function defaultProbeProjectMemory(databasePath: string): Promise<ProjectMemoryProbe> {
  const sqlite = await import('@gatekeeper/store-sqlite').catch(() => null);
  if (sqlite === null) {
    return { betterSqlite3: false, database: false, fts5: false, journalMode: null };
  }

  let store: ReturnType<typeof sqlite.openSqliteProjectStore>;
  try {
    store = sqlite.openSqliteProjectStore({ databasePath });
  } catch {
    return { betterSqlite3: true, database: false, fts5: false, journalMode: null };
  }

  try {
    store.migrate();
    const capabilities = store.capabilities();
    return {
      betterSqlite3: true,
      database: true,
      fts5: capabilities.fts5,
      journalMode: capabilities.journalMode,
    };
  } catch {
    return { betterSqlite3: true, database: true, fts5: false, journalMode: null };
  } finally {
    store.close();
  }
}

const defaultDependencies: DoctorDependencies = {
  appDataPath: resolveAppDataPath(),
  commandExists: defaultCommandExists,
  databasePath: resolveProjectMemoryDatabasePath(),
  ensureWritable: defaultEnsureWritable,
  nodeVersion: process.version,
  probeProjectMemory: defaultProbeProjectMemory,
};

export async function runDoctor(
  dependencies: DoctorDependencies = defaultDependencies,
): Promise<DoctorResult> {
  const nodeMajor = Number.parseInt(
    dependencies.nodeVersion.replace(/^v/, '').split('.')[0] ?? '',
    10,
  );
  const checks: DoctorCheck[] = [
    nodeMajor === 24
      ? { name: 'node', required: true, status: 'pass', message: dependencies.nodeVersion }
      : {
          name: 'node',
          required: true,
          status: 'fail',
          message: `Expected Node 24; found ${dependencies.nodeVersion}.`,
          repair: 'Install and activate Node.js 24 LTS.',
        },
  ];

  const commandResults = await Promise.all(
    (['pnpm', 'git', 'gh'] as const).map(async (name) => ({
      name,
      available: await dependencies.commandExists(name),
    })),
  );

  for (const { available, name } of commandResults) {
    const required = name !== 'gh';
    checks.push(
      available
        ? { name, required, status: 'pass', message: `${name} is available.` }
        : {
            name,
            required,
            status: required ? 'fail' : 'warn',
            message: `${name} is not available.`,
            repair: `Install ${name} and add it to PATH.`,
          },
    );
  }

  try {
    await dependencies.ensureWritable(dependencies.appDataPath);
    checks.push({
      name: 'appData',
      required: true,
      status: 'pass',
      message: dependencies.appDataPath,
    });
  } catch {
    checks.push({
      name: 'appData',
      required: true,
      status: 'fail',
      message: `App-data path is not writable: ${dependencies.appDataPath}`,
      repair: 'Choose a writable user app-data location.',
    });
  }

  const projectMemory = await dependencies.probeProjectMemory(dependencies.databasePath);
  checks.push(
    projectMemory.betterSqlite3
      ? {
          name: 'betterSqlite3',
          required: true,
          status: 'pass',
          message: 'The native SQLite driver is loadable.',
        }
      : {
          name: 'betterSqlite3',
          required: true,
          status: 'fail',
          message: 'The native SQLite driver is not loadable.',
          repair: 'Reinstall Gatekeeper dependencies for Node.js 24.',
        },
    projectMemory.database && projectMemory.journalMode === 'wal'
      ? {
          name: 'database',
          required: true,
          status: 'pass',
          message: `${dependencies.databasePath} (WAL)`,
        }
      : {
          name: 'database',
          required: true,
          status: 'fail',
          message: 'The Project Memory database is not writable in WAL mode.',
          repair: 'Repair or remove the local Project Memory database, then run doctor again.',
        },
    projectMemory.fts5
      ? {
          name: 'fts5',
          required: true,
          status: 'pass',
          message: 'SQLite FTS5 is available.',
        }
      : {
          name: 'fts5',
          required: true,
          status: 'fail',
          message: 'SQLite FTS5 is unavailable.',
          repair: 'Install the supported Gatekeeper SQLite build.',
        },
  );

  return {
    checks,
    status: checks.some(({ status }) => status === 'fail')
      ? 'failed'
      : checks.some(({ status }) => status === 'warn')
        ? 'degraded'
        : 'ok',
  };
}
