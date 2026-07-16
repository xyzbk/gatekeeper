import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

import { resolveAppDataPath } from '@gatekeeper/config';

export type DoctorCheckStatus = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  message: string;
  name: 'node' | 'pnpm' | 'git' | 'gh' | 'appData';
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
  ensureWritable: (path: string) => Promise<void>;
  nodeVersion: string;
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

const defaultDependencies: DoctorDependencies = {
  appDataPath: resolveAppDataPath(),
  commandExists: defaultCommandExists,
  ensureWritable: defaultEnsureWritable,
  nodeVersion: process.version,
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

  return {
    checks,
    status: checks.some(({ status }) => status === 'fail')
      ? 'failed'
      : checks.some(({ status }) => status === 'warn')
        ? 'degraded'
        : 'ok',
  };
}
