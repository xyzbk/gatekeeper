import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));

vi.mock('node:child_process', () => ({ execFile: execFileMock }));

import { startJudgeDemo } from './judge-demo.js';

describe('judge demo process safety', () => {
  it('bounds every disposable-repository Git invocation', async () => {
    execFileMock.mockImplementation(
      (
        _file: string,
        arguments_: readonly string[],
        _options: unknown,
        callback: (error: Error | null, result?: { stderr: string; stdout: string }) => void,
      ) =>
        callback(null, {
          stderr: '',
          stdout: arguments_.includes('rev-parse') ? 'a'.repeat(40) : '',
        }),
    );
    const dashboardRoot = await createDashboardFixture();
    const demo = await startJudgeDemo({ dashboardRoot });

    try {
      const options: unknown[] = execFileMock.mock.calls.map((call) => call[2] as unknown);

      expect(options).toEqual(
        expect.arrayContaining([expect.objectContaining({ timeout: 30_000 })]),
      );
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
