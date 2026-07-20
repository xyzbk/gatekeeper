import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type * as ChildProcess from 'node:child_process';

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));

vi.mock('node:child_process', () => ({ execFile: execFileMock }));

const { execFile: actualExecFile } = await vi.importActual<typeof ChildProcess>(
  'node:child_process',
);

import { startJudgeDemo } from './judge-demo.js';

describe('judge demo process safety', () => {
  it('bounds every disposable-repository Git invocation', async () => {
    execFileMock.mockImplementation(
      (
        file: string,
        arguments_: readonly string[],
        options: unknown,
        callback: (error: Error | null, result?: { stderr: string; stdout: string }) => void,
      ) =>
        actualExecFile(file, arguments_, options as never, (error, stdout, stderr) =>
          callback(error, {
            stderr: String(stderr),
            stdout: String(stdout),
          }),
        ),
    );
    const dashboardRoot = await createDashboardFixture();
    const demo = await startJudgeDemo({ dashboardRoot });

    try {
      const options: unknown[] = execFileMock.mock.calls.map((call) => call[2] as unknown);

      expect(options).not.toHaveLength(0);
      for (const option of options) {
        expect(option).toEqual(expect.objectContaining({ timeout: 30_000 }));
      }
    } finally {
      await demo.close();
      await rm(dashboardRoot, { recursive: true, force: true });
    }
  });
});

async function createDashboardFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'gatekeeper-judge-dashboard-'));
  await writeFile(join(root, 'index.html'), '<main>Gatekeeper judge dashboard</main>', 'utf8');
  return root;
}
